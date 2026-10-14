import type { Outage } from "./types";

export type EtaView =
  | { state: "official"; at: string; remainingMs: number; overdue: boolean; note: string | null }
  | { state: "community"; at: string; note: string | null }
  | { state: "none" }
  | { state: "restored" };

/**
 * Single source of truth for how a restoration time is presented.
 * - Countdown is only ever produced for OFFICIAL ETAs from a verified publisher.
 * - Community predictions are labelled and never counted down.
 * - No ETA => "Restoration time not confirmed".
 */
export function etaView(o: Pick<Outage, "status" | "eta_at" | "eta_kind" | "eta_note" | "verification">, now = Date.now()): EtaView {
  if (o.status === "restored") return { state: "restored" };
  if (!o.eta_at || !o.eta_kind) return { state: "none" };
  const at = new Date(o.eta_at).getTime();
  if (o.eta_kind === "official" && o.verification === "verified") {
    return { state: "official", at: o.eta_at, remainingMs: at - now, overdue: at < now, note: o.eta_note };
  }
  return { state: "community", at: o.eta_at, note: o.eta_note };
}
