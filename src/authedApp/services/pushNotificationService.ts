import { supabase } from "../../supabaseClient";
import type { NotificationSettingKey } from "../constants";
import type { DropDayLeadAssignment } from "../types";
import { getDropAssignmentVolunteerRole, isAdminRole, isLeadAssignmentRole, isLeadRole } from "../utils";

async function getFunctionAuthHeaders() {
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";
  let { data } = await supabase.auth.getSession();
  const expiresAt = (data.session?.expires_at ?? 0) * 1000;
  const isExpiringSoon = expiresAt > 0 && expiresAt < Date.now() + 60_000;

  if (!data.session || isExpiringSoon) {
    const refreshed = await supabase.auth.refreshSession();
    data = refreshed.data;
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return null;
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (anonKey) {
    headers.apikey = anonKey;
  }
  return headers;
}

export async function sendAdminDropPush(message: string) {
  return sendAdminPush({
    title: "Shift dropped",
    body: message,
    url: "/?view=notifications",
  });
}

export async function sendAdminPush({
  title,
  body,
  url = "/?view=notifications",
}: {
  title: string;
  body: string;
  url?: string;
}) {
  const authHeaders = await getFunctionAuthHeaders();
  if (!authHeaders) {
    return "Unauthorized: missing session token. Please log in again.";
  }

  const { error } = await supabase.functions.invoke("send-admin-push", {
    headers: authHeaders,
    body: { title, body, url },
  });
  if (error) {
    console.warn("Failed to send admin push:", error.message);
    return error.message;
  }
  return null;
}

export async function sendVolunteerPush({
  userId,
  title,
  body,
  url = "/?view=notifications",
  notificationType,
  shiftInstanceId,
}: {
  userId: string;
  title: string;
  body: string;
  url?: string;
  notificationType?: NotificationSettingKey;
  shiftInstanceId?: number;
}) {
  const authHeaders = await getFunctionAuthHeaders();
  if (!authHeaders) {
    return "Unauthorized: missing session token. Please log in again.";
  }

  const { data, error } = await supabase.functions.invoke("send-push", {
    headers: authHeaders,
    body: {
      user_id: userId,
      title,
      body,
      url,
      notification_type: notificationType,
      shift_instance_id: shiftInstanceId,
    },
  });

  if (error) {
    console.warn("Failed to send volunteer push:", error.message);
    const errorContext = (error as { context?: { status?: number; statusText?: string; text?: () => Promise<string> } })
      .context;
    if (errorContext) {
      let details = "";
      try {
        if (typeof errorContext.text === "function") {
          details = (await errorContext.text()).trim();
        }
      } catch {
        // Ignore body parse issues and fall back to status text.
      }
      const statusPart =
        typeof errorContext.status === "number"
          ? `${errorContext.status}${errorContext.statusText ? ` ${errorContext.statusText}` : ""}`
          : "";
      const detailPart = details ? `: ${details}` : "";
      if (statusPart || detailPart) {
        return `Edge Function error ${statusPart}${detailPart}`.trim();
      }
    }
    return error.message;
  }
  if (data?.skipped) {
    return "Volunteer has not enabled push notifications.";
  }
  if (typeof data?.sent === "number" && data.sent <= 0) {
    return "Push notification was not delivered.";
  }

  return null;
}

export async function notifyLeadsOnShiftInstance({
  shiftInstanceId,
  excludeVolunteerIds = [],
  title,
  body,
  notificationType,
}: {
  shiftInstanceId: number;
  excludeVolunteerIds?: string[];
  title: string;
  body: string;
  notificationType: NotificationSettingKey;
}) {
  const { data: leadAssignments, error: leadAssignmentsError } = await supabase
    .from("shift_assignments")
    .select(
      `
        volunteer_id,
        assignment_role,
        volunteer:profiles (
          id,
          role
        )
      `,
    )
    .eq("shift_instance_id", shiftInstanceId)
    .eq("status", "active");

  if (leadAssignmentsError) {
    return `lead lookup failed: ${leadAssignmentsError.message}`;
  }

  const excluded = new Set(excludeVolunteerIds);
  const leadIds = Array.from(
    new Set(
      ((leadAssignments as DropDayLeadAssignment[] | null) ?? [])
        .filter(
          (assignment) =>
            !excluded.has(assignment.volunteer_id) &&
            (isLeadAssignmentRole(assignment.assignment_role) ||
              isLeadRole(getDropAssignmentVolunteerRole(assignment)) ||
              isAdminRole(getDropAssignmentVolunteerRole(assignment))),
        )
        .map((assignment) => assignment.volunteer_id),
    ),
  );

  if (leadIds.length === 0) {
    return null;
  }

  const failures: string[] = [];
  for (const leadId of leadIds) {
    const leadPushError = await sendVolunteerPush({
      userId: leadId,
      title,
      body,
      notificationType,
      shiftInstanceId,
    });
    if (leadPushError) {
      failures.push(leadPushError);
    }
  }

  return failures.length > 0 ? `lead notification failed: ${failures.join(" | ")}` : null;
}

export async function notifyActiveMembersOnShiftInstance({
  shiftInstanceId,
  excludeVolunteerIds = [],
  title,
  body,
  notificationType,
}: {
  shiftInstanceId: number;
  excludeVolunteerIds?: string[];
  title: string;
  body: string;
  notificationType: NotificationSettingKey;
}) {
  const { data: activeAssignments, error: activeAssignmentsError } = await supabase
    .from("shift_assignments")
    .select("volunteer_id")
    .eq("shift_instance_id", shiftInstanceId)
    .eq("status", "active");

  if (activeAssignmentsError) {
    return `member lookup failed: ${activeAssignmentsError.message}`;
  }

  const excluded = new Set(excludeVolunteerIds);
  const memberIds = Array.from(
    new Set(
      ((activeAssignments as { volunteer_id: string }[] | null) ?? [])
        .map((assignment) => assignment.volunteer_id)
        .filter((volunteerId) => Boolean(volunteerId) && !excluded.has(volunteerId)),
    ),
  );

  if (memberIds.length === 0) {
    return null;
  }

  const failures: string[] = [];
  for (const memberId of memberIds) {
    const memberPushError = await sendVolunteerPush({
      userId: memberId,
      title,
      body,
      notificationType,
      shiftInstanceId,
    });
    if (memberPushError) {
      failures.push(memberPushError);
    }
  }

  return failures.length > 0 ? `member notification failed: ${failures.join(" | ")}` : null;
}
