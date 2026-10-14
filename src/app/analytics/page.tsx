import { AnalyticsView } from "@/components/AnalyticsView";
import { computeAnalytics } from "@/lib/analytics";
import { getOutages } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outage analytics – PowerWatch" };

export default async function AnalyticsPage() {
  const feed = await getOutages(365);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-brand-900">Outage analytics · Ekurhuleni</h1>
      <p className="text-sm text-slate-600">Based only on outages recorded by PowerWatch (last 12 months). Planned maintenance is excluded.</p>
      <AnalyticsView a={computeAnalytics(feed.outages)} demo={feed.demo} scopeLabel="Ekurhuleni" />
    </div>
  );
}
