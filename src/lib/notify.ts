import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { EVENT_LABEL, STATUS_META } from "./constants";
import { haversineKm } from "./geo";
import { log } from "./logger";
import { fmtDateTime } from "./time";
import type { NotifyChannel, NotifyEvent, Outage, OutageUpdate } from "./types";

export interface Message {
  title: string;
  body: string;
  url: string;
}

/** Builds alert text. Only official ETAs are stated as estimates; community ones are labelled; otherwise "not confirmed". */
export function buildMessage(o: Outage, u: Pick<OutageUpdate, "event" | "status" | "eta_at" | "eta_kind" | "message">): Message {
  const where = o.suburbs.join(", ") || "your area";
  const status = STATUS_META[u.status].label;
  let eta = "Restoration time not confirmed.";
  if (u.status === "restored") eta = "";
  else if (u.eta_at && u.eta_kind === "official") eta = `Official estimated restoration: ${fmtDateTime(u.eta_at)}.`;
  else if (u.eta_at) eta = `Unconfirmed community estimate: ${fmtDateTime(u.eta_at)}. Not confirmed by the municipality.`;
  const unverified = o.verification === "verified" ? "" : " (unverified)";
  return {
    title: `${EVENT_LABEL[u.event]} – ${where}${unverified}`,
    body: [`Status: ${status}.`, eta, u.message ?? "", `Source: ${o.source_name}.`].filter(Boolean).join(" "),
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/outage/${o.id}`,
  };
}

interface SubRow {
  user_id: string;
  kind: string;
  value: string;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  channels: NotifyChannel[];
  events: NotifyEvent[];
}

export async function enqueueNotifications(sb: SupabaseClient, o: Outage, u: OutageUpdate): Promise<number> {
  const queries = [
    o.suburbs.length ? sb.from("subscriptions").select("*").eq("kind", "suburb").in("value", o.suburbs) : null,
    o.ward !== null ? sb.from("subscriptions").select("*").eq("kind", "ward").eq("value", String(o.ward)) : null,
    sb.from("subscriptions").select("*").in("kind", ["street", "location"]),
  ].filter(Boolean) as PromiseLike<{ data: SubRow[] | null }>[];
  const subs = (await Promise.all(queries)).flatMap((r) => r.data ?? []);

  const matched = subs.filter((s) => {
    if (!s.events.includes(u.event)) return false;
    if (s.kind === "street") return o.streets.some((x) => x.toLowerCase().includes(s.value.toLowerCase()));
    if (s.kind === "location") {
      if (s.lat == null || s.lng == null || o.lat == null || o.lng == null) return false;
      return haversineKm(s.lat, s.lng, o.lat, o.lng) * 1000 <= (s.radius_m ?? 1000) + (o.radius_m ?? 0);
    }
    return true;
  });
  if (!matched.length) return 0;

  const byUser = new Map<string, Set<NotifyChannel>>();
  matched.forEach((s) => {
    const set = byUser.get(s.user_id) ?? new Set<NotifyChannel>();
    s.channels.forEach((c) => set.add(c));
    byUser.set(s.user_id, set);
  });
  const ids = [...byUser.keys()];
  const [{ data: profiles }, { data: pushes }] = await Promise.all([
    sb.from("profiles").select("id,email,email_opt_in,whatsapp_number,whatsapp_opt_in").in("id", ids),
    sb.from("push_subscriptions").select("user_id").in("user_id", ids),
  ]);
  const pushUsers = new Set((pushes ?? []).map((p) => p.user_id));
  const msg = buildMessage(o, u);
  const rows: object[] = [];
  for (const p of profiles ?? []) {
    const chans = byUser.get(p.id)!;
    const add = (channel: NotifyChannel) =>
      rows.push({ user_id: p.id, channel, event: u.event, outage_id: o.id, update_id: u.id, payload: msg });
    if (chans.has("push") && pushUsers.has(p.id)) add("push");
    if (chans.has("email") && p.email && p.email_opt_in) add("email");
    if (chans.has("whatsapp") && p.whatsapp_number && p.whatsapp_opt_in) add("whatsapp");
  }
  if (!rows.length) return 0;
  const { error } = await sb.from("notification_queue").upsert(rows, { onConflict: "user_id,channel,update_id", ignoreDuplicates: true });
  if (error) {
    await log("error", "notify", "enqueue failed", { error: error.message });
    return 0;
  }
  return rows.length;
}

// ───────────── Delivery ─────────────

async function sendEmail(to: string, m: Message) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Skip("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject: m.title,
      text: `${m.body}\n\n${m.url}\n\nYou receive this because you subscribed to alerts on Ekurhuleni PowerWatch. Manage alerts: ${process.env.NEXT_PUBLIC_SITE_URL}/settings`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function sendWhatsApp(to: string, m: Message) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Skip("WhatsApp Cloud API not configured");
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\D/g, ""),
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME ?? "outage_update",
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
        // Template body expected: "{{1}}\n{{2}}\n{{3}}"  (title, details, link)
        components: [{ type: "body", parameters: [m.title, m.body, m.url].map((t) => ({ type: "text", text: t.slice(0, 900) })) }],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

class Skip extends Error {}

export async function processQueue(sb: SupabaseClient, limit = 100) {
  const { data: jobs } = await sb
    .from("notification_queue")
    .select("*")
    .eq("status", "pending")
    .lt("attempts", 3)
    .order("created_at")
    .limit(limit);
  const stats = { sent: 0, failed: 0, skipped: 0 };
  if (!jobs?.length) return stats;

  const vapidOk = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY;
  if (vapidOk) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.org", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  }
  const ids = [...new Set(jobs.map((j) => j.user_id))];
  const [{ data: profiles }, { data: pushes }] = await Promise.all([
    sb.from("profiles").select("id,email,whatsapp_number").in("id", ids),
    sb.from("push_subscriptions").select("*").in("user_id", ids),
  ]);

  for (const j of jobs) {
    const m = j.payload as Message;
    const prof = profiles?.find((p) => p.id === j.user_id);
    try {
      if (j.channel === "email") {
        if (!prof?.email) throw new Skip("no email");
        await sendEmail(prof.email, m);
      } else if (j.channel === "whatsapp") {
        if (!prof?.whatsapp_number) throw new Skip("no number");
        await sendWhatsApp(prof.whatsapp_number, m);
      } else {
        if (!vapidOk) throw new Skip("VAPID keys not set");
        const subs = (pushes ?? []).filter((p) => p.user_id === j.user_id);
        if (!subs.length) throw new Skip("no push subscription");
        let delivered = 0;
        for (const s of subs) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m));
            delivered++;
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
        if (!delivered) throw new Error("all push endpoints failed");
      }
      await sb.from("notification_queue").update({ status: "sent", sent_at: new Date().toISOString(), attempts: j.attempts + 1 }).eq("id", j.id);
      stats.sent++;
    } catch (e) {
      const skip = e instanceof Skip;
      await sb
        .from("notification_queue")
        .update({ status: skip ? "skipped" : j.attempts + 1 >= 3 ? "failed" : "pending", attempts: j.attempts + 1, error: (e as Error).message })
        .eq("id", j.id);
      skip ? stats.skipped++ : stats.failed++;
      if (!skip) await log("warn", "notify", "delivery failed", { channel: j.channel, error: (e as Error).message });
    }
  }
  return stats;
}
