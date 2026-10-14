"use client";
import { useEffect, useState } from "react";
import { etaView } from "@/lib/eta";
import { fmtDateTime, fmtDuration } from "@/lib/time";
import type { Outage } from "@/lib/types";

/**
 * Restoration estimate. Three mutually exclusive presentations:
 *  - official (verified publisher): shown with a live countdown
 *  - community prediction: labelled, never counted down
 *  - none: "Restoration time not confirmed"
 */
export function EtaBlock({ outage, compact = false }: { outage: Outage; compact?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const v = etaView(outage, now ?? new Date(outage.updated_at).getTime());

  if (v.state === "restored") {
    return <p className="text-sm font-medium text-st-restored">Power restored{outage.restored_at ? ` · ${fmtDateTime(outage.restored_at)}` : ""}</p>;
  }
  if (v.state === "none") {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <span className="font-semibold">Restoration time not confirmed</span>
        {!compact && <span className="block text-xs text-slate-500">No reliable estimate has been published. This will update when one is.</span>}
      </div>
    );
  }
  if (v.state === "community") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <span className="chip bg-amber-200 text-amber-950">Community prediction</span>{" "}
        <span className="font-semibold">~{fmtDateTime(v.at)}</span>
        {!compact && <span className="block text-xs">Not confirmed by the municipality. {v.note ?? ""}</span>}
      </div>
    );
  }
  const rem = v.remainingMs;
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
      <span className="chip bg-emerald-700 text-white">Official estimate</span>{" "}
      <span className="font-semibold">{fmtDateTime(v.at)}</span>
      <div className="mt-1" aria-live="polite">
        {now === null ? null : v.overdue ? (
          <span className="font-semibold text-red-800">Estimate passed {fmtDuration(-rem)} ago – awaiting an update</span>
        ) : (
          <span className="text-lg font-bold tabular-nums">{fmtDuration(rem)} <span className="text-sm font-medium">remaining</span></span>
        )}
      </div>
      {!compact && v.note && <span className="block text-xs">{v.note}</span>}
    </div>
  );
}
