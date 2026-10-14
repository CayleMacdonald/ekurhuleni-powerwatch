import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger";
import { applyChange } from "../outages-write";
import type { Outage } from "../types";
import { parseNotice } from "./parse";
import { ADAPTERS } from "./registry";
import type { SourceRow } from "./types";

export interface IngestSummary {
  checked: number;
  sources: { id: string; status: "ok" | "error" | "not_due"; fetched?: number; created?: number; updated?: number; skipped?: number; error?: string }[];
}

const isDue = (s: SourceRow, now: number) => !s.last_run_at || now - new Date(s.last_run_at).getTime() >= s.interval_minutes * 60_000 - 15_000;

/** Called by the cron route. Only enabled sources are touched; nothing is ever fabricated. */
export async function runIngestion(sb: SupabaseClient, opts: { force?: boolean; sourceId?: string } = {}): Promise<IngestSummary> {
  const { data: sources } = await sb.from("sources").select("*").eq("enabled", true);
  const list = ((sources ?? []) as SourceRow[]).filter((s) => !opts.sourceId || s.id === opts.sourceId);
  const out: IngestSummary = { checked: 0, sources: [] };
  const now = Date.now();

  for (const s of list) {
    if (!opts.force && !isDue(s, now)) {
      out.sources.push({ id: s.id, status: "not_due" });
      continue;
    }
    out.checked++;
    const adapter = ADAPTERS[s.adapter];
    try {
      if (!adapter) throw new Error(`No adapter "${s.adapter}" registered`);
      const notices = await adapter.fetch(s);
      const { data: seen } = await sb.from("raw_notices").select("external_id").eq("source_id", s.id).in("external_id", notices.map((n) => n.externalId));
      const seenSet = new Set((seen ?? []).map((r) => r.external_id));
      let created = 0, updated = 0, skipped = 0;

      // oldest first so progress updates are applied in order
      for (const n of notices.filter((n) => !seenSet.has(n.externalId)).sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""))) {
        const parsed = parseNotice(n.title, n.body, n.publishedAt);
        let outageId: string | null = null;
        let result = "skipped";
        if (parsed.relevant) {
          const verification = s.verified_publisher ? "verified" : "unverified";
          const { data: active } = await sb
            .from("outages")
            .select("*")
            .neq("status", "restored")
            .eq("planned", parsed.planned)
            .overlaps("suburbs", parsed.suburbs)
            .order("updated_at", { ascending: false })
            .limit(1);
          const existing = (active?.[0] as Outage | undefined) ?? null;
          const trustOk = !existing || s.verified_publisher || existing.verification !== "verified";
          if (existing && !trustOk) {
            outageId = existing.id; // unverified notice cannot override a verified record
            result = "matched_no_change";
          } else if (!existing && parsed.status === "restored") {
            result = "skipped"; // restoration notice for an outage we never recorded: nothing to update
          } else {
            const ch = await applyChange(
              sb,
              existing,
              {
                status: parsed.status,
                planned: parsed.planned,
                suburbs: parsed.suburbs,
                streets: parsed.streets,
                ward: parsed.ward,
                substation: parsed.substation,
                feeder: parsed.feeder,
                title: n.title.slice(0, 160),
                eta_at: parsed.eta ?? undefined,
                eta_kind: parsed.eta ? (s.verified_publisher ? "official" : "community") : undefined,
                eta_note: parsed.eta ? (s.verified_publisher ? `Stated in notice: "${parsed.etaText}"` : "Estimate from an unverified source") : undefined,
                message: n.title,
              },
              { kind: s.kind, id: s.id, name: s.name, url: n.url, publishedAt: n.publishedAt, verification },
            );
            outageId = ch?.outage.id ?? existing?.id ?? null;
            result = "matched";
            if (ch) existing ? updated++ : created++;
          }
        } else skipped++;
        await sb.from("raw_notices").insert({
          source_id: s.id,
          external_id: n.externalId,
          title: n.title.slice(0, 300),
          body: n.body.slice(0, 4000),
          url: n.url,
          published_at: n.publishedAt,
          parse_result: result,
          outage_id: outageId,
        });
      }
      await sb.from("sources").update({ last_run_at: new Date().toISOString(), last_status: "ok", last_error: null }).eq("id", s.id);
      out.sources.push({ id: s.id, status: "ok", fetched: notices.length, created, updated, skipped });
      await log("info", "ingest", `source ${s.id} ok`, { fetched: notices.length, created, updated, skipped });
    } catch (e) {
      const msg = (e as Error).message;
      await sb.from("sources").update({ last_run_at: new Date().toISOString(), last_status: "error", last_error: msg }).eq("id", s.id);
      out.sources.push({ id: s.id, status: "error", error: msg });
      await log("error", "ingest", `source ${s.id} failed`, { error: msg });
    }
  }
  return out;
}
