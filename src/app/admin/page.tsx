import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_META, STATUS_ORDER } from "@/lib/constants";
import { isDemoMode } from "@/lib/config";
import { fmtDateTime } from "@/lib/time";
import { getSessionUser, supabaseAdmin } from "@/lib/supabase/server";
import type { Outage } from "@/lib/types";
import { deleteOutage, postOutageUpdate, reviewReport, runSourceNow, saveSource } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin – PowerWatch" };

interface SourceRow { id: string; name: string; adapter: string; kind: string; url: string | null; enabled: boolean; verified_publisher: boolean; interval_minutes: number; terms_note: string | null; last_run_at: string | null; last_status: string | null; last_error: string | null }

export default async function AdminPage() {
  if (isDemoMode()) return <p className="card p-5 text-sm">The admin panel requires Supabase. Configure it per the README.</p>;
  const { user, isAdmin } = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdmin) return <p role="alert" className="card p-5 text-sm">Your account does not have admin access. Ask an existing admin to set <code>role = &apos;admin&apos;</code> on your profile.</p>;

  const sb = supabaseAdmin();
  const [{ data: sources }, { data: outages }, { data: flagged }, { data: logs }, { data: queue }] = await Promise.all([
    sb.from("sources").select("*").order("name"),
    sb.from("outages").select("*").neq("status", "restored").order("updated_at", { ascending: false }).limit(50),
    sb.from("reports").select("*").eq("status", "flagged").order("created_at", { ascending: false }).limit(30),
    sb.from("app_logs").select("*").order("created_at", { ascending: false }).limit(40),
    sb.from("notification_queue").select("status"),
  ]);
  const q = (queue ?? []).reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold text-brand-900">Administration</h1>

      <section aria-labelledby="src" className="space-y-3">
        <h2 id="src" className="text-xl font-bold">Data sources</h2>
        <p className="text-sm text-slate-600">Sources are disabled until you add a URL and record why automated access is permitted. Only mark a source “verified publisher” if it is an official municipal/Eskom channel – only those can produce official ETAs.</p>
        {(sources as SourceRow[] | null)?.map((s) => (
          <form key={s.id} action={saveSource} className="card grid gap-3 p-4 md:grid-cols-6">
            <input type="hidden" name="id" value={s.id} /><input type="hidden" name="adapter" value={s.adapter} />
            <div className="md:col-span-6 flex flex-wrap items-center justify-between gap-2">
              <div><strong>{s.name}</strong> <span className="chip bg-slate-200">{s.adapter} · {s.kind}</span></div>
              <span className={`chip ${s.last_status === "ok" ? "bg-emerald-100 text-emerald-900" : s.last_status === "error" ? "bg-red-100 text-red-900" : "bg-slate-100"}`}>
                {s.last_status ?? "never run"}{s.last_run_at ? ` · ${fmtDateTime(s.last_run_at)}` : ""}
              </span>
            </div>
            {s.last_error && <p className="md:col-span-6 text-xs text-red-800">Last error: {s.last_error}</p>}
            <div className="md:col-span-3"><label className="label">URL</label><input name="url" defaultValue={s.url ?? ""} className="input" placeholder={s.adapter === "x" ? "(not used – set config.username in DB)" : "https://…"} /></div>
            <div><label className="label">Every (min)</label><input name="interval_minutes" type="number" min={1} defaultValue={s.interval_minutes} className="input" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={s.enabled} className="h-5 w-5" />Enabled</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified_publisher" defaultChecked={s.verified_publisher} className="h-5 w-5" />Verified publisher</label>
            <div className="md:col-span-6"><label className="label">Terms / permission note</label><textarea name="terms_note" defaultValue={s.terms_note ?? ""} rows={2} className="input" /></div>
            <div className="md:col-span-6 flex gap-2">
              <button className="btn-primary">Save</button>
              <button formAction={runSourceNow} className="btn-ghost" disabled={!s.enabled}>Run now</button>
            </div>
          </form>
        ))}
      </section>

      <section aria-labelledby="out" className="space-y-3">
        <h2 id="out" className="text-xl font-bold">Post an outage update</h2>
        <details className="card p-4"><summary className="cursor-pointer font-semibold">New outage / update (manual entry)</summary>
          <OutageForm outages={(outages ?? []) as Outage[]} />
        </details>
        <div className="space-y-2">
          {((outages ?? []) as Outage[]).map((o) => (
            <div key={o.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div><StatusBadge status={o.status} /> <Link className="font-semibold underline" href={`/outage/${o.id}`}>{o.title}</Link><div className="text-xs text-slate-500">{o.source_name} · {o.verification} · {fmtDateTime(o.updated_at)}</div></div>
              <form action={deleteOutage}><input type="hidden" name="id" value={o.id} /><button className="btn-ghost !min-h-[36px] text-red-800">Delete</button></form>
            </div>
          ))}
          {(outages ?? []).length === 0 && <p className="text-sm text-slate-600">No active outages.</p>}
        </div>
      </section>

      <section aria-labelledby="rep" className="space-y-3">
        <h2 id="rep" className="text-xl font-bold">Flagged community reports ({flagged?.length ?? 0})</h2>
        {(flagged ?? []).map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div><strong>{r.type}</strong> · {r.suburb}{r.street ? `, ${r.street}` : ""} · {fmtDateTime(r.created_at)}<div className="text-xs text-red-800">Flags: {r.flags.join(", ")}</div>{r.notes && <div className="text-xs text-slate-600">“{r.notes}”</div>}</div>
            <form action={reviewReport} className="flex gap-2"><input type="hidden" name="id" value={r.id} /><button name="decision" value="accept" className="btn-ghost !min-h-[36px]">Accept</button><button name="decision" value="reject" className="btn-ghost !min-h-[36px] text-red-800">Reject</button></form>
          </div>
        ))}
      </section>

      <section aria-labelledby="ops" className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4"><h2 id="ops" className="mb-2 text-lg font-bold">Notification queue</h2>
          <p className="text-sm">{["pending", "sent", "failed", "skipped"].map((k) => `${k}: ${q[k] ?? 0}`).join(" · ")}</p>
          <p className="mt-1 text-xs text-slate-500">“skipped” = provider not configured or contact missing.</p></div>
        <div className="card p-4"><h2 className="mb-2 text-lg font-bold">Recent logs</h2>
          <ul className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs">
            {(logs ?? []).map((l) => <li key={l.id} className={l.level === "error" ? "text-red-800" : l.level === "warn" ? "text-amber-800" : ""}>{fmtDateTime(l.created_at)} [{l.level}] {l.scope}: {l.message}</li>)}
          </ul></div>
      </section>
    </div>
  );
}

function OutageForm({ outages }: { outages: Outage[] }) {
  return (
    <form action={postOutageUpdate} className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2"><label className="label">Update existing outage (leave blank to create new)</label>
        <select name="outage_id" className="input"><option value="">— New outage —</option>{outages.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></div>
      <div><label className="label">Title (new)</label><input name="title" className="input" /></div>
      <div><label className="label">Suburbs (comma-separated; new)</label><input name="suburbs" className="input" /></div>
      <div><label className="label">Streets</label><input name="streets" className="input" /></div>
      <div><label className="label">Ward</label><input name="ward" inputMode="numeric" className="input" /></div>
      <div><label className="label">Substation</label><input name="substation" className="input" /></div>
      <div><label className="label">Feeder</label><input name="feeder" className="input" /></div>
      <div><label className="label">Status</label><select name="status" className="input">{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select></div>
      <div><label className="label">Restoration time (SAST) – only if a source gives one</label><input type="datetime-local" name="eta" className="input" /></div>
      <div className="md:col-span-2"><label className="label">Source link</label><input name="source_url" type="url" className="input" placeholder="https://…" /></div>
      <label className="md:col-span-2 flex items-start gap-2 text-sm"><input type="checkbox" name="official" className="mt-0.5 h-5 w-5" />This information comes from an official municipal/Eskom publication (source link required). Enables the “official” label and countdown.</label>
      <div className="md:col-span-2"><label className="label">Message shown in timeline / alerts</label><input name="message" maxLength={500} className="input" /></div>
      <div className="md:col-span-2"><button className="btn-primary">Publish &amp; notify subscribers</button></div>
    </form>
  );
}
