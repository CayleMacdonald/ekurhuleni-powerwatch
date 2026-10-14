import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/config";
import { processQueue } from "@/lib/notify";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cronAuthorised } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ skipped: "demo mode" });
  return NextResponse.json(await processQueue(supabaseAdmin()));
}
