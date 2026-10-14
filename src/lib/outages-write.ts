import type { SupabaseClient } from "@supabase/supabase-js";
import { findPlace } from "./constants";
import { enqueueNotifications } from "./notify";
import type { EtaKind, NotifyEvent, Outage, OutageStatus, OutageUpdate, SourceKind, Verification } from "./types";

export interface ChangeInput {
  title?: string;
  status: OutageStatus;
  planned?: boolean;
  suburbs?: string[];
  streets?: string[];
  ward?: number | null;
  substation?: string | null;
  feeder?: string | null;
  startedAt?: string | null;
  eta_at?: string | null;
  eta_kind?: EtaKind | null;
  eta_note?: string | null;
  message?: string | null;
}

export interface SourceInfo {
  kind: SourceKind;
  id: string | null;
  name: string;
  url: string | null;
  publishedAt: string | null;
  verification: Verification;
}

/**
 * The ONLY place outages are created/changed outside the admin SQL editor. It:
 *  - refuses to mark an ETA "official" unless the source is verified,
 *  - records a timeline entry (outage_updates) for every real change,
 *  - queues notifications for subscribers of the affected areas.
 * Returns null when nothing actually changed (no noise, no duplicate alerts).
 */
export async function applyChange(
  sb: SupabaseClient,
  existing: Outage | null,
  input: ChangeInput,
  src: SourceInfo,
): Promise<{ outage: Outage; update: OutageUpdate } | null> {
  const now = new Date().toISOString();
  const eta_kind: EtaKind | null = input.eta_at ? (input.eta_kind === "official" && src.verification !== "verified" ? "community" : input.eta_kind ?? "community") : null;
  const eta_at = input.eta_at ?? null;

  if (!existing) {
    const place = findPlace(input.suburbs?.[0] ?? "");
    const row = {
      title: input.title ?? `Outage – ${(input.suburbs ?? []).join(", ")}`,
      status: input.status,
      planned: input.planned ?? false,
      suburbs: input.suburbs ?? [],
      streets: input.streets ?? [],
      ward: input.ward ?? place?.ward ?? null,
      substation: input.substation ?? null,
      feeder: input.feeder ?? null,
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
      started_at: input.startedAt ?? src.publishedAt ?? now,
      updated_at: now,
      eta_at,
      eta_kind,
      eta_note: input.eta_note ?? null,
      source_kind: src.kind,
      source_id: src.id,
      source_name: src.name,
      source_url: src.url,
      source_published_at: src.publishedAt,
      verification: src.verification,
      report_count: src.kind === "community" ? 1 : 0,
    };
    const { data: outage, error } = await sb.from("outages").insert(row).select().single();
    if (error) throw error;
    const { data: update, error: e2 } = await sb
      .from("outage_updates")
      .insert({ outage_id: outage.id, event: "outage_reported", status: input.status, eta_at, eta_kind, message: input.message ?? null, source_name: src.name, source_url: src.url })
      .select()
      .single();
    if (e2) throw e2;
    await enqueueNotifications(sb, outage as Outage, update as OutageUpdate);
    return { outage: outage as Outage, update: update as OutageUpdate };
  }

  const etaChanged =
    input.eta_at !== undefined &&
    (new Date(eta_at ?? 0).getTime() !== new Date(existing.eta_at ?? 0).getTime() || eta_kind !== existing.eta_kind);
  const statusChanged = input.status !== existing.status;
  if (!etaChanged && !statusChanged) return null;

  let event: NotifyEvent = "repair_update";
  if (input.status === "restored" && existing.status !== "restored") event = "power_restored";
  else if (etaChanged && !statusChanged) event = "eta_changed";

  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: now,
    source_kind: src.kind,
    source_id: src.id,
    source_name: src.name,
    source_url: src.url,
    source_published_at: src.publishedAt,
    verification: src.verification === "verified" ? "verified" : existing.verification,
  };
  if (input.status === "restored") patch.restored_at = src.publishedAt ?? now;
  if (etaChanged) {
    patch.eta_at = eta_at;
    patch.eta_kind = eta_kind;
    patch.eta_note = input.eta_note ?? null;
  }
  // verified source may enrich location detail
  if (src.verification === "verified") {
    if (input.streets?.length) patch.streets = [...new Set([...existing.streets, ...input.streets])];
    if (input.substation) patch.substation = input.substation;
    if (input.feeder) patch.feeder = input.feeder;
    if (input.ward != null) patch.ward = input.ward;
  }
  // An official ETA requires the outage to be verified; downgrade otherwise.
  const finalVerification = (patch.verification as Verification) ?? existing.verification;
  if (patch.eta_kind === "official" && finalVerification !== "verified") patch.eta_kind = "community";

  const { data: outage, error } = await sb.from("outages").update(patch).eq("id", existing.id).select().single();
  if (error) throw error;
  const { data: update, error: e2 } = await sb
    .from("outage_updates")
    .insert({
      outage_id: existing.id,
      event,
      status: input.status,
      eta_at: (outage as Outage).eta_at,
      eta_kind: (outage as Outage).eta_kind,
      previous_eta_at: existing.eta_at,
      message: input.message ?? null,
      source_name: src.name,
      source_url: src.url,
    })
    .select()
    .single();
  if (e2) throw e2;
  await enqueueNotifications(sb, outage as Outage, update as OutageUpdate);
  return { outage: outage as Outage, update: update as OutageUpdate };
}
