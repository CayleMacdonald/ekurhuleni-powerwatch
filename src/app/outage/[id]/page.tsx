import Link from "next/link";
import { notFound } from "next/navigation";
import { EtaBlock } from "@/components/EtaBlock";
import { SourceLine } from "@/components/SourceLine";
import { StatusBadge } from "@/components/StatusBadge";
import { EVENT_LABEL, STATUS_META, STATUS_ORDER } from "@/lib/constants";
import { getOutage } from "@/lib/data";
import { fmtDateTime, fmtDuration, outageDurationMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function OutagePage({ params }: { params: { id: string } }) {
  const { outage: o, updates } = await getOutage(params.id);
  if (!o) notFound();
  const idx = STATUS_ORDER.indexOf(o.status);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/" className="text-sm underline">← All outages</Link>
      <div className="card space-y-3 p-5">
        <div className="flex flex-wrap gap-2"><StatusBadge status={o.status} />{o.is_demo && <span className="chip bg-gold-400">DEMO</span>}</div>
        <h1 className="text-2xl font-extrabold text-brand-900">{o.title}</h1>

        <ol aria-label="Progress" className="grid grid-cols-5 gap-1 text-center text-[11px] sm:text-xs">
          {STATUS_ORDER.map((s, i) => (
            <li key={s} className={`rounded-md px-1 py-2 font-medium ${i <= idx ? "text-white" : "bg-slate-100 text-slate-500"}`} style={i <= idx ? { background: STATUS_META[s].hex } : undefined} aria-current={i === idx ? "step" : undefined}>
              {STATUS_META[s].label}
            </li>
          ))}
        </ol>

        <EtaBlock outage={o} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Suburbs</dt><dd>{o.suburbs.join(", ") || "—"}</dd>
          <dt className="text-slate-500">Streets</dt><dd>{o.streets.join(", ") || "Not specified by source"}</dd>
          <dt className="text-slate-500">Ward</dt><dd>{o.ward ?? "Not specified"}</dd>
          <dt className="text-slate-500">Substation</dt><dd>{o.substation ?? "Not specified"}</dd>
          <dt className="text-slate-500">Feeder</dt><dd>{o.feeder ?? "Not specified"}</dd>
          <dt className="text-slate-500">Started</dt><dd>{fmtDateTime(o.started_at)}</dd>
          <dt className="text-slate-500">Duration</dt><dd>{fmtDuration(outageDurationMs(o))}</dd>
        </dl>
        <SourceLine o={o} />
        {o.status !== "restored" && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Link className="btn-primary" href={`/report?type=still_off&suburb=${encodeURIComponent(o.suburbs[0] ?? "")}`}>Power is still off here</Link>
            <Link className="btn-ghost" href={`/report?type=restored&suburb=${encodeURIComponent(o.suburbs[0] ?? "")}`}>Power is back here</Link>
          </div>
        )}
        {o.verification !== "verified" && <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700">This information is <strong>unverified</strong>. A resident-report cluster never changes an officially published status, and no restoration time is shown as official unless the municipality published it.</p>}
      </div>

      <section className="card p-5" aria-labelledby="tl">
        <h2 id="tl" className="text-lg font-bold">Timeline</h2>
        {updates.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No recorded updates yet.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
            {updates.map((u) => (
              <li key={u.id}>
                <p className="text-xs text-slate-500">{fmtDateTime(u.created_at)}</p>
                <p className="text-sm font-semibold">{EVENT_LABEL[u.event]} · {STATUS_META[u.status].label}</p>
                {u.event === "eta_changed" && <p className="text-sm">Restoration estimate {u.previous_eta_at ? `moved from ${fmtDateTime(u.previous_eta_at)} to ` : "set to "}{fmtDateTime(u.eta_at)} ({u.eta_kind === "official" ? "official" : "unconfirmed"})</p>}
                {u.message && <p className="text-sm text-slate-700">{u.message}</p>}
                <p className="text-xs text-slate-500">Source: {u.source_url ? <a className="underline" href={u.source_url} target="_blank" rel="noopener noreferrer">{u.source_name}</a> : u.source_name}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
