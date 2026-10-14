import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/config";
import { cronAuthorised } from "@/lib/cron-auth";
import { runIngestion } from "@/lib/ingest/run";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ skipped: "demo mode – no database configured" });
  const summary = await runIngestion(supabaseAdmin());
  return NextResponse.json(summary);
}
