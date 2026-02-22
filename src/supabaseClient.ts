/// <reference types="vite/client" />

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const authStorage = typeof window !== "undefined" ? window.localStorage : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
});

function clearStoredAuthSession() {
  if (typeof window === "undefined") return;
  const keysToClear: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (key.startsWith("sb-") && key.includes("-auth-token")) {
      keysToClear.push(key);
    }
  }
  for (const key of keysToClear) {
    window.localStorage.removeItem(key);
  }
}

export async function signOutSafely() {
  const globalResult = await supabase.auth.signOut();
  if (!globalResult.error) {
    return { error: null };
  }

  const localResult = await supabase.auth.signOut({ scope: "local" });
  if (!localResult.error) {
    return { error: null };
  }

  clearStoredAuthSession();
  return { error: null };
}
