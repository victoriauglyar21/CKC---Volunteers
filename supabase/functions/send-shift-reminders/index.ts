import { serve } from "https://deno.land/std@0.204.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "https://esm.sh/web-push@3.6.7";

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
webpush.setVapidDetails("mailto:notifications@ckc-volunteer.org", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

serve(async () => {
  const now = new Date();
  const start = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 10 * 60 * 1000);

  const { data: assignments, error } = await supabaseAdmin
    .from("shift_assignments")
    .select(
      `
      volunteer_id,
      shift_instance:shift_instances (
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
    return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const targets = assignments
    .map((assignment) => ({
      user_id: assignment.volunteer_id as string,
      starts_at: assignment.shift_instance?.starts_at as string | null,
      title: assignment.shift_instance?.template?.title as string | null,
    }))
    .filter((item) => item.user_id && item.starts_at);

  if (targets.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const userIds = Array.from(new Set(targets.map((t) => t.user_id)));
  const { data: subs, error: subsError } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth,user_id")
    .in("user_id", userIds);

  if (subsError || !subs) {
    return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const subsByUser = new Map<string, typeof subs>();
  subs.forEach((sub) => {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  });

  let sent = 0;
  let failed = 0;

  for (const target of targets) {
    const userSubs = subsByUser.get(target.user_id) ?? [];
    if (userSubs.length === 0) continue;
    const title = "Shift reminder";
    const body = target.title
      ? `Your ${target.title} starts in 2 hours.`
      : "Your shift starts in 2 hours.";

    for (const sub of userSubs) {
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
            url: "/",
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
            .eq("user_id", sub.user_id)
            .eq("endpoint", sub.endpoint);
        }
        failed += 1;
      }
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { "Content-Type": "application/json" },
  });
});
