import { serve } from "https://deno.land/std@0.204.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const DEFAULT_SHIFT_TIMEZONE = Deno.env.get("DEFAULT_SHIFT_TIMEZONE") ?? "UTC";
const PRIMARY_ADMIN_EMAIL = "victoriauglyar21@gmail.com";
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const hasPushConfig = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
const supabaseAdmin = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;
let pushConfigured = false;

type NotificationSettings = Record<string, boolean> | null | undefined;

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
};

type ReminderTarget = {
  userId: string;
  shiftInstanceId: number;
  startsAt: string;
  title: string | null;
};

type ManualTriggerInput = {
  mode?: string;
};

type ShiftRow = {
  id: number;
  starts_at: string | null;
  shift_date: string | null;
  template:
    | {
        title: string | null;
        timezone: string | null;
      }
    | {
        title: string | null;
        timezone: string | null;
      }[]
    | null;
};

type ActiveAssignmentRow = {
  shift_instance_id: number | null;
  assignment_role: string | null;
  volunteer:
    | {
        role: string | null;
      }
    | {
        role: string | null;
      }[]
    | null;
};

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeTemplate(template: ShiftRow["template"]) {
  return Array.isArray(template) ? (template[0] ?? null) : template;
}

function getTimezone(templateTimezone: string | null | undefined) {
  const candidate = templateTimezone?.trim();
  return candidate || DEFAULT_SHIFT_TIMEZONE;
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

function getDateKeyFromParts(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getShiftPeriodLabel(startsAt: string | null, timeZone: string) {
  if (!startsAt) return "AM";
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "AM";
  return getZonedParts(start, timeZone).hour >= 12 ? "PM" : "AM";
}

async function recordNotificationSend({
  shiftInstanceId,
  volunteerId,
  notificationType,
  sendKey,
}: {
  shiftInstanceId: number;
  volunteerId: string | null;
  notificationType: string;
  sendKey: string;
}) {
  if (!supabaseAdmin) {
    throw new Error("Missing Supabase service role configuration.");
  }
  const { error } = await supabaseAdmin.from("shift_notification_sends").insert({
    shift_instance_id: shiftInstanceId,
    volunteer_id: volunteerId,
    notification_type: notificationType,
    send_key: sendKey,
  });

  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

async function getManualTriggerUser(req: Request) {
  if (!supabaseAdmin) {
    return { allowed: false, error: "Missing Supabase service role configuration.", userId: null, role: "", email: "" };
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return { allowed: false, error: "Missing auth token.", userId: null, role: "", email: "" };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { allowed: false, error: "Unauthorized.", userId: null, role: "", email: "" };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  const role = (profile?.role ?? "").trim().toLowerCase();
  const email = (data.user.email ?? "").trim().toLowerCase();
  return {
    userId: data.user.id,
    role,
    email,
    allowed: true,
    error: null,
  };
}

async function fetchSubscriptionsForUsers(userIds: string[]) {
  if (!supabaseAdmin) {
    throw new Error("Missing Supabase service role configuration.");
  }
  if (userIds.length === 0) return new Map<string, PushSubscriptionRow[]>();

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth,user_id")
    .in("user_id", userIds);

  if (error || !subs) {
    throw error ?? new Error("Unable to load push subscriptions.");
  }

  const subsByUser = new Map<string, PushSubscriptionRow[]>();
  (subs as PushSubscriptionRow[]).forEach((sub) => {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  });
  return subsByUser;
}

async function sendPushToSubscriptions({
  subscriptions,
  userId,
  title,
  body,
  url = "/",
}: {
  subscriptions: PushSubscriptionRow[];
  userId: string;
  title: string;
  body: string;
  url?: string;
}) {
  if (!supabaseAdmin) {
    throw new Error("Missing Supabase service role configuration.");
  }
  if (!hasPushConfig) {
    throw new Error("Missing VAPID key configuration.");
  }
  if (!pushConfigured) {
    webpush.setVapidDetails("mailto:notifications@cokittyvolunteers.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    pushConfigured = true;
  }
  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify({
          title,
          body,
          url,
          icon: "/pwa-192.png",
          badge: "/pwa-192.png",
        }),
      );
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 0;
      if (status === 404 || status === 410) {
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .eq("endpoint", sub.endpoint);
      }
      failed += 1;
    }
  }

  return { sent, failed };
}

async function sendUpcomingShiftReminders(now: Date) {
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 5 * 60 * 1000);

  const { data: assignments, error } = await supabaseAdmin
    .from("shift_assignments")
    .select(
      `
      volunteer_id,
      shift_instance_id,
      shift_instance:shift_instances (
        id,
        starts_at,
        template:shift_templates (
          title
        )
      )
    `,
    )
    .eq("status", "active")
    .or(
      `starts_at.gte.${start.toISOString()},starts_at.lt.${end.toISOString()}`,
      { foreignTable: "shift_instances" },
    );

  if (error || !assignments) {
    return { sent: 0, failed: 0, matched: 0 };
  }

  const targets = (assignments as Array<{
    volunteer_id: string | null;
    shift_instance_id: number | null;
    shift_instance:
      | {
          id: number | null;
          starts_at: string | null;
          template:
            | {
                title: string | null;
              }
            | {
                title: string | null;
              }[]
            | null;
        }
      | {
          id: number | null;
          starts_at: string | null;
          template:
            | {
                title: string | null;
              }
            | {
                title: string | null;
              }[]
            | null;
        }[]
      | null;
  }>)
    .map((assignment) => {
      const shiftInstance = Array.isArray(assignment.shift_instance)
        ? (assignment.shift_instance[0] ?? null)
        : assignment.shift_instance;
      const template = Array.isArray(shiftInstance?.template)
        ? (shiftInstance.template[0] ?? null)
        : (shiftInstance?.template ?? null);
      if (
        !assignment.volunteer_id ||
        !assignment.shift_instance_id ||
        !shiftInstance?.starts_at
      ) {
        return null;
      }
      return {
        userId: assignment.volunteer_id,
        shiftInstanceId: assignment.shift_instance_id,
        startsAt: shiftInstance.starts_at,
        title: template?.title ?? null,
      } satisfies ReminderTarget;
    })
    .filter((item): item is ReminderTarget => Boolean(item));

  if (targets.length === 0) {
    return { sent: 0, failed: 0, matched: 0 };
  }

  const userIds = Array.from(new Set(targets.map((target) => target.userId)));
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id,notification_settings")
    .in("id", userIds)
    .eq("notification_pref", "push_and_email");

  if (profilesError) {
    return { sent: 0, failed: 0, matched: targets.length };
  }

  const eligibleIds = new Set(
    ((profiles ?? []) as Array<{ id: string; notification_settings: NotificationSettings }>)
      .filter((profile) => profile.notification_settings?.shift_reminder !== false)
      .map((profile) => profile.id),
  );

  const subsByUser = await fetchSubscriptionsForUsers(Array.from(eligibleIds));
  let sent = 0;
  let failed = 0;

  for (const target of targets) {
    if (!eligibleIds.has(target.userId)) continue;
    const subscriptions = subsByUser.get(target.userId) ?? [];
    if (subscriptions.length === 0) continue;

    const sendKey = `shift_reminder:${target.shiftInstanceId}:${target.userId}:${target.startsAt}`;
    const shouldSend = await recordNotificationSend({
      shiftInstanceId: target.shiftInstanceId,
      volunteerId: target.userId,
      notificationType: "shift_reminder",
      sendKey,
    });
    if (!shouldSend) continue;

    const title = "Shift reminder";
    const body = target.title
      ? `Your ${target.title} starts in 1 hour.`
      : "Your shift starts in 1 hour.";
    const result = await sendPushToSubscriptions({
      subscriptions,
      userId: target.userId,
      title,
      body,
    });
    sent += result.sent;
    failed += result.failed;
  }

  return { sent, failed, matched: targets.length };
}

async function sendManualShiftReminderTest(userId: string) {
  const { data: assignments, error } = await supabaseAdmin
    .from("shift_assignments")
    .select(
      `
      volunteer_id,
      shift_instance_id,
      shift_instance:shift_instances (
        id,
        starts_at,
        template:shift_templates (
          title
        )
      )
    `,
    )
    .eq("volunteer_id", userId)
    .eq("status", "active")
    .gte("shift_instance.starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true, foreignTable: "shift_instances" })
    .limit(1);

  if (error) {
    return { sent: 0, failed: 0, matched: 0, error: error.message };
  }

  const nextAssignment = ((assignments ?? []) as Array<{
    volunteer_id: string | null;
    shift_instance_id: number | null;
    shift_instance:
      | {
          id: number | null;
          starts_at: string | null;
          template:
            | {
                title: string | null;
              }
            | {
                title: string | null;
              }[]
            | null;
        }
      | {
          id: number | null;
          starts_at: string | null;
          template:
            | {
                title: string | null;
              }
            | {
                title: string | null;
              }[]
            | null;
        }[]
      | null;
  }>)[0] ?? null;

  if (!nextAssignment?.volunteer_id || !nextAssignment.shift_instance_id) {
    return { sent: 0, failed: 0, matched: 0, error: null };
  }

  const shiftInstance = Array.isArray(nextAssignment.shift_instance)
    ? (nextAssignment.shift_instance[0] ?? null)
    : nextAssignment.shift_instance;
  const template = Array.isArray(shiftInstance?.template)
    ? (shiftInstance.template[0] ?? null)
    : (shiftInstance?.template ?? null);
  if (!shiftInstance?.starts_at) {
    return { sent: 0, failed: 0, matched: 0, error: null };
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id,notification_settings")
    .eq("id", userId)
    .eq("notification_pref", "push_and_email")
    .limit(1);

  if (profilesError) {
    return { sent: 0, failed: 0, matched: 1, error: profilesError.message };
  }

  const eligibleProfile = ((profiles ?? []) as Array<{ id: string; notification_settings: NotificationSettings }>)[0] ?? null;
  if (!eligibleProfile || eligibleProfile.notification_settings?.shift_reminder === false) {
    return { sent: 0, failed: 0, matched: 1, error: null };
  }

  const subsByUser = await fetchSubscriptionsForUsers([userId]);
  const subscriptions = subsByUser.get(userId) ?? [];
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, matched: 1, error: null };
  }

  const title = "Shift reminder";
  const body = template?.title
    ? `Your ${template.title} starts in 1 hour.`
    : "Your shift starts in 1 hour.";
  const result = await sendPushToSubscriptions({
    subscriptions,
    userId,
    title,
    body,
    url: "/?view=notifications",
  });

  return { sent: result.sent, failed: result.failed, matched: 1, error: null };
}

async function sendLeadNeededAlerts(
  now: Date,
  options?: { manualTest?: boolean },
) {
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  const { data: shiftRows, error: shiftsError } = await supabaseAdmin
    .from("shift_instances")
    .select(
      `
      id,
      starts_at,
      shift_date,
      template:shift_templates (
        title,
        timezone
      )
    `,
    )
    .or(
      `starts_at.gte.${windowStart.toISOString()},starts_at.lt.${windowEnd.toISOString()},shift_date.gte.${windowStart.toISOString().slice(0, 10)},shift_date.lt.${windowEnd.toISOString().slice(0, 10)}`,
    );

  if (shiftsError || !shiftRows) {
    return { sent: 0, failed: 0, matched: 0 };
  }

  const candidateShifts = (shiftRows as ShiftRow[]).filter((shift) => {
    const template = normalizeTemplate(shift.template);
    const timeZone = getTimezone(template?.timezone);
    const nowParts = getZonedParts(now, timeZone);
    if (!options?.manualTest && nowParts.hour !== 20) return false;

    const shiftDateKey = shift.shift_date
      ? shift.shift_date
      : shift.starts_at
        ? getDateKeyFromParts(getZonedParts(new Date(shift.starts_at), timeZone))
        : null;
    if (!shiftDateKey) return false;

    const tomorrow = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day));
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowKey = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(
      tomorrow.getUTCDate(),
    ).padStart(2, "0")}`;

    return shiftDateKey === tomorrowKey;
  });

  if (candidateShifts.length === 0) {
    return { sent: 0, failed: 0, matched: 0 };
  }

  const shiftIds = candidateShifts.map((shift) => shift.id);
  const { data: assignmentRows, error: assignmentsError } = await supabaseAdmin
    .from("shift_assignments")
    .select(
      `
      shift_instance_id,
      assignment_role,
      volunteer:profiles (
        role
      )
    `,
    )
    .in("shift_instance_id", shiftIds)
    .eq("status", "active");

  if (assignmentsError) {
    return { sent: 0, failed: 0, matched: candidateShifts.length };
  }

  const assignmentsByShift = new Map<number, ActiveAssignmentRow[]>();
  ((assignmentRows ?? []) as ActiveAssignmentRow[]).forEach((row) => {
    if (!row.shift_instance_id) return;
    const list = assignmentsByShift.get(row.shift_instance_id) ?? [];
    list.push(row);
    assignmentsByShift.set(row.shift_instance_id, list);
  });

  const uncoveredShifts = candidateShifts.filter((shift) => {
    const assignments = assignmentsByShift.get(shift.id) ?? [];
    return !assignments.some((assignment) => {
      const volunteer = Array.isArray(assignment.volunteer)
        ? (assignment.volunteer[0] ?? null)
        : assignment.volunteer;
      const role = (volunteer?.role ?? "").trim().toLowerCase();
      const assignmentRole = (assignment.assignment_role ?? "").trim().toLowerCase();
      return assignmentRole === "lead" || role === "lead" || role === "admin";
    });
  });

  if (uncoveredShifts.length === 0) {
    return { sent: 0, failed: 0, matched: candidateShifts.length };
  }

  const { data: leadProfiles, error: leadsError } = await supabaseAdmin
    .from("profiles")
    .select("id,notification_settings")
    .eq("role", "Lead")
    .eq("notification_pref", "push_and_email");

  if (leadsError || !leadProfiles) {
    return { sent: 0, failed: 0, matched: uncoveredShifts.length };
  }

  const leadIds = ((leadProfiles as Array<{ id: string; notification_settings: NotificationSettings }>) ?? [])
    .filter((profile) => profile.notification_settings?.lead_needed !== false)
    .map((profile) => profile.id);
  if (leadIds.length === 0) {
    return { sent: 0, failed: 0, matched: uncoveredShifts.length };
  }

  const subsByLead = await fetchSubscriptionsForUsers(leadIds);
  let sent = 0;
  let failed = 0;

  for (const shift of uncoveredShifts) {
    const template = normalizeTemplate(shift.template);
    const timeZone = getTimezone(template?.timezone);
    const shiftDateKey = shift.shift_date
      ? shift.shift_date
      : shift.starts_at
        ? getDateKeyFromParts(getZonedParts(new Date(shift.starts_at), timeZone))
        : null;
    if (!shiftDateKey) continue;

    const sendKey = options?.manualTest
      ? `lead_needed_test:${shift.id}:${shiftDateKey}:${now.toISOString()}`
      : `lead_needed:${shift.id}:${shiftDateKey}`;
    const hasAnySubscriptions = leadIds.some((leadId) => (subsByLead.get(leadId) ?? []).length > 0);
    if (!hasAnySubscriptions) break;

    const shouldSend = await recordNotificationSend({
      shiftInstanceId: shift.id,
      volunteerId: null,
      notificationType: options?.manualTest ? "lead_needed_test" : "lead_needed",
      sendKey,
    });
    if (!shouldSend) continue;

    const shiftPeriod = getShiftPeriodLabel(shift.starts_at, timeZone);
    const title = options?.manualTest
      ? `Test: Lead Needed for Tomorrow, ${shiftPeriod} Shift`
      : `Lead Needed for Tomorrow, ${shiftPeriod} Shift`;
    const body = template?.title
      ? options?.manualTest
        ? `Test alert for ${template.title} tomorrow.`
        : `No lead is assigned to ${template.title} tomorrow.`
      : `${options?.manualTest ? "Test alert:" : "No lead is assigned to"} tomorrow's ${shiftPeriod} shift.`;

    for (const leadId of leadIds) {
      const subscriptions = subsByLead.get(leadId) ?? [];
      if (subscriptions.length === 0) continue;
      const result = await sendPushToSubscriptions({
        subscriptions,
        userId: leadId,
        title,
        body,
      });
      sent += result.sent;
      failed += result.failed;
    }
  }

  return { sent, failed, matched: uncoveredShifts.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!hasSupabaseConfig) {
    return new Response(JSON.stringify({ error: "Missing Supabase service role configuration." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = (await req.json().catch(() => ({}))) as ManualTriggerInput;
  if (payload.mode === "shift_reminder_test") {
    const auth = await getManualTriggerUser(req);
    if (!auth.userId) {
      return new Response(JSON.stringify({ error: auth.error ?? "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const result = await sendManualShiftReminderTest(auth.userId);
      return jsonResponse({
        manual: true,
        reminder_sent: result.sent,
        reminder_failed: result.failed,
        reminder_matched: result.matched,
        sent: result.sent,
        failed: result.failed,
        ...(result.error ? { error: result.error } : {}),
      });
    } catch (error) {
      return jsonResponse({
        manual: true,
        sent: 0,
        failed: 0,
        error: error instanceof Error ? error.message : "Manual shift reminder test failed.",
      });
    }
  }

  if (payload.mode === "lead_needed_test") {
    const auth = await getManualTriggerUser(req);
    const isPrivileged = auth.role === "admin" || auth.role === "lead" || auth.email === PRIMARY_ADMIN_EMAIL;
    if (!auth.userId) {
      return new Response(JSON.stringify({ error: auth.error ?? "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isPrivileged) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const result = await sendLeadNeededAlerts(new Date(), { manualTest: true });
      return jsonResponse({
        manual: true,
        lead_needed_sent: result.sent,
        lead_needed_failed: result.failed,
        lead_needed_matched: result.matched,
        sent: result.sent,
        failed: result.failed,
      });
    } catch (error) {
      return jsonResponse({
        manual: true,
        sent: 0,
        failed: 0,
        error: error instanceof Error ? error.message : "Manual lead-needed test failed.",
      });
    }
  }

  const now = new Date();

  try {
    const reminderResults = await sendUpcomingShiftReminders(now);
    const leadNeededResults = await sendLeadNeededAlerts(now);

    return jsonResponse({
      reminder_sent: reminderResults.sent,
      reminder_failed: reminderResults.failed,
      reminder_matched: reminderResults.matched,
      lead_needed_sent: leadNeededResults.sent,
      lead_needed_failed: leadNeededResults.failed,
      lead_needed_matched: leadNeededResults.matched,
      sent: reminderResults.sent + leadNeededResults.sent,
      failed: reminderResults.failed + leadNeededResults.failed,
    });
  } catch (error) {
    console.error("send-shift-reminders failed", error);
    return jsonResponse({
      sent: 0,
      failed: 0,
      error: error instanceof Error ? error.message : "Unknown reminder failure.",
    });
  }
});
