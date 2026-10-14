import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/settings";
  if (code) await supabaseServer().auth.exchangeCodeForSession(code);
  // only allow same-site relative redirects
  return NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/settings", url.origin));
}
