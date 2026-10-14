import { TZ } from "./constants";

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
    : "—";

export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, timeStyle: "short" }).format(new Date(iso));

export function fmtDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  return `${fmtDuration(diff)} ago`;
}

/** Outage duration so far (or total if restored), in ms. */
export function outageDurationMs(o: { started_at: string; restored_at: string | null }, now = Date.now()): number {
  const end = o.restored_at ? new Date(o.restored_at).getTime() : now;
  return end - new Date(o.started_at).getTime();
}
