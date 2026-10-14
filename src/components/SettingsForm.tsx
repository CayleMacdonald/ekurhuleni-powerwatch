"use client";
import { useCallback, useEffect, useState } from "react";
import { GAZETTEER, EVENT_LABEL } from "@/lib/constants";
import { loadAreas, saveAreas, type MyArea } from "@/lib/areas-store";
import type { NotifyChannel, NotifyEvent } from "@/lib/types";

interface Sub { id?: string; kind: MyArea["kind"]; value: string; lat?: number | null; lng?: number | null; channels: NotifyChannel[]; events: NotifyEvent[] }
interface Profile { email: string | null; whatsapp_number: string | null; whatsapp_opt_in: boolean; email_opt_in: boolean }

const ALL_EVENTS = Object.keys(EVENT_LABEL) as NotifyEvent[];

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function SettingsForm({ demo, prefill, vapidKey }: { demo: boolean; prefill: { suburb?: string; ward?: string }; vapidKey: string }) {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(demo ? false : null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [channels, setChannels] = useState<NotifyChannel[]>(["push"]);
  const [events, setEvents] = useState<NotifyEvent[]>(ALL_EVENTS);
  const [kind, setKind] = useState<MyArea["kind"]>("suburb");
  const [value, setValue] = useState(prefill.suburb ?? "");
  const [wa, setWa] = useState("");
  const [waOpt, setWaOpt] = useState(false);
  const [emailOpt, setEmailOpt] = useState(true);
  const [note, setNote] = useState<{ ok: boolean; t: string } | null>(null);
  const [pushOn, setPushOn] = useState(false);

  const refresh = useCallback(async () => {
    if (demo) { setSubs(loadAreas().map((a) => ({ ...a, channels: [], events: [] }))); return; }
    const r = await fetch("/api/subscriptions");
    if (r.status === 401) { setSignedIn(false); setSubs(loadAreas().map((a) => ({ ...a, channels: [], events: [] }))); return; }
    const j = await r.json();
    setSignedIn(true);
    setSubs(j.subscriptions ?? []);
    setPushOn(Boolean(j.pushEnabled));
    if (j.profile) { setProfile(j.profile); setWa(j.profile.whatsapp_number ?? ""); setWaOpt(j.profile.whatsapp_opt_in); setEmailOpt(j.profile.email_opt_in); }
    saveAreas((j.subscriptions ?? []).map((s: Sub) => ({ kind: s.kind, value: s.value, lat: s.lat ?? undefined, lng: s.lng ?? undefined })));
  }, [demo]);
  useEffect(() => { refresh(); }, [refresh]);

  const flash = (ok: boolean, t: string) => setNote({ ok, t });

  async function add(a?: { kind: MyArea["kind"]; value: string; lat?: number; lng?: number }) {
    const item = a ?? { kind, value: value.trim() };
    if (!item.value) return flash(false, "Enter a suburb, ward number or street first.");
    if (item.kind === "ward" && !/^\d{1,3}$/.test(item.value)) return flash(false, "Ward must be a number, e.g. 22.");
    // always keep a local copy so the dashboard prioritises it immediately
    const local = loadAreas().filter((x) => !(x.kind === item.kind && x.value.toLowerCase() === item.value.toLowerCase()));
    saveAreas([...local, item]);
    if (signedIn) {
      const r = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...item, channels: channels.length ? channels : ["push"], events }) });
      if (!r.ok) return flash(false, (await r.json()).error ?? "Could not save");
    }
    setValue("");
    flash(true, `Saved ${item.kind}: ${item.value}.`);
    refresh();
  }

  async function remove(s: Sub) {
    saveAreas(loadAreas().filter((x) => !(x.kind === s.kind && x.value === s.value)));
    if (signedIn && s.id) await fetch(`/api/subscriptions?id=${s.id}`, { method: "DELETE" });
    refresh();
  }

  function locate() {
    if (!navigator.geolocation) return flash(false, "Location is not available in this browser.");
    navigator.geolocation.getCurrentPosition(
      (p) => add({ kind: "location", value: "My location", lat: Number(p.coords.latitude.toFixed(4)), lng: Number(p.coords.longitude.toFixed(4)) }),
      () => flash(false, "Could not get your location. You can type your suburb instead."),
      { timeout: 10_000 },
    );
  }

  async function enablePush() {
    try {
      if (!vapidKey) return flash(false, "Push is not configured on this server (missing VAPID key).");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return flash(false, "This browser does not support push notifications.");
      if ((await Notification.requestPermission()) !== "granted") return flash(false, "Notifications were blocked in your browser.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey) });
      const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) return flash(false, "Could not register this device.");
      setPushOn(true);
      flash(true, "Browser notifications enabled on this device.");
    } catch (e) {
      flash(false, (e as Error).message);
    }
  }

  async function saveProfile() {
    const r = await fetch("/api/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsapp_number: wa.trim() || null, whatsapp_opt_in: waOpt, email_opt_in: emailOpt }) });
    flash(r.ok, r.ok ? "Contact preferences saved." : (await r.json()).error);
  }

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="space-y-5">
      {demo && <p className="rounded-lg bg-gold-400 p-3 text-sm font-semibold">Demo mode: areas are saved on this device only and no alerts will be sent.</p>}
      {signedIn === false && !demo && (
        <p className="card p-4 text-sm">Your areas are saved on this device and prioritised on the map. <a className="font-semibold underline" href="/login?next=/settings">Sign in</a> to receive push, email or WhatsApp alerts.</p>
      )}

      <section className="card space-y-3 p-5" aria-labelledby="add">
        <h2 id="add" className="text-lg font-bold">Add an area</h2>
        <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
          <div><label htmlFor="k" className="label">Type</label>
            <select id="k" className="input" value={kind} onChange={(e) => setKind(e.target.value as MyArea["kind"])}><option value="suburb">Suburb</option><option value="ward">Ward</option><option value="street">Street</option></select></div>
          <div><label htmlFor="v" className="label">{kind === "ward" ? "Ward number" : kind === "street" ? "Street name" : "Suburb"}</label>
            <input id="v" className="input" value={value} onChange={(e) => setValue(e.target.value)} list={kind === "suburb" ? "sub-list" : undefined} inputMode={kind === "ward" ? "numeric" : "text"} />
            <datalist id="sub-list">{GAZETTEER.map((g) => <option key={g.name} value={g.name} />)}</datalist></div>
          <div className="flex items-end gap-2"><button className="btn-primary" onClick={() => add()}>Add</button><button className="btn-ghost" onClick={locate} type="button">📍 Use my location</button></div>
        </div>
        {note && <p role="status" className={`rounded-lg p-2 text-sm ${note.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{note.t}</p>}
        <ul className="divide-y divide-slate-100">
          {subs.length === 0 && <li className="py-2 text-sm text-slate-500">No saved areas yet.</li>}
          {subs.map((s) => (
            <li key={`${s.kind}-${s.value}`} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span><span className="chip bg-slate-200 text-slate-800">{s.kind}</span> <strong>{s.kind === "ward" ? `Ward ${s.value}` : s.value}</strong></span>
              <button className="btn-ghost !min-h-[36px] !py-1" onClick={() => remove(s)} aria-label={`Remove ${s.value}`}>Remove</button>
            </li>
          ))}
        </ul>
      </section>

      {signedIn && (
        <>
          <section className="card space-y-3 p-5" aria-labelledby="ch">
            <h2 id="ch" className="text-lg font-bold">How should we alert you?</h2>
            <p className="text-xs text-slate-600">Applies to areas you add from now on.</p>
            <div className="flex flex-wrap gap-4">
              {(["push", "email", "whatsapp"] as NotifyChannel[]).map((c) => (
                <label key={c} className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={channels.includes(c)} onChange={() => setChannels(toggle(channels, c))} />{c === "push" ? "Browser push" : c === "email" ? "Email" : "WhatsApp"}</label>
              ))}
            </div>
            <fieldset><legend className="label">Alert me when…</legend>
              <div className="grid gap-1 sm:grid-cols-2">{ALL_EVENTS.map((ev) => <label key={ev} className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={events.includes(ev)} onChange={() => setEvents(toggle(events, ev))} />{EVENT_LABEL[ev]}</label>)}</div></fieldset>
          </section>

          <section className="card space-y-3 p-5" aria-labelledby="dev">
            <h2 id="dev" className="text-lg font-bold">Delivery details</h2>
            <div className="flex flex-wrap items-center gap-3"><button className="btn-ghost" onClick={enablePush}>{pushOn ? "✓ Push enabled – re-register this device" : "Enable browser notifications"}</button></div>
            <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={emailOpt} onChange={(e) => setEmailOpt(e.target.checked)} />Send email alerts to {profile?.email ?? "my account email"}</label>
            <div><label htmlFor="wa" className="label">WhatsApp number (international format)</label><input id="wa" className="input" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="+27821234567" inputMode="tel" /></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5" checked={waOpt} onChange={(e) => setWaOpt(e.target.checked)} />I agree to receive outage alerts on this WhatsApp number. I can opt out here at any time.</label>
            <button className="btn-primary" onClick={saveProfile}>Save delivery details</button>
          </section>
        </>
      )}
    </div>
  );
}
