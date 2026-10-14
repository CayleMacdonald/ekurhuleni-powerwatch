import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { clusterThreshold, clusterWindowMin } from "./config";
import { findPlace } from "./constants";
import { log } from "./logger";
import { applyChange } from "./outages-write";
import type { Outage } from "./types";

export const reportSchema = z.object({
  type: z.enum(["outage", "still_off", "restored"]),
  suburb: z.string().trim().min(2).max(80),
  street: z.string().trim().max(120).optional().or(z.literal("")),
  ward: z.coerce.number().int().min(1).max(150).optional().or(z.literal("").transform(() => undefined)),
  started_at: z.string().datetime({ offset: true }).optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  website: z.string().max(0).optional(), // honeypot
});
export type ReportInput = z.infer<typeof reportSchema>;

export const hashReporter = (ip: string, ua: string) =>
  createHash("sha256").update(`${process.env.REPORTER_HASH_SALT ?? "dev-salt"}|${ip}|${ua}`).digest("hex").slice(0, 32);

export const norm = (s: string | undefined | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Pure heuristics so they can be unit-tested. Returns flag names; any flag => report is held for review and not counted. */
export function suspiciousFlags(i: ReportInput, recentByReporterLastHour: number, now = Date.now()): string[] {
  const flags: string[] = [];
  if (i.notes && /(https?:\/\/|www\.|\.com\b|whatsapp|call me|\+?\d{9,})/i.test(i.notes)) flags.push("contact_or_link_in_notes");
  if (i.started_at) {
    const t = new Date(i.started_at).getTime();
    if (t > now + 5 * 60_000) flags.push("start_in_future");
    if (t < now - 72 * 3.6e6) flags.push("start_too_old");
  }
  if (recentByReporterLastHour >= 5) flags.push("rate_limit");
  if (i.notes && /(.)\1{9,}/.test(i.notes)) flags.push("repeated_characters");
  if (!findPlace(i.suburb)) flags.push("unknown_suburb"); // still stored, but needs review before it can count
  return flags;
}

export type ReportResult =
  | { ok: true; status: "accepted" | "flagged"; message: string; clusterOutageId?: string }
  | { ok: false; code: 409 | 429 | 400; message: string };

export async function submitReport(sb: SupabaseClient, input: ReportInput, reporterHash: string, userId: string | null): Promise<ReportResult> {
  if (input.website) return { ok: false, code: 400, message: "Rejected" };
  const place = findPlace(input.suburb);
  const suburb = place?.name ?? input.suburb.trim();
  const hourAgo = new Date(Date.now() - 3.6e6).toISOString();

  const { data: mine } = await sb.from("reports").select("id,type,suburb,street,created_at").eq("reporter_hash", reporterHash).gte("created_at", hourAgo);
  // Duplicate = same reporter, same suburb+street+type within 30 minutes
  const dup = (mine ?? []).find(
    (r) => r.type === input.type && norm(r.suburb) === norm(suburb) && norm(r.street) === norm(input.street) && Date.now() - new Date(r.created_at).getTime() < 30 * 60_000,
  );
  if (dup) return { ok: false, code: 409, message: "You already submitted this report recently. Thank you – it has been counted." };
  if ((mine?.length ?? 0) >= 12) return { ok: false, code: 429, message: "Too many reports from this device. Please try again later." };

  const flags = suspiciousFlags(input, mine?.length ?? 0);
  const status = flags.length ? "flagged" : "accepted";

  // attach to an active outage covering this suburb, if any
  const { data: active } = await sb.from("outages").select("*").neq("status", "restored").contains("suburbs", [suburb]).order("updated_at", { ascending: false }).limit(1);
  const outage = (active?.[0] as Outage | undefined) ?? null;

  const { error } = await sb.from("reports").insert({
    type: input.type,
    user_id: userId,
    reporter_hash: reporterHash,
    suburb,
    street: input.street || null,
    ward: input.ward ?? place?.ward ?? null,
    started_at: input.started_at ?? null,
    notes: input.notes || null,
    outage_id: outage?.id ?? null,
    status,
    flags,
  });
  if (error) {
    await log("error", "reports", "insert failed", { error: error.message });
    return { ok: false, code: 400, message: "Could not save report" };
  }
  if (status === "flagged") {
    await log("warn", "reports", "flagged report", { suburb, flags });
    return { ok: true, status, message: "Thanks – your report was received and is being checked before it is counted." };
  }

  // ── Aggregation: independent reporters only (distinct hashes), accepted reports only ──
  const win = new Date(Date.now() - clusterWindowMin() * 60_000).toISOString();
  const { data: recent } = await sb.from("reports").select("reporter_hash,type").eq("suburb", suburb).eq("status", "accepted").gte("created_at", win);
  const distinct = (types: string[]) => new Set((recent ?? []).filter((r) => types.includes(r.type)).map((r) => r.reporter_hash)).size;
  const offCount = distinct(["outage", "still_off"]);
  const restoredCount = distinct(["restored"]);

  if (outage) {
    const patch: Record<string, unknown> = { report_count: outage.report_count + (input.type === "restored" ? 0 : 1) };
    if (input.type === "restored") patch.restored_confirmations = Math.max(outage.restored_confirmations, restoredCount);
    await sb.from("outages").update(patch).eq("id", outage.id);
    // Community-only outages may be closed by independent restoration confirmations. Official ones never are.
    if (input.type === "restored" && outage.verification === "community_cluster" && restoredCount >= clusterThreshold()) {
      await applyChange(sb, outage, { status: "restored", message: `${restoredCount} independent residents confirmed power is back` }, {
        kind: "community", id: null, name: "Community reports", url: null, publishedAt: null, verification: "community_cluster",
      });
    }
    return { ok: true, status, message: "Thanks – your report was added to the existing outage.", clusterOutageId: outage.id };
  }

  if (input.type !== "restored" && offCount >= clusterThreshold()) {
    const started = (recent ?? []).length ? new Date(Date.now() - clusterWindowMin() * 60_000).toISOString() : new Date().toISOString();
    const ch = await applyChange(
      sb,
      null,
      { status: "reported", suburbs: [suburb], title: `Possible outage – ${suburb} (community reports)`, startedAt: input.started_at ?? started, message: `${offCount} independent community reports. Not yet confirmed by the municipality.` },
      { kind: "community", id: null, name: "Community reports", url: null, publishedAt: null, verification: "community_cluster" },
    );
    if (ch) {
      await sb.from("outages").update({ report_count: offCount }).eq("id", ch.outage.id);
      await sb.from("reports").update({ outage_id: ch.outage.id }).eq("suburb", suburb).eq("status", "accepted").gte("created_at", win);
      await log("info", "reports", "community cluster outage created", { suburb, offCount });
      return { ok: true, status, message: "Thanks – enough independent reports now suggest a possible outage. It is shown as unverified.", clusterOutageId: ch.outage.id };
    }
  }
  return { ok: true, status, message: `Thanks – report received (${offCount}/${clusterThreshold()} independent reports needed to flag a possible widespread outage).` };
}
