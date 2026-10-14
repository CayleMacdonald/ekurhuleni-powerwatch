import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";

const schema = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { user, sb } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { error } = await sb
    .from("push_subscriptions")
    .upsert({ user_id: user.id, endpoint: body.data.endpoint, p256dh: body.data.keys.p256dh, auth: body.data.keys.auth }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  const { user, sb } = await getSessionUser();
  if (!user || !endpoint) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
