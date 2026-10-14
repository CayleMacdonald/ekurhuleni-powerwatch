import { politeFetch } from "../http";
import type { RawNotice, SourceAdapter, SourceRow } from "../types";

/**
 * Verified municipal account timeline via the OFFICIAL X API v2 (no scraping).
 * Requires X_BEARER_TOKEN and sources.config.username (without @). Mind your API tier's rate limits;
 * raise interval_minutes accordingly.
 */
export const xAdapter: SourceAdapter = {
  id: "x",
  async fetch(source: SourceRow): Promise<RawNotice[]> {
    const token = process.env.X_BEARER_TOKEN;
    const username = source.config.username as string | undefined;
    if (!token) throw new Error("X_BEARER_TOKEN not set");
    if (!username) throw new Error("config.username missing");
    const headers = { Authorization: `Bearer ${token}` };
    const u = await (await politeFetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`, { headers })).json();
    const id = u?.data?.id;
    if (!id) throw new Error("X user not found");
    const t = await (
      await politeFetch(
        `https://api.x.com/2/users/${id}/tweets?max_results=20&tweet.fields=created_at&exclude=retweets,replies`,
        { headers },
      )
    ).json();
    return ((t?.data ?? []) as { id: string; text: string; created_at?: string }[]).map((tw) => ({
      externalId: tw.id,
      title: tw.text.slice(0, 120),
      body: tw.text,
      url: `https://x.com/${username}/status/${tw.id}`,
      publishedAt: tw.created_at ?? null,
    }));
  },
};
