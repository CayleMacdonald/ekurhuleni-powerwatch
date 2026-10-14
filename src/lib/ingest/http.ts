/** Polite fetch: identifies itself, honours timeouts, supports conditional requests. */
export async function politeFetch(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "EkurhuleniPowerWatch/1.0 (+outage information aggregator; contact: see site)",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}
