import { isSupabaseConfigured } from "./config";
import { supabaseAdmin } from "./supabase/server";

type Level = "debug" | "info" | "warn" | "error";

/** Logs to stdout (structured JSON) and, when a database is configured, to app_logs. Never throws. */
export async function log(level: Level, scope: string, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, scope, message, ...(meta ? { meta } : {}) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  if (level === "debug" || !isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await supabaseAdmin().from("app_logs").insert({ level, scope, message, meta: meta ?? null });
  } catch {
    /* logging must never break the caller */
  }
}
