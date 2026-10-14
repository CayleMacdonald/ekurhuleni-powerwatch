import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/config";

const CH = z.enum(["push", "email", "whatsapp"]);
const EV = z.enum(["outage_reported", "repair_update", "eta_changed", "power_restored"]);
const schema = z.object({
  kind: z.enum(["suburb", "ward", "street", "location"]),
  value: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  radius_m: z.number().int().min(100).max(10000).optional(),
  channels: z.array(CH).min(1),
  events: z.array(EV).min(1),
});

const needAuth = () => NextResponse.json({ error: "Sign in required" }, { status: 401 });

export async function GET() {
  if (isDemoMode()) return NextResponse.json({ demo: true, subscriptions: [], profile: null });
  const { user, sb } = await getSessionUser();
  if (!user) return needAuth();
  const [{ data: subscriptions }, { data: profile }, { data: push }] = await Promise.all([
    sb.from("subscriptions").select("*").order("created_at"),
    sb.from("profiles").select("email,whatsapp_number,whatsapp_opt_in,email_opt_in").eq("id", user.id).maybeSingle(),
    sb.from("push_subscriptions").select("id").limit(1),
  ]);
  return NextResponse.json({ subscriptions, profile, pushEnabled: (push?.length ?? 0) > 0 });
}

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { user, sb } = await getSessionUser();
  if (!user) return needAuth();
  const { count } = await sb.from("subscriptions").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= 20) return NextResponse.json({ error: "Maximum of 20 saved areas" }, { status: 400 });
  const { error } = await sb.from("subscriptions").upsert({ ...body.data, user_id: user.id }, { onConflict: "user_id,kind,value" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const { user, sb } = await getSessionUser();
  if (!user) return needAuth();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await sb.from("subscriptions").delete().eq("id", id); // RLS: owner only
  return NextResponse.json({ ok: true });
}

const profileSchema = z.object({
  whatsapp_number: z.string().regex(/^\+?[1-9]\d{8,14}$/, "Use international format, e.g. +27821234567").nullable(),
  whatsapp_opt_in: z.boolean(),
  email_opt_in: z.boolean(),
});

/** Update notification contact details. WhatsApp requires explicit opt-in. */
export async function PATCH(req: Request) {
  const body = profileSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  const { user, sb } = await getSessionUser();
  if (!user) return needAuth();
  const d = body.data;
  const { error } = await sb.from("profiles").update({ ...d, whatsapp_opt_in: d.whatsapp_number ? d.whatsapp_opt_in : false }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
