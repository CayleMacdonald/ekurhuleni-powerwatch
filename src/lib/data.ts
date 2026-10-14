import { isDemoMode } from "./config";
import { demoOutages } from "./demo";
import { supabaseServer } from "./supabase/server";
import type { Outage, OutageUpdate } from "./types";

export interface FeedResult {
  outages: Outage[];
  demo: boolean;
  error?: string;
  /** most recent time any real source was successfully checked */
  lastSourceCheck?: string | null;
}

/** Outages from the last `days` days plus everything still active. */
export async function getOutages(days = 90): Promise<FeedResult> {
  if (isDemoMode()) return { outages: demoOutages(), demo: true };
  try {
    const sb = supabaseServer();
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await sb
      .from("outages")
      .select("*")
      .or(`status.neq.restored,started_at.gte.${since}`)
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    let lastSourceCheck: string | null = null;
    const { data: s } = await sb.from("sources").select("last_run_at").order("last_run_at", { ascending: false }).limit(1);
    lastSourceCheck = s?.[0]?.last_run_at ?? null;
    return { outages: (data ?? []) as Outage[], demo: false, lastSourceCheck };
  } catch (e) {
    return { outages: [], demo: false, error: (e as Error).message };
  }
}

export async function getOutage(id: string): Promise<{ outage: Outage | null; updates: OutageUpdate[]; demo: boolean }> {
  if (isDemoMode()) {
    return { outage: demoOutages().find((o) => o.id === id) ?? null, updates: [], demo: true };
  }
  const sb = supabaseServer();
  const { data: outage } = await sb.from("outages").select("*").eq("id", id).maybeSingle();
  const { data: updates } = await sb
    .from("outage_updates")
    .select("*")
    .eq("outage_id", id)
    .order("created_at", { ascending: false });
  return { outage: (outage as Outage) ?? null, updates: (updates ?? []) as OutageUpdate[], demo: false };
}

/** Outage matches a user's area list (suburb / ward / street, case-insensitive). */
export function matchesAreas(o: Outage, areas: { kind: string; value: string }[]): boolean {
  return areas.some((a) => {
    const v = a.value.toLowerCase();
    if (a.kind === "suburb") return o.suburbs.some((s) => s.toLowerCase() === v);
    if (a.kind === "ward") return o.ward !== null && String(o.ward) === a.value;
    if (a.kind === "street") return o.streets.some((s) => s.toLowerCase().includes(v));
    return false;
  });
}
