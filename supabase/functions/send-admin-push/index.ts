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
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const NOTIFICATION_ACTION_SECRET = Deno.env.get("NOTIFICATION_ACTION_SECRET") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const hasConfig = Boolean(
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY,
);

function toBase64Url(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function buildNotificationActionToken(payload: {
  action: "approve_pending_shift_request";
  assignmentId: number;
  exp: number;
}) {
  if (!NOTIFICATION_ACTION_SECRET) return null;
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(NOTIFICATION_ACTION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(encodedPayload),
  );
  const signature = toBase64Url(new Uint8Array(signatureBuffer));
  return `${encodedPayload}.${signature}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  if (!hasConfig) {
    return new Response("Missing edge function configuration.", {
      status: 500,
      headers: corsHeaders,
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  webpush.setVapidDetails(
    "mailto:notifications@cokittyvolunteers.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const payload = await req.json();
  const { title, body, url, actions, data } = payload ?? {};
  if (!title || !body || !url) {
    return new Response("Invalid payload", { status: 400, headers: corsHeaders });
  }
  const notificationActions = Array.isArray(actions)
    ? actions
        .filter(
          (actionItem): actionItem is { action: string; title: string } =>
            Boolean(
              actionItem &&
                typeof actionItem === "object" &&
                typeof actionItem.action === "string" &&
                typeof actionItem.title === "string",
            ),
        )
        .slice(0, 2)
    : [];
  const notificationData =
    data && typeof data === "object" && !Array.isArray(data) ? { ...(data as Record<string, unknown>) } : {};
  const pendingAssignmentId =
    typeof notificationData.assignment_id === "string" && Number.isInteger(Number(notificationData.assignment_id))
      ? Number(notificationData.assignment_id)
      : typeof notificationData.assignment_id === "number" && Number.isInteger(notificationData.assignment_id)
        ? notificationData.assignment_id
        : null;

  const { data: admins, error: adminsError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "Admin");

  if (adminsError) {
    return new Response(adminsError.message, { status: 500, headers: corsHeaders });
  }

  const adminIds = (admins ?? []).map((admin) => admin.id);
  if (adminIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, admin_count: 0, subscription_count: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: subs, error: subsError } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth,user_id")
    .in("user_id", adminIds);

  if (subsError) {
    return new Response(subsError.message, { status: 500, headers: corsHeaders });
  }

  const sendResults = await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        const payloadData: Record<string, unknown> = { url, ...notificationData };
        if (pendingAssignmentId && NOTIFICATION_ACTION_SECRET) {
          const approveToken = await buildNotificationActionToken({
            action: "approve_pending_shift_request",
            assignmentId: pendingAssignmentId,
            exp: Date.now() + 10 * 60 * 1000,
          });
          if (approveToken) {
            payloadData.approve_action_token = approveToken;
            payloadData.approve_action_endpoint = `${SUPABASE_URL}/functions/v1/notification-action`;
            if (SUPABASE_ANON_KEY) {
              payloadData.approve_action_apikey = SUPABASE_ANON_KEY;
            }
          }
        }
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
            ...(notificationActions.length > 0 ? { actions: notificationActions } : {}),
            data: payloadData,
          }),
        );
        return { ok: true };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 0;
        if (status === 404 || status === 410) {
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("user_id", sub.user_id)
            .eq("endpoint", sub.endpoint);
        }
        return { ok: false };
      }
    }),
  );

  const sent = sendResults.filter((result) => result.ok).length;
  const failed = sendResults.length - sent;

  return new Response(JSON.stringify({
    sent,
    failed,
    admin_count: adminIds.length,
    subscription_count: subs?.length ?? 0,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
