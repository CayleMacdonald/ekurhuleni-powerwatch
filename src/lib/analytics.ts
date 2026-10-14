import type { Outage } from "./types";
import { TZ } from "./constants";

const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso)); // YYYY-MM-DD
const monthKey = (iso: string) => dayKey(iso).slice(0, 7);
const dur = (o: Outage, now: number) => (o.restored_at ? new Date(o.restored_at).getTime() : now) - new Date(o.started_at).getTime();

export interface Summary {
  key: string;
  count: number;
  restored: number;
  totalHours: number;
  avgHours: number | null;
}

export interface AreaStat {
  suburb: string;
  count: number;
  totalHours: number;
  avgHours: number | null;
  last30d: number;
  recurring: boolean;
}

export interface Analytics {
  total: number;
  active: number;
  restored: number;
  avgRestorationHours: number | null;
  medianRestorationHours: number | null;
  affectedSuburbs: number;
  daily: Summary[];
  monthly: Summary[];
  areas: AreaStat[];
  /** Official ETAs vs actual restoration. null when there is no evidence yet. */
  etaPerformance: { sample: number; onTimePct: number; avgErrorMinutes: number } | null;
  communityEtaPerformance: { sample: number; avgErrorMinutes: number } | null;
}

function summarise(items: Outage[], keyFn: (o: Outage) => string, now: number): Summary[] {
  const map = new Map<string, Outage[]>();
  items.forEach((o) => {
    const k = keyFn(o);
    map.set(k, [...(map.get(k) ?? []), o]);
  });
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, list]) => {
      const done = list.filter((o) => o.restored_at);
      const hours = list.reduce((s, o) => s + dur(o, now) / 3.6e6, 0);
      return {
        key,
        count: list.length,
        restored: done.length,
        totalHours: hours,
        avgHours: done.length ? done.reduce((s, o) => s + dur(o, now) / 3.6e6, 0) / done.length : null,
      };
    });
}

/** Pure function over outage records. Excludes planned maintenance from fault statistics. */
export function computeAnalytics(all: Outage[], now = Date.now(), ward?: number): Analytics {
  const outages = all.filter((o) => !o.planned && (ward === undefined || o.ward === ward));
  const restored = outages.filter((o) => o.status === "restored" && o.restored_at);
  const hrs = restored.map((o) => dur(o, now) / 3.6e6).sort((a, b) => a - b);
  const median = hrs.length ? (hrs.length % 2 ? hrs[(hrs.length - 1) / 2] : (hrs[hrs.length / 2 - 1] + hrs[hrs.length / 2]) / 2) : null;

  const per = new Map<string, Outage[]>();
  outages.forEach((o) => o.suburbs.forEach((s) => per.set(s, [...(per.get(s) ?? []), o])));
  const cut30 = now - 30 * 86_400_000;
  const areas: AreaStat[] = [...per.entries()]
    .map(([suburb, list]) => {
      const done = list.filter((o) => o.restored_at);
      const last30d = list.filter((o) => new Date(o.started_at).getTime() >= cut30).length;
      return {
        suburb,
        count: list.length,
        totalHours: list.reduce((s, o) => s + dur(o, now) / 3.6e6, 0),
        avgHours: done.length ? done.reduce((s, o) => s + dur(o, now) / 3.6e6, 0) / done.length : null,
        last30d,
        recurring: last30d >= 3,
      };
    })
    .sort((a, b) => b.count - a.count || b.totalHours - a.totalHours);

  const withOfficial = restored.filter((o) => o.eta_kind === "official" && o.eta_at);
  const withCommunity = restored.filter((o) => o.eta_kind === "community" && o.eta_at);
  const err = (o: Outage) => (new Date(o.restored_at!).getTime() - new Date(o.eta_at!).getTime()) / 60000;

  return {
    total: outages.length,
    active: outages.filter((o) => o.status !== "restored").length,
    restored: restored.length,
    avgRestorationHours: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null,
    medianRestorationHours: median,
    affectedSuburbs: per.size,
    daily: summarise(outages.filter((o) => now - new Date(o.started_at).getTime() < 14 * 86_400_000), (o) => dayKey(o.started_at), now),
    monthly: summarise(outages, (o) => monthKey(o.started_at), now).slice(0, 12),
    areas,
    etaPerformance: withOfficial.length
      ? {
          sample: withOfficial.length,
          onTimePct: (withOfficial.filter((o) => err(o) <= 0).length / withOfficial.length) * 100,
          avgErrorMinutes: withOfficial.reduce((s, o) => s + err(o), 0) / withOfficial.length,
        }
      : null,
    communityEtaPerformance: withCommunity.length
      ? { sample: withCommunity.length, avgErrorMinutes: withCommunity.reduce((s, o) => s + err(o), 0) / withCommunity.length }
      : null,
  };
}
