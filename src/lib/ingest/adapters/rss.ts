import { XMLParser } from "fast-xml-parser";
import { politeFetch } from "../http";
import type { RawNotice, SourceAdapter, SourceRow } from "../types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "#text" in (v as object)) return String((v as Record<string, unknown>)["#text"]);
  return String(v);
};
const strip = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const toIso = (s: string): string | null => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

/** RSS 2.0 and Atom feeds published by the source itself. */
export const rssAdapter: SourceAdapter = {
  id: "rss",
  async fetch(source: SourceRow): Promise<RawNotice[]> {
    if (!source.url) throw new Error("No feed URL configured");
    const xml = await (await politeFetch(source.url)).text();
    const doc = parser.parse(xml);
    const items: unknown[] = [].concat(doc?.rss?.channel?.item ?? doc?.feed?.entry ?? []);
    return items.slice(0, 100).map((it) => {
      const i = it as Record<string, unknown>;
      const link = typeof i.link === "object" ? ((i.link as Record<string, string>)["@_href"] ?? null) : (i.link as string) ?? null;
      const title = strip(text(i.title));
      return {
        externalId: text(i.guid ?? i.id) || link || title,
        title,
        body: strip(text(i.description ?? i.summary ?? i.content ?? i["content:encoded"])),
        url: link,
        publishedAt: toIso(text(i.pubDate ?? i.published ?? i.updated)),
      };
    });
  },
};
