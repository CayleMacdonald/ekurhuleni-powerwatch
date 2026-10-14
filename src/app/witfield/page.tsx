import Link from "next/link";
import { AnalyticsView } from "@/components/AnalyticsView";
import { Dashboard } from "@/components/Dashboard";
import { computeAnalytics } from "@/lib/analytics";
import { WITFIELD } from "@/lib/constants";
import { getOutages } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Witfield, Boksburg (Ward 22) – PowerWatch" };

export default async function WitfieldPage() {
  const feed = await getOutages(365);
  const mine = feed.outages.filter((o) => o.suburbs.some((s) => s.toLowerCase() === "witfield") || o.ward === WITFIELD.ward);
  const active = mine.filter((o) => o.status !== "restored");
  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-gold-500 p-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-900">Witfield, Boksburg · Ward {WITFIELD.ward}</h1>
          <p className="text-sm text-slate-700" aria-live="polite">
            {active.length > 0
              ? `${active.length} active outage${active.length === 1 ? "" : "s"} recorded for this area.`
              : feed.demo
                ? "No active demo outage for Witfield."
                : "No active outage is currently recorded for Witfield. This reflects what sources and residents have reported – not a guarantee."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-primary" href="/settings?suburb=Witfield&ward=22">Get Witfield alerts</Link>
          <Link className="btn-ghost" href="/report?suburb=Witfield&ward=22">Report an outage</Link>
        </div>
      </section>
      <Dashboard outages={mine} demo={feed.demo} lastSourceCheck={feed.lastSourceCheck} error={feed.error} initialScope="all" showWitfieldCard={false} />
      <div>
        <h2 className="mb-3 text-xl font-bold">Witfield outage history</h2>
        <AnalyticsView a={computeAnalytics(mine)} demo={feed.demo} scopeLabel="Witfield" />
      </div>
    </div>
  );
}
