import type { SourceKind } from "../types";

/** A notice exactly as published by the source. Adapters must never add information. */
export interface RawNotice {
  externalId: string;
  title: string;
  body: string;
  url: string | null;
  publishedAt: string | null; // ISO
}

export interface SourceRow {
  id: string;
  name: string;
  adapter: string;
  kind: SourceKind;
  url: string | null;
  config: Record<string, unknown>;
  verified_publisher: boolean;
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
}

/**
 * Each provider is an independent adapter. To add a provider:
 *  1. create adapters/<name>.ts exporting a SourceAdapter
 *  2. register it in registry.ts
 *  3. insert a row in `sources` (disabled) and enable it from Admin > Sources.
 * Adapters MUST only use official APIs / feeds or methods permitted by the source's terms.
 */
export interface SourceAdapter {
  id: string;
  fetch(source: SourceRow): Promise<RawNotice[]>;
}
