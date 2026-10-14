import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/config";
import { hashReporter, reportSchema, submitReport } from "@/lib/reports";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const parsed = reportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the form and try again.", details: parsed.error.flatten().fieldErrors }, { status: 400 });

  if (isDemoMode()) {
    return NextResponse.json({ ok: true, demo: true, message: "Demo mode: your report was NOT saved. Connect Supabase to collect real reports." }, { status: 202 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "";
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  const r = await submitReport(supabaseAdmin(), parsed.data, hashReporter(ip, ua), user?.id ?? null);
  return NextResponse.json(r.ok ? { ok: true, status: r.status, message: r.message } : { error: r.message }, { status: r.ok ? 201 : r.code });
}
