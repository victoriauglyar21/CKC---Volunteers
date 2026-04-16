import { supabase } from "../../supabaseClient";
import { ADMIN_DROPPED_NOTIFICATION_WINDOW_MS, APPOINTMENT_NOTIFICATION_WINDOW_MS } from "../constants";
import { getNotificationDismissToken, getNotificationSortTimestamp } from "../utils";
import type {
  AppNotificationItem,
  AppointmentNotificationItem,
  LeadNeededNotificationItem,
  ShiftAssignmentDetail,
} from "../types";

const NOTIFICATION_SELECT = `
  id,
  shift_instance_id,
  created_at,
  dropped_at,
  status,
  dropped_reason,
  assignment_role,
  volunteer:profiles (
    id,
    full_name,
    preferred_name,
    role
  ),
  shift_instance:shift_instances (
    id,
    shift_date,
    starts_at,
    ends_at,
    template:shift_templates (
      id,
      title
    )
  )
`;

const APPOINTMENT_NOTIFICATION_SELECT = `
  id,
  shift_instance_id,
  title,
  description,
  color,
  starts_at,
  ends_at,
  created_at,
  updated_at,
  shift_instance:shift_instances (
    id,
    shift_date,
    starts_at,
    ends_at,
    template:shift_templates (
      id,
      title
    )
  )
`;

const LEAD_NEEDED_NOTIFICATION_SELECT = `
  id,
  created_at,
  notification_type,
  shift_instance_id,
  shift_instance:shift_instances (
    id,
    shift_date,
    starts_at,
    ends_at,
    template:shift_templates (
      id,
      title
    )
  )
`;

export type FetchNotificationsInput = {
  sessionUserId: string;
  role: string | null | undefined;
  isAdminAccount: boolean;
  dismissedTokens: Set<string>;
};

export async function fetchNotificationsData(input: FetchNotificationsInput) {
  let rawItems: ShiftAssignmentDetail[] = [];

  if (input.isAdminAccount) {
    const { data, error } = await supabase
      .from("shift_assignments")
      .select(NOTIFICATION_SELECT)
      .in("status", ["pending", "dropped"])
      .order("created_at", { ascending: true });

    if (error) {
      return { items: [] as ShiftAssignmentDetail[], error: error.message };
    }
    rawItems = (data as ShiftAssignmentDetail[]) ?? [];
  } else if (input.role === "Lead") {
    const { data, error } = await supabase
      .from("shift_assignments")
      .select(NOTIFICATION_SELECT)
      .eq("volunteer_id", input.sessionUserId)
      .in("status", ["active", "dropped"]);

    if (error) {
      return { items: [] as ShiftAssignmentDetail[], error: error.message };
    }
    rawItems = (data as ShiftAssignmentDetail[]) ?? [];
  } else {
    const { data, error } = await supabase
      .from("shift_assignments")
      .select(NOTIFICATION_SELECT)
      .eq("volunteer_id", input.sessionUserId)
      .in("status", ["active", "dropped"])
      .order("created_at", { ascending: false });

    if (error) {
      return { items: [] as ShiftAssignmentDetail[], error: error.message };
    }
    rawItems = (data as ShiftAssignmentDetail[]) ?? [];
  }

  const assignmentItems = rawItems
    .filter((item) => {
      if (input.isAdminAccount) {
        if (item.status === "pending") return true;
        if (item.status !== "dropped") return false;
        const droppedAt = item.dropped_at ?? item.created_at ?? "";
        const droppedTs = Date.parse(droppedAt);
        if (Number.isNaN(droppedTs)) return false;
        return Date.now() - droppedTs <= ADMIN_DROPPED_NOTIFICATION_WINDOW_MS;
      }

      if (item.status === "dropped") return true;
      if (item.status !== "active") return false;
      const createdAt = item.created_at ? Date.parse(item.created_at) : NaN;
      if (Number.isNaN(createdAt)) return false;
      return Date.now() - createdAt <= 5 * 60 * 1000;
    })
    .filter((item) => !input.dismissedTokens.has(getNotificationDismissToken(item)));

  const { items: appointmentItems, error: appointmentError } = await fetchAppointmentNotificationItems(input);
  if (appointmentError) {
    return { items: [] as AppNotificationItem[], error: appointmentError };
  }

  const { items: leadNeededItems, error: leadNeededError } = await fetchLeadNeededNotificationItems(input);
  if (leadNeededError) {
    return { items: [] as AppNotificationItem[], error: leadNeededError };
  }

  const items = [...assignmentItems, ...appointmentItems, ...leadNeededItems].sort(
    (left, right) => getNotificationSortTimestamp(right) - getNotificationSortTimestamp(left),
  );

  return { items, error: null };
}

type AppointmentNotificationRow = {
  id: string;
  shift_instance_id: number | null;
  title: string | null;
  description: string | null;
  color: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  shift_instance: AppointmentNotificationItem["shift_instance"] | AppointmentNotificationItem["shift_instance"][];
};

async function fetchAppointmentNotificationItems(input: FetchNotificationsInput) {
  if (!input.isAdminAccount && input.role !== "Lead") {
    return { items: [] as AppointmentNotificationItem[], error: null as string | null };
  }

  const cutoffIso = new Date(Date.now() - APPOINTMENT_NOTIFICATION_WINDOW_MS).toISOString();
  let allowedInstanceIds: number[] | null = null;

  if (!input.isAdminAccount && input.role === "Lead") {
    const { data: leadAssignments, error: leadAssignmentsError } = await supabase
      .from("shift_assignments")
      .select("shift_instance_id")
      .eq("volunteer_id", input.sessionUserId)
      .eq("assignment_role", "lead")
      .eq("status", "active");

    if (leadAssignmentsError) {
      return { items: [] as AppointmentNotificationItem[], error: leadAssignmentsError.message };
    }

    allowedInstanceIds = Array.from(
      new Set(
        ((leadAssignments as { shift_instance_id: number | null }[] | null) ?? [])
          .map((row) => row.shift_instance_id)
          .filter((value): value is number => Number.isInteger(value)),
      ),
    );

    if (allowedInstanceIds.length === 0) {
      return { items: [] as AppointmentNotificationItem[], error: null as string | null };
    }
  }

  let query = supabase
    .from("shift_appointments")
    .select(APPOINTMENT_NOTIFICATION_SELECT)
    .gte("updated_at", cutoffIso)
    .order("updated_at", { ascending: false });

  if (allowedInstanceIds && allowedInstanceIds.length > 0) {
    query = query.in("shift_instance_id", allowedInstanceIds);
  }

  const { data, error } = await query;
  if (error) {
    return { items: [] as AppointmentNotificationItem[], error: error.message };
  }

  const items = ((data as AppointmentNotificationRow[] | null) ?? [])
    .map((row): AppointmentNotificationItem | null => {
      const normalizedShiftInstance = Array.isArray(row.shift_instance)
        ? (row.shift_instance[0] ?? null)
        : (row.shift_instance ?? null);
      const createdAtMs = row.created_at ? Date.parse(row.created_at) : NaN;
      const updatedAtMs = row.updated_at ? Date.parse(row.updated_at) : NaN;
      const eventType =
        Number.isFinite(createdAtMs) &&
        Number.isFinite(updatedAtMs) &&
        Math.abs(updatedAtMs - createdAtMs) > 1500
          ? "updated"
          : "created";
      const item: AppointmentNotificationItem = {
        notification_kind: "appointment",
        id: `appointment:${row.id}:${row.updated_at ?? row.created_at ?? ""}`,
        appointment_id: row.id,
        shift_instance_id: row.shift_instance_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        title: row.title ?? "Appointment",
        description: row.description,
        color: row.color,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        event_type: eventType,
        shift_instance: normalizedShiftInstance,
      };
      return item;
    })
    .filter((item): item is AppointmentNotificationItem => Boolean(item))
    .filter((item) => !input.dismissedTokens.has(getNotificationDismissToken(item)));

  return { items, error: null as string | null };
}

type LeadNeededNotificationRow = {
  id: string | number;
  created_at: string | null;
  notification_type: "lead_needed" | "lead_needed_test" | null;
  shift_instance_id: number | null;
  shift_instance:
    | LeadNeededNotificationItem["shift_instance"]
    | LeadNeededNotificationItem["shift_instance"][];
};

async function fetchLeadNeededNotificationItems(input: FetchNotificationsInput) {
  if (input.role !== "Lead") {
    return { items: [] as LeadNeededNotificationItem[], error: null as string | null };
  }

  const cutoffIso = new Date(Date.now() - APPOINTMENT_NOTIFICATION_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("shift_notification_sends")
    .select(LEAD_NEEDED_NOTIFICATION_SELECT)
    .in("notification_type", ["lead_needed", "lead_needed_test"])
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false });

  if (error) {
    return { items: [] as LeadNeededNotificationItem[], error: error.message };
  }

  const items = ((data as LeadNeededNotificationRow[] | null) ?? [])
    .map((row): LeadNeededNotificationItem | null => {
      if (row.notification_type !== "lead_needed" && row.notification_type !== "lead_needed_test") {
        return null;
      }
      const shiftInstance = Array.isArray(row.shift_instance)
        ? (row.shift_instance[0] ?? null)
        : (row.shift_instance ?? null);
      return {
        notification_kind: "lead_needed",
        id: `lead-needed:${row.id}`,
        created_at: row.created_at,
        notification_type: row.notification_type,
        shift_instance_id: row.shift_instance_id,
        shift_instance: shiftInstance,
      };
    })
    .filter((item): item is LeadNeededNotificationItem => Boolean(item))
    .filter((item) => !input.dismissedTokens.has(getNotificationDismissToken(item)));

  return { items, error: null as string | null };
}

export async function fetchAssignmentById(assignmentId: string) {
  const { data, error } = await supabase
    .from("shift_assignments")
    .select(NOTIFICATION_SELECT)
    .eq("id", assignmentId)
    .maybeSingle();

  return {
    data: (data as ShiftAssignmentDetail | null) ?? null,
    error: error?.message ?? null,
  };
}

export async function fetchPendingNotifications() {
  const { data, error } = await supabase
    .from("shift_assignments")
    .select(NOTIFICATION_SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return {
    data: (data as ShiftAssignmentDetail[]) ?? [],
    error: error?.message ?? null,
  };
}

export async function approveNotificationAssignment(assignmentId: string) {
  const { error } = await supabase
    .from("shift_assignments")
    .update({ status: "active" })
    .eq("id", assignmentId);

  return { error: error?.message ?? null };
}

export async function denyNotificationAssignment(assignmentId: string, reason: string) {
  const { error } = await supabase
    .from("shift_assignments")
    .update({
      status: "dropped",
      dropped_at: new Date().toISOString(),
      dropped_reason: reason,
    })
    .eq("id", assignmentId);

  return { error: error?.message ?? null };
}
