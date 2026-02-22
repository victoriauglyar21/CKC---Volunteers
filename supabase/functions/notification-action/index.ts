import { serve } from "https://deno.land/std@0.204.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NOTIFICATION_ACTION_SECRET = Deno.env.get("NOTIFICATION_ACTION_SECRET") ?? "";

function fromBase64Url(base64Url: string) {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function verifyToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  if (!NOTIFICATION_ACTION_SECRET) return null;

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
  const expectedSignature = toBase64Url(new Uint8Array(signatureBuffer));
  if (expectedSignature !== signature) return null;

  try {
    const payloadJson = new TextDecoder().decode(fromBase64Url(encodedPayload));
    return JSON.parse(payloadJson) as {
      action?: string;
      assignmentId?: number;
      exp?: number;
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !NOTIFICATION_ACTION_SECRET) {
    return new Response(JSON.stringify({ error: "Missing configuration" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const parsed = await verifyToken(token);
  if (!parsed) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  if (parsed.action !== "approve_pending_shift_request" || !Number.isInteger(parsed.assignmentId)) {
    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (!Number.isInteger(parsed.exp) || (parsed.exp as number) < Date.now()) {
    return new Response(JSON.stringify({ error: "Token expired" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: assignment, error: lookupError } = await supabaseAdmin
    .from("shift_assignments")
    .select("id,status")
    .eq("id", parsed.assignmentId as number)
    .maybeSingle();

  if (lookupError) {
    return new Response(JSON.stringify({ error: lookupError.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  if (!assignment) {
    return new Response(JSON.stringify({ error: "Assignment not found" }), {
      status: 404,
      headers: corsHeaders,
    });
  }

  if (assignment.status !== "pending") {
    return new Response(JSON.stringify({ ok: true, alreadyHandled: true, status: assignment.status }), {
      headers: corsHeaders,
    });
  }

  const { error: updateError } = await supabaseAdmin
    .from("shift_assignments")
    .update({ status: "active" })
    .eq("id", parsed.assignmentId as number)
    .eq("status", "pending");

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
});
