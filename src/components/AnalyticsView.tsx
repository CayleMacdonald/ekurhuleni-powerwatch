import type { Analytics } from "@/lib/analytics";
import { BarChart, Stat } from "./Charts";

const h = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} h`);

export function AnalyticsView({ a, demo, scopeLabel }: { a: Analytics; demo: boolean; scopeLabel: string }) {
  const none = a.total === 0;
  return (
    <div className="space-y-5">
      {demo && <p className="rounded-lg bg-gold-400 p-2 text-center text-sm font-semibold">Charts below are calculated from DEMONSTRATION data.</p>}
      {none && <p className="card p-4 text-sm text-slate-600">No outages recorded for {scopeLabel} yet. Statistics appear as sources and reports are collected; nothing is estimated.</p>}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Key figures">
        <Stat label="Outages recorded" value={String(a.total)} hint={`${a.active} active now`} />
        <Stat label="Average restoration" value={h(a.avgRestorationHours)} hint="restored outages only" />
        <Stat label="Median restoration" value={h(a.medianRestorationHours)} />
        <Stat label="Suburbs affected" value={String(a.affectedSuburbs)} />
        <Stat
          label="Official ETA met"
          value={a.etaPerformance ? `${a.etaPerformance.onTimePct.toFixed(0)}%` : "—"}
          hint={a.etaPerformance ? `n=${a.etaPerformance.sample}; avg ${a.etaPerformance.avgErrorMinutes >= 0 ? "+" : ""}${a.etaPerformance.avgErrorMinutes.toFixed(0)} min vs ETA` : "no restored outages with an official ETA yet"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4"><BarChart rows={a.daily} label="Outages per day (last 14 days)" unit="outages" valueKey="count" /></div>
        <div className="card p-4"><BarChart rows={a.monthly} label="Outage-hours per month" unit="hours" valueKey="totalHours" /></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto p-4">
          <h2 className="mb-2 text-lg font-bold">Daily summary</h2>
          <SummaryTable rows={a.daily} />
        </div>
        <div className="card overflow-x-auto p-4">
          <h2 className="mb-2 text-lg font-bold">Monthly summary</h2>
          <SummaryTable rows={a.monthly} />
        </div>
      </section>

      <section className="card overflow-x-auto p-4">
        <h2 className="text-lg font-bold">Recurring problem areas</h2>
        <p className="mb-2 text-xs text-slate-500">Flagged “recurring” when 3 or more outages started in the last 30 days.</p>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="py-1 pr-3">Suburb</th><th className="pr-3">Outages</th><th className="pr-3">Last 30 days</th><th className="pr-3">Total hours</th><th className="pr-3">Avg restoration</th><th /></tr></thead>
          <tbody>
            {a.areas.slice(0, 15).map((r) => (
              <tr key={r.suburb} className="border-t border-slate-100">
                <th scope="row" className="py-1.5 pr-3 font-medium">{r.suburb}</th>
                <td className="pr-3 tabular-nums">{r.count}</td><td className="pr-3 tabular-nums">{r.last30d}</td>
                <td className="pr-3 tabular-nums">{r.totalHours.toFixed(1)}</td><td className="pr-3 tabular-nums">{h(r.avgHours)}</td>
                <td>{r.recurring && <span className="chip bg-red-100 text-red-900">Recurring</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {a.communityEtaPerformance && (
        <p className="text-xs text-slate-600">Community predictions (n={a.communityEtaPerformance.sample}) were on average {a.communityEtaPerformance.avgErrorMinutes.toFixed(0)} min {a.communityEtaPerformance.avgErrorMinutes >= 0 ? "later" : "earlier"} than actual restoration.</p>
      )}
    </div>
  );
}

function SummaryTable({ rows }: { rows: Analytics["daily"] }) {
  if (!rows.length) return <p className="text-sm text-slate-600">No data.</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase text-slate-500"><tr><th className="py-1 pr-3">Period</th><th className="pr-3">Outages</th><th className="pr-3">Restored</th><th className="pr-3">Outage hours</th><th>Avg h</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-slate-100"><th scope="row" className="py-1.5 pr-3 font-medium">{r.key}</th><td className="pr-3 tabular-nums">{r.count}</td><td className="pr-3 tabular-nums">{r.restored}</td><td className="pr-3 tabular-nums">{r.totalHours.toFixed(1)}</td><td className="tabular-nums">{r.avgHours?.toFixed(1) ?? "—"}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
