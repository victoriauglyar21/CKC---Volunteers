import { serve } from "https://deno.land/std@0.204.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase service role configuration.");
}
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error("Missing VAPID key configuration.");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
webpush.setVapidDetails("mailto:notifications@cokittyvolunteers.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const requesterId = userData.user.id;
  const { data: requesterProfile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", requesterId)
    .maybeSingle();

  if (requesterProfile?.role !== "Admin" && requesterProfile?.role !== "Lead") {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const payload = await req.json();
  const { user_id, title, body, url } = payload ?? {};
  if (!user_id || !title || !body || !url) {
    return new Response("Invalid payload", { status: 400, headers: corsHeaders });
  }

  const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
    .from("profiles")
    .select("notification_pref")
    .eq("id", user_id)
    .maybeSingle();

  if (targetProfileError) {
    return new Response(targetProfileError.message, { status: 500, headers: corsHeaders });
  }

  if (targetProfile?.notification_pref !== "push_and_email") {
    return new Response(JSON.stringify({ sent: 0, failed: 0, skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: subs, error: subsError } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", user_id);

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
            .eq("user_id", user_id)
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
