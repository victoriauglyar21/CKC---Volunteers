import { supabase } from "../../supabaseClient";
import { ADMIN_DROPPED_NOTIFICATION_WINDOW_MS } from "../constants";
import { getNotificationDismissToken, getNotificationSortTimestamp } from "../utils";
import type { ShiftAssignmentDetail } from "../types";

const NOTIFICATION_SELECT = `
  id,
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

export type FetchNotificationsInput = {
  sessionUserId: string;
  role: string | null | undefined;
  isPrimaryAdminAccount: boolean;
  dismissedTokens: Set<string>;
};

export async function fetchNotificationsData(input: FetchNotificationsInput) {
  let rawItems: ShiftAssignmentDetail[] = [];

  if (input.isPrimaryAdminAccount) {
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

  const items = rawItems
    .filter((item) => {
      if (input.isPrimaryAdminAccount) {
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
    .filter((item) => !input.dismissedTokens.has(getNotificationDismissToken(item)))
    .sort((left, right) => getNotificationSortTimestamp(right) - getNotificationSortTimestamp(left));

  return { items, error: null };
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
