import { SOURCE_KIND_LABEL, VERIFICATION_LABEL } from "@/lib/constants";
import { fmtDateTime } from "@/lib/time";
import type { Outage } from "@/lib/types";

export function SourceLine({ o }: { o: Outage }) {
  const verified = o.verification === "verified";
  return (
    <div className="space-y-0.5 text-xs text-slate-600">
      <p>
        <span className={`chip ${verified ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}`}>
          {verified ? "✓ " : ""}{VERIFICATION_LABEL[o.verification]}
        </span>
      </p>
      <p>
        Source: {o.source_url ? <a className="underline" href={o.source_url} target="_blank" rel="noopener noreferrer">{o.source_name}</a> : o.source_name}
        <span className="text-slate-500"> ({SOURCE_KIND_LABEL[o.source_kind]})</span>
      </p>
      <p>
        Last updated {fmtDateTime(o.updated_at)}
        {o.source_published_at ? ` · published by source ${fmtDateTime(o.source_published_at)}` : ""}
        {o.report_count > 0 ? ` · ${o.report_count} resident report${o.report_count === 1 ? "" : "s"}` : ""}
      </p>
    </div>
  );
}
