import { NextResponse } from "next/server";
import { getOutages } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Public read API. `demo: true` means the records are demonstration data, not live. */
export async function GET() {
  const feed = await getOutages();
  return NextResponse.json({ demo: feed.demo, lastSourceCheck: feed.lastSourceCheck ?? null, error: feed.error ?? null, outages: feed.outages });
}
