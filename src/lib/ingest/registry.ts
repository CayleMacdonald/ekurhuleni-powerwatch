import { jsonAdapter } from "./adapters/json";
import { rssAdapter } from "./adapters/rss";
import { xAdapter } from "./adapters/x";
import type { SourceAdapter } from "./types";

/** Add new providers here. Each adapter is independent and enabled per-source from the admin panel. */
export const ADAPTERS: Record<string, SourceAdapter> = {
  [rssAdapter.id]: rssAdapter,
  [jsonAdapter.id]: jsonAdapter,
  [xAdapter.id]: xAdapter,
};
