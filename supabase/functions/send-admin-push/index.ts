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

const hasConfig = Boolean(
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY,
);

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
    "mailto:notifications@ckc-volunteer.org",
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

  const { title, body, url } = await req.json();
  if (!title || !body || !url) {
    return new Response("Invalid payload", { status: 400, headers: corsHeaders });
  }

  const { data: admins, error: adminsError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "Admin")
    .eq("notification_pref", "push_and_email");

  if (adminsError) {
    return new Response(adminsError.message, { status: 500, headers: corsHeaders });
  }

  const adminIds = (admins ?? []).map((admin) => admin.id);
  if (adminIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
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

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
