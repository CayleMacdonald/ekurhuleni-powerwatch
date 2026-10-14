import { politeFetch } from "../http";
import type { RawNotice, SourceAdapter, SourceRow } from "../types";

/**
 * Generic JSON API adapter. Configure field paths in sources.config, e.g.
 * { "itemsPath": "data.notices", "idField": "id", "titleField": "title",
 *   "bodyField": "description", "urlField": "link", "dateField": "published",
 *   "headers": { "Authorization": "Bearer ..." } }
 * Use this for any provider that offers a licensed JSON API.
 */
const get = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

export const jsonAdapter: SourceAdapter = {
  id: "json",
  async fetch(source: SourceRow): Promise<RawNotice[]> {
    if (!source.url) throw new Error("No API URL configured");
    const c = source.config as Record<string, string | Record<string, string>>;
    const res = await politeFetch(source.url, { headers: (c.headers as Record<string, string>) ?? {} });
    const json = await res.json();
    const items = (c.itemsPath ? get(json, c.itemsPath as string) : json) as unknown[];
    if (!Array.isArray(items)) throw new Error("itemsPath did not resolve to an array");
    return items.slice(0, 200).map((it) => {
      const title = String(get(it, (c.titleField as string) ?? "title") ?? "");
      const date = get(it, (c.dateField as string) ?? "published");
      const d = date ? new Date(String(date)) : null;
      return {
        externalId: String(get(it, (c.idField as string) ?? "id") ?? title),
        title,
        body: String(get(it, (c.bodyField as string) ?? "description") ?? ""),
        url: (get(it, (c.urlField as string) ?? "url") as string) ?? null,
        publishedAt: d && !isNaN(d.getTime()) ? d.toISOString() : null,
      };
    });
  },
};
