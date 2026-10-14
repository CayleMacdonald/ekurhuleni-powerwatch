"use client";
import { useState } from "react";
import { GAZETTEER } from "@/lib/constants";

const TYPES = [
  { v: "outage", label: "Report a new outage", help: "Power is off and nothing is shown for my area" },
  { v: "still_off", label: "Power is still off", help: "Confirm an existing outage" },
  { v: "restored", label: "Power is back", help: "Confirm restoration" },
] as const;

export function ReportForm({ defaults }: { defaults: { type?: string; suburb?: string; ward?: string } }) {
  const [type, setType] = useState<string>(TYPES.some((t) => t.v === defaults.type) ? defaults.type! : "outage");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const f = new FormData(e.currentTarget);
    const started = String(f.get("started_at") ?? "");
    const body = {
      type,
      suburb: String(f.get("suburb") ?? ""),
      street: String(f.get("street") ?? ""),
      ward: String(f.get("ward") ?? ""),
      started_at: started ? new Date(started).toISOString() : "",
      notes: String(f.get("notes") ?? ""),
      website: String(f.get("website") ?? ""), // honeypot
    };
    try {
      const r = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      setMsg({ ok: r.ok, text: j.message ?? j.error ?? "Something went wrong" });
      if (r.ok && !j.demo) (e.target as HTMLFormElement).reset();
    } catch {
      setMsg({ ok: false, text: "Network error – please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
      <fieldset>
        <legend className="label">What are you reporting?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPES.map((t) => (
            <label key={t.v} className={`flex min-h-[44px] cursor-pointer flex-col rounded-lg border p-3 text-sm ${type === t.v ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-slate-300"}`}>
              <span className="flex items-center gap-2 font-semibold"><input type="radio" name="type" checked={type === t.v} onChange={() => setType(t.v)} /> {t.label}</span>
              <span className="text-xs text-slate-600">{t.help}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="suburb" className="label">Suburb *</label>
          <input id="suburb" name="suburb" required list="suburbs" className="input" defaultValue={defaults.suburb} autoComplete="off" />
          <datalist id="suburbs">{GAZETTEER.map((g) => <option key={g.name} value={g.name} />)}</datalist>
        </div>
        <div>
          <label htmlFor="street" className="label">Street</label>
          <input id="street" name="street" className="input" maxLength={120} autoComplete="street-address" />
        </div>
        <div>
          <label htmlFor="ward" className="label">Ward number</label>
          <input id="ward" name="ward" inputMode="numeric" pattern="[0-9]*" className="input" defaultValue={defaults.ward} />
        </div>
        <div>
          <label htmlFor="started_at" className="label">When did the power go off?</label>
          <input id="started_at" name="started_at" type="datetime-local" className="input" max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} />
        </div>
      </div>
      <div>
        <label htmlFor="notes" className="label">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={3} maxLength={500} className="input" placeholder="e.g. heard a bang, whole street is off" />
        <p className="mt-1 text-xs text-slate-500">Please don&apos;t include phone numbers, links or personal details.</p>
      </div>
      {/* honeypot – hidden from people */}
      <div className="hidden" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>

      <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Sending…" : "Submit report"}</button>
      {msg && <p role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{msg.text}</p>}
      <p className="text-xs text-slate-500">Community reports are always labelled <strong>unverified</strong>. Several independent reports are needed before a possible widespread outage is shown. Your IP address is not stored – only a salted, one-way hash used to stop duplicates and abuse.</p>
    </form>
  );
}
