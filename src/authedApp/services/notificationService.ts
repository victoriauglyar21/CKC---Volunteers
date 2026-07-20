import { supabase } from "../../supabaseClient";
import {
  ADMIN_DROPPED_NOTIFICATION_WINDOW_MS,
  APPOINTMENT_NOTIFICATION_WINDOW_MS,
  RECURRING_SHIFT_ADDED_REASON,
  RECURRING_SHIFT_CHANGED_DROP_REASON,
  RECURRING_SHIFT_CONTINUED_REASON,
  RECURRING_SHIFT_DELETED_DROP_REASON,
} from "../constants";
import {
  getNotificationDismissToken,
  getNotificationSortTimestamp,
  normalizeOtherAssignmentName,
  parseOtherAssignmentNote,
} from "../utils";
import type {
  AppNotificationItem,
  AppointmentNotificationItem,
  LeadNeededNotificationItem,
  RecurringAssignmentNotificationItem,
  ShadowFollowUpNotificationItem,
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
  completed_at,
  completion_note,
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

const SHADOW_FOLLOW_UP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const ASSIGNMENT_NOTIFICATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const HIDDEN_ASSIGNMENT_NOTIFICATION_DROP_REASONS = new Set([
  RECURRING_SHIFT_ADDED_REASON,
  RECURRING_SHIFT_CHANGED_DROP_REASON,
  RECURRING_SHIFT_CONTINUED_REASON,
  RECURRING_SHIFT_DELETED_DROP_REASON,
]);

type NotificationRecurringRule = {
  template_id: string;
  starts_on: string;
  ends_on: string | null;
  byday: string[] | null;
  repeat_interval_weeks?: number | null;
};

export type FetchNotificationsInput = {
  sessionUserId: string;
  role: string | null | undefined;
  isAdminAccount: boolean;
  dismissedTokens: Set<string>;
};

function getDayCode(dateKey: string | null | undefined) {
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][new Date(year, month - 1, day).getDay()] ?? null;
}

function diffDateKeysInDays(startKey: string, endKey: string) {
  const [startYear, startMonth, startDay] = startKey.split("-").map((part) => Number(part));
  const [endYear, endMonth, endDay] = endKey.split("-").map((part) => Number(part));
  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) return null;
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000));
}

function getAssignmentShiftDateKey(item: ShiftAssignmentDetail) {
  if (item.shift_instance?.shift_date) return item.shift_instance.shift_date;
  if (item.shift_instance?.starts_at) return item.shift_instance.starts_at.slice(0, 10);
  return null;
}

function matchesRecurringRule(item: ShiftAssignmentDetail, rule: NotificationRecurringRule) {
  if (item.shift_instance?.template?.id !== rule.template_id) return false;
  const dateKey = getAssignmentShiftDateKey(item);
  if (!dateKey || dateKey < rule.starts_on) return false;
  if (rule.ends_on && dateKey > rule.ends_on) return false;

  const allowedDays = rule.byday ?? [];
  const dayCode = getDayCode(dateKey);
  if (allowedDays.length > 0 && (!dayCode || !allowedDays.includes(dayCode))) return false;

  const repeatIntervalWeeks = rule.repeat_interval_weeks === 2 ? 2 : 1;
  if (repeatIntervalWeeks <= 1) return true;
  const daysSinceStart = diffDateKeysInDays(rule.starts_on, dateKey);
  if (daysSinceStart === null || daysSinceStart < 0) return false;
  return Math.floor(daysSinceStart / 7) % repeatIntervalWeeks === 0;
}

async function fetchNotificationRecurringRules(input: FetchNotificationsInput) {
  if (input.isAdminAccount) return { items: [] as NotificationRecurringRule[], error: null as string | null };

  const { data, error } = await supabase
    .from("recurring_assignments")
    .select("template_id,starts_on,ends_on,byday,repeat_interval_weeks")
    .eq("volunteer_id", input.sessionUserId);

  return {
    items: ((data as NotificationRecurringRule[] | null) ?? []),
    error: error?.message ?? null,
  };
}

function getRecurringAssignmentEventType(
  item: ShiftAssignmentDetail,
  recurringRules: NotificationRecurringRule[],
) {
  if (item.dropped_reason === RECURRING_SHIFT_DELETED_DROP_REASON) return "removed" as const;
  if (item.dropped_reason === RECURRING_SHIFT_CHANGED_DROP_REASON) return "changed" as const;
  if (
    item.dropped_reason === RECURRING_SHIFT_ADDED_REASON ||
    item.dropped_reason === RECURRING_SHIFT_CONTINUED_REASON ||
    (item.status === "active" && recurringRules.some((rule) => matchesRecurringRule(item, rule)))
  ) {
    return "added" as const;
  }
  return null;
}

function buildRecurringAssignmentNotificationItems(
  items: ShiftAssignmentDetail[],
  recurringRules: NotificationRecurringRule[],
) {
  const byEventAndVolunteer = new Map<string, RecurringAssignmentNotificationItem>();

  items.forEach((item) => {
    const eventType = getRecurringAssignmentEventType(item, recurringRules);
    if (!eventType) return;

    const volunteerId = item.volunteer?.id ?? "unknown";
    const key = `${eventType}:${volunteerId}`;
    const itemTimestamp = getNotificationSortTimestamp(item);
    const current = byEventAndVolunteer.get(key);
    if (!current) {
      byEventAndVolunteer.set(key, {
        notification_kind: "recurring_assignment",
        id: `recurring-assignment:${key}`,
        created_at: item.dropped_at ?? item.created_at ?? null,
        event_type: eventType,
        count: 1,
        shift_instance_id: item.shift_instance_id ?? item.shift_instance?.id ?? null,
        volunteer: item.volunteer,
        shift_instance: item.shift_instance,
      });
      return;
    }

    current.count += 1;
    const currentTimestamp = getNotificationSortTimestamp(current);
    if (itemTimestamp > currentTimestamp) {
      current.created_at = item.dropped_at ?? item.created_at ?? null;
      current.shift_instance_id = item.shift_instance_id ?? item.shift_instance?.id ?? null;
      current.shift_instance = item.shift_instance;
    }
  });

  return Array.from(byEventAndVolunteer.values());
}

export async function fetchNotificationsData(input: FetchNotificationsInput) {
  let rawItems: ShiftAssignmentDetail[] = [];

  if (input.isAdminAccount) {
    const { data, error } = await supabase
      .from("shift_assignments")
      .select(NOTIFICATION_SELECT)
      .in("status", ["pending", "dropped", "active"])
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

  const { items: recurringRules, error: recurringRulesError } = await fetchNotificationRecurringRules(input);
  if (recurringRulesError) {
    return { items: [] as AppNotificationItem[], error: recurringRulesError };
  }

  const recurringAssignmentItems = buildRecurringAssignmentNotificationItems(rawItems, recurringRules)
    .filter((item) => !input.dismissedTokens.has(getNotificationDismissToken(item)));

  const assignmentItems = rawItems
    .filter((item) => {
      if (
        (item.status === "active" || item.status === "dropped") &&
        item.dropped_reason &&
        HIDDEN_ASSIGNMENT_NOTIFICATION_DROP_REASONS.has(item.dropped_reason)
      ) {
        return false;
      }
      if (
        item.status === "active" &&
        recurringRules.some((rule) => matchesRecurringRule(item, rule))
      ) {
        return false;
      }

      if (input.isAdminAccount) {
        if (item.status === "pending") return true;
        if (item.status !== "dropped") return false;
        const droppedAt = item.dropped_at ?? item.created_at ?? "";
        const droppedTs = Date.parse(droppedAt);
        if (Number.isNaN(droppedTs)) return false;
        return Date.now() - droppedTs <= ADMIN_DROPPED_NOTIFICATION_WINDOW_MS;
      }

      if (item.status === "dropped") {
        const droppedAt = item.dropped_at ?? item.created_at ?? "";
        const droppedTs = Date.parse(droppedAt);
        if (Number.isNaN(droppedTs)) return false;
        return Date.now() - droppedTs <= ADMIN_DROPPED_NOTIFICATION_WINDOW_MS;
      }
      if (item.status !== "active") return false;
      const createdAt = item.created_at ? Date.parse(item.created_at) : NaN;
      if (Number.isNaN(createdAt)) return false;
      return Date.now() - createdAt <= ASSIGNMENT_NOTIFICATION_WINDOW_MS;
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

  const { items: shadowFollowUpItems, error: shadowFollowUpError } =
    await fetchShadowFollowUpNotificationItems(input);
  if (shadowFollowUpError) {
    return { items: [] as AppNotificationItem[], error: shadowFollowUpError };
  }

  const items = [
    ...recurringAssignmentItems,
    ...assignmentItems,
    ...appointmentItems,
    ...leadNeededItems,
    ...shadowFollowUpItems,
  ].sort((left, right) => getNotificationSortTimestamp(right) - getNotificationSortTimestamp(left));

  return { items, error: null };
}

type ShadowFollowUpAssignmentRow = {
  id: string;
  shift_instance_id: number | null;
  created_at: string | null;
  volunteer_id: string | null;
  notes: string | null;
  volunteer:
    | ShadowFollowUpNotificationItem["volunteer"]
    | ShadowFollowUpNotificationItem["volunteer"][];
  shift_instance:
    | ShadowFollowUpNotificationItem["shift_instance"]
    | ShadowFollowUpNotificationItem["shift_instance"][];
};

function getShiftEndMs(shiftInstance: ShadowFollowUpNotificationItem["shift_instance"]) {
  const endValue = shiftInstance?.ends_at ?? shiftInstance?.starts_at ?? shiftInstance?.shift_date ?? "";
  const parsed = Date.parse(endValue);
  return Number.isNaN(parsed) ? null : parsed;
}

async function fetchShadowFollowUpNotificationItems(input: FetchNotificationsInput) {
  if (!input.isAdminAccount) {
    return { items: [] as ShadowFollowUpNotificationItem[], error: null as string | null };
  }

  const { data, error } = await supabase
    .from("shift_assignments")
    .select(
      `
      id,
      shift_instance_id,
      created_at,
      volunteer_id,
      notes,
      volunteer:profiles (
        id,
        full_name,
        preferred_name,
        role,
        phone
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
    `,
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    return { items: [] as ShadowFollowUpNotificationItem[], error: error.message };
  }

  const now = Date.now();
  const byShadowName = new Map<
    string,
    { count: number; latest: ShadowFollowUpNotificationItem | null }
  >();
  ((data as ShadowFollowUpAssignmentRow[] | null) ?? []).forEach((row) => {
    const parsedNote = parseOtherAssignmentNote(row.notes);
    const volunteer = Array.isArray(row.volunteer) ? (row.volunteer[0] ?? null) : row.volunteer;
    const volunteerName = volunteer?.preferred_name || volunteer?.full_name || null;
    const shadowName = volunteerName ?? parsedNote.name;
    if (!parsedNote.isShadowShift || !shadowName) return;

    const shiftInstance = Array.isArray(row.shift_instance)
      ? (row.shift_instance[0] ?? null)
      : row.shift_instance;

    const shiftEndMs = getShiftEndMs(shiftInstance);
    if (!shiftEndMs || shiftEndMs > now) return;

    const shadowNameKey = row.volunteer_id
      ? `volunteer:${row.volunteer_id}`
      : `name:${normalizeOtherAssignmentName(parsedNote.name)}`;
    if (!shadowNameKey) return;
    const item: ShadowFollowUpNotificationItem = {
      notification_kind: "shadow_follow_up",
      id: `shadow-follow-up:${shadowNameKey}:${row.shift_instance_id ?? shiftInstance?.id ?? row.id}`,
      created_at: row.created_at,
      shift_instance_id: row.shift_instance_id ?? shiftInstance?.id ?? null,
      shadow_name: shadowName,
      shadow_count: 0,
      volunteer,
      shift_instance: shiftInstance,
    };
    const current = byShadowName.get(shadowNameKey) ?? { count: 0, latest: null };
    current.count += 1;
    if (!current.latest || getNotificationSortTimestamp(item) > getNotificationSortTimestamp(current.latest)) {
      current.latest = item;
    }
    byShadowName.set(shadowNameKey, current);
  });

  const items = Array.from(byShadowName.values())
    .map(({ count, latest }) => {
      if (!latest || count < 2) return null;
      const latestEndMs = getShiftEndMs(latest.shift_instance);
      if (!latestEndMs || now - latestEndMs > SHADOW_FOLLOW_UP_WINDOW_MS) return null;
      return { ...latest, shadow_count: count };
    })
    .filter((item): item is ShadowFollowUpNotificationItem => Boolean(item))
    .filter((item) => !input.dismissedTokens.has(getNotificationDismissToken(item)));

  return { items, error: null as string | null };
}

type AppointmentNotificationRow = {
  id: string;
  shift_instance_id: number | null;
  title: string | null;
  description: string | null;
  color: string | null;
  starts_at: string | null;
  ends_at: string | null;
  completed_at: string | null;
  completion_note: string | null;
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
      const completedAtMs = row.completed_at ? Date.parse(row.completed_at) : NaN;
      const eventType =
        Number.isFinite(completedAtMs) &&
        Number.isFinite(updatedAtMs) &&
        Math.abs(updatedAtMs - completedAtMs) <= 2500
          ? "completed"
          : Number.isFinite(createdAtMs) &&
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
        completed_at: row.completed_at,
        completion_note: row.completion_note,
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
