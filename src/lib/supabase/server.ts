import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Cookie-bound client: acts as the signed-in user, RLS applies. */
export function supabaseServer() {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieToSet[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component – middleware refreshes the session */
        }
      },
    },
  });
}

/** Service-role client: bypasses RLS. Server-only. Used by cron jobs, ingestion and report intake. */
export function supabaseAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

/** Returns the signed-in user and whether they are an admin (checked against profiles, never the client). */
export async function getSessionUser() {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { user: null, isAdmin: false, sb };
  const { data } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { user, isAdmin: data?.role === "admin", sb };
}

type CookieToSet = { name: string; value: string; options?: any };
