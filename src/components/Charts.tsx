import type { Summary } from "@/lib/analytics";

/** Accessible CSS bar chart with a text table fallback (screen readers get the table). */
export function BarChart({ rows, label, unit, valueKey }: { rows: Summary[]; label: string; unit: string; valueKey: "count" | "totalHours" }) {
  const data = [...rows].reverse();
  const max = Math.max(1, ...data.map((r) => r[valueKey]));
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold">{label}</figcaption>
      {data.length === 0 ? (
        <p className="text-sm text-slate-600">No data in this period.</p>
      ) : (
        <>
          <div className="flex h-40 items-end gap-1" aria-hidden>
            {data.map((r) => (
              <div key={r.key} className="flex h-full flex-1 flex-col justify-end" title={`${r.key}: ${r[valueKey].toFixed(valueKey === "count" ? 0 : 1)} ${unit}`}>
                <div className="mx-auto w-full max-w-10 rounded-t bg-brand-600" style={{ height: `${(r[valueKey] / max) * 100}%`, minHeight: 2 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1 text-[10px] text-slate-500" aria-hidden>
            {data.map((r) => <span key={r.key} className="flex-1 truncate text-center">{r.key.slice(-5)}</span>)}
          </div>
          <table className="sr-only">
            <caption>{label}</caption>
            <thead><tr><th>Period</th><th>{unit}</th></tr></thead>
            <tbody>{data.map((r) => <tr key={r.key}><td>{r.key}</td><td>{r[valueKey].toFixed(1)}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </figure>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-extrabold tabular-nums text-brand-900">{value}</div>
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
