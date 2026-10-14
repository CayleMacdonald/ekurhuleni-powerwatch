"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SOURCE_KIND_LABEL, STATUS_META, STATUS_ORDER } from "@/lib/constants";
import { loadAreas, type MyArea } from "@/lib/areas-store";
import { haversineKm } from "@/lib/geo";
import { outageDurationMs } from "@/lib/time";
import type { Outage, SourceKind } from "@/lib/types";
import { OutageCard } from "./OutageCard";
import { timeAgo } from "@/lib/time";

const OutageMap = dynamic(() => import("./OutageMap"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Loading map…</div> });

type Scope = "active" | "restored" | "all";

function inMyAreas(o: Outage, areas: MyArea[]) {
  return areas.some((a) => {
    const v = a.value.toLowerCase();
    if (a.kind === "suburb") return o.suburbs.some((s) => s.toLowerCase() === v);
    if (a.kind === "ward") return o.ward !== null && String(o.ward) === a.value;
    if (a.kind === "street") return o.streets.some((s) => s.toLowerCase().includes(v));
    if (a.kind === "location" && a.lat != null && a.lng != null && o.lat != null && o.lng != null)
      return haversineKm(a.lat, a.lng, o.lat, o.lng) * 1000 <= 1000 + (o.radius_m ?? 0);
    return false;
  });
}

export function Dashboard({ outages, demo, lastSourceCheck, error, title, initialScope = "active" }: { outages: Outage[]; demo: boolean; lastSourceCheck?: string | null; error?: string; title?: string; initialScope?: Scope }) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>(initialScope);
  const [src, setSrc] = useState<"all" | SourceKind>("all");
  const [minHours, setMinHours] = useState(0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"list" | "map">("list");
  const [areas, setAreas] = useState<MyArea[]>([]);
  const [showF, setShowF] = useState(false);

  useEffect(() => {
    const sync = () => setAreas(loadAreas());
    sync();
    window.addEventListener("pw-areas", sync);
    return () => window.removeEventListener("pw-areas", sync);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^ward\s*/, "");
    const now = Date.now();
    return outages
      .filter((o) => (scope === "all" ? true : scope === "active" ? o.status !== "restored" : o.status === "restored"))
      .filter((o) => src === "all" || o.source_kind === src)
      .filter((o) => !verifiedOnly || o.verification === "verified")
      .filter((o) => outageDurationMs(o, now) >= minHours * 3.6e6)
      .filter((o) => {
        if (!needle) return true;
        return [o.title, ...o.suburbs, ...o.streets, o.substation ?? "", o.feeder ?? "", o.ward != null ? String(o.ward) : ""].some((t) => t.toLowerCase().includes(needle));
      })
      .map((o) => ({ o, mine: inMyAreas(o, areas) }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || Number(a.o.status === "restored") - Number(b.o.status === "restored") || b.o.updated_at.localeCompare(a.o.updated_at));
  }, [outages, q, scope, src, minHours, verifiedOnly, areas]);

  const activeCount = outages.filter((o) => o.status !== "restored").length;
  const counts = STATUS_ORDER.map((s) => ({ s, n: outages.filter((o) => o.status === s).length }));

  return (
    <div className="space-y-4">
      {title && <h1 className="text-2xl font-extrabold text-brand-900">{title}</h1>}
      {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">Could not load outage data: {error}</div>}

      <section aria-label="Summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {counts.map(({ s, n }) => (
          <div key={s} className="card flex items-center gap-2 p-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${STATUS_META[s].color}`} aria-hidden>{STATUS_META[s].icon}</span>
            <div><div className="text-xl font-bold leading-none tabular-nums">{n}</div><div className="text-xs text-slate-600">{STATUS_META[s].label}</div></div>
          </div>
        ))}
      </section>

      {!demo && (
        <p className="text-xs text-slate-600">
          {lastSourceCheck ? `Sources last checked ${timeAgo(lastSourceCheck)}.` : "No live source has been checked yet."} PowerWatch only shows what sources publish or residents report – an empty
          list means nothing is currently recorded, not a guarantee that power is on.{" "}
          {areas.length === 0 && <Link href="/settings" className="font-semibold underline">Choose your area</Link>}
        </p>
      )}

      <section aria-label="Search and filters" className="card grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label htmlFor="q" className="label">Search suburb, street, ward, substation or feeder</label>
          <input id="q" type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Witfield, ward 22, Maple Substation" />
        </div>
        <button type="button" className="btn-ghost sm:hidden" aria-expanded={showF} onClick={() => setShowF(!showF)}>{showF ? "Hide filters" : "More filters"}</button>
        <div className={`${showF ? "contents" : "hidden"} sm:contents`}>
        <div>
          <label htmlFor="scope" className="label">Show</label>
          <select id="scope" className="input" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="active">Active outages</option>
            <option value="restored">Restored power</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label htmlFor="dur" className="label">Outage duration</label>
          <select id="dur" className="input" value={minHours} onChange={(e) => setMinHours(Number(e.target.value))}>
            <option value={0}>Any</option><option value={1}>1 hour or more</option><option value={4}>4 hours or more</option><option value={12}>12 hours or more</option><option value={24}>24 hours or more</option>
          </select>
        </div>
        <div>
          <label htmlFor="src" className="label">Source</label>
          <select id="src" className="input" value={src} onChange={(e) => setSrc(e.target.value as "all" | SourceKind)}>
            <option value="all">All sources</option>
            {(Object.keys(SOURCE_KIND_LABEL) as SourceKind[]).map((k) => <option key={k} value={k}>{SOURCE_KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2 lg:col-span-5">
          <input type="checkbox" className="h-5 w-5" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} /> Verified official sources only
        </label>
        </div>
      </section>

      <div className="flex gap-2 lg:hidden" role="tablist" aria-label="View">
        {(["list", "map"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`btn flex-1 ${tab === t ? "bg-brand-800 text-white" : "border border-slate-300 bg-white"}`}>
            {t === "list" ? `List (${filtered.length})` : "Map"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(340px,440px)_1fr]">
        <section aria-label="Outage list" className={`${tab === "map" ? "hidden lg:block" : ""} space-y-3 lg:max-h-[72vh] lg:overflow-y-auto lg:pr-1`}>
          <p className="text-sm text-slate-600" aria-live="polite">{filtered.length} result{filtered.length === 1 ? "" : "s"}{scope === "active" ? ` · ${activeCount} active in total` : ""}</p>
          {filtered.length === 0 && (
            <div className="card p-6 text-center text-sm text-slate-600">
              {demo ? "No demo outages match these filters." : "No outages match. Nothing is currently recorded for this view."}
              <div className="mt-3"><Link href="/report" className="btn-primary">Report an outage</Link></div>
            </div>
          )}
          {filtered.map(({ o, mine }) => (
            <OutageCard key={o.id} o={o} mine={mine} selected={selected === o.id} onSelect={() => { setSelected(o.id); setTab("map"); }} />
          ))}
        </section>
        <section aria-label="Outage map" className={`${tab === "list" ? "hidden lg:block" : ""} card overflow-hidden`}>
          <div className="h-[60vh] lg:h-[72vh]">
            <OutageMap outages={filtered.map((f) => f.o)} selectedId={selected} onSelect={setSelected} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            {STATUS_ORDER.map((s) => <span key={s} className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{ background: STATUS_META[s].hex }} aria-hidden />{STATUS_META[s].label}</span>)}
            <span>Dashed ring = unverified</span>
          </div>
        </section>
      </div>
    </div>
  );
}
