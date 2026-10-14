import Link from "next/link";
import { STATUS_META } from "@/lib/constants";
import { fmtDuration, outageDurationMs } from "@/lib/time";
import type { Outage } from "@/lib/types";
import { EtaBlock } from "./EtaBlock";
import { SourceLine } from "./SourceLine";
import { StatusBadge } from "./StatusBadge";

export function OutageCard({ o, mine, selected, onSelect }: { o: Outage; mine?: boolean; selected?: boolean; onSelect?: () => void }) {
  return (
    <article
      className={`card p-4 ${selected ? "ring-2 ring-brand-600" : ""} ${o.status !== "restored" ? "border-l-4" : ""}`}
      style={o.status !== "restored" ? { borderLeftColor: STATUS_META[o.status].hex } : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={o.status} />
        {o.planned && <span className="chip bg-sky-100 text-sky-900">Planned maintenance</span>}
        {mine && <span className="chip bg-gold-400 text-slate-900">★ Your area</span>}
        {o.is_demo && <span className="chip bg-gold-400 text-slate-900">DEMO</span>}
      </div>
      <h3 className="mt-2 text-base font-bold leading-snug">
        <button type="button" onClick={onSelect} className="text-left hover:underline focus-visible:underline">{o.title}</button>
      </h3>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm text-slate-700">
        <dt className="text-slate-500">Suburbs</dt><dd>{o.suburbs.join(", ") || "—"}</dd>
        {o.streets.length > 0 && (<><dt className="text-slate-500">Streets</dt><dd>{o.streets.join(", ")}</dd></>)}
        {o.ward != null && (<><dt className="text-slate-500">Ward</dt><dd>{o.ward}</dd></>)}
        {o.substation && (<><dt className="text-slate-500">Substation</dt><dd>{o.substation}</dd></>)}
        {o.feeder && (<><dt className="text-slate-500">Feeder</dt><dd>{o.feeder}</dd></>)}
        <dt className="text-slate-500">Duration</dt>
        <dd>{fmtDuration(outageDurationMs(o))}{o.status === "restored" ? " (total)" : " so far"}</dd>
      </dl>
      <div className="mt-3"><EtaBlock outage={o} compact /></div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <SourceLine o={o} />
        {!o.is_demo && <Link href={`/outage/${o.id}`} className="btn-ghost !min-h-[36px] !py-1">Details &amp; timeline</Link>}
      </div>
    </article>
  );
}
