import { createClient } from "@supabase/supabase-js";

// Vite inlines VITE_* env vars at build time. The anon key is meant to be
// public — Row Level Security + SECURITY DEFINER functions protect the data.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_READY = Boolean(url && anonKey);

export const supabase = SUPABASE_READY ? createClient(url, anonKey) : null;

// A stable per-browser identity. No login for this prototype — just a uuid
// kept in localStorage and passed to every RPC as p_token.
const TOKEN_KEY = "gg.token";
export function userToken() {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}
