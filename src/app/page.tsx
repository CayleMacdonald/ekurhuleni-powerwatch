import { Dashboard } from "@/components/Dashboard";
import { getOutages } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const feed = await getOutages();
  return <Dashboard outages={feed.outages} demo={feed.demo} lastSourceCheck={feed.lastSourceCheck} error={feed.error} />;
}
