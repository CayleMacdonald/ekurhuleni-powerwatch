"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runIngestion } from "@/lib/ingest/run";
import { log } from "@/lib/logger";
import { applyChange } from "@/lib/outages-write";
import { getSessionUser, supabaseAdmin } from "@/lib/supabase/server";
import type { Outage } from "@/lib/types";

/** Every action re-checks the role server-side; hiding the UI is never the control. */
async function requireAdmin() {
  const { user, isAdmin } = await getSessionUser();
  if (!user || !isAdmin) throw new Error("Forbidden");
  return user;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const sast = (v: string) => (v ? new Date(`${v}:00+02:00`).toISOString() : null);

export async function saveSource(f: FormData) {
  const u = await requireAdmin();
  const interval = z.coerce.number().int().min(1).max(1440).parse(str(f, "interval_minutes"));
  const enabled = f.get("enabled") === "on";
  const url = str(f, "url") || null;
  const terms = str(f, "terms_note") || null;
  if (enabled && !url && str(f, "adapter") !== "x") throw new Error("A URL is required before a source can be enabled");
  if (enabled && !terms) throw new Error("Record why automated access is permitted (terms note) before enabling");
  const { error } = await supabaseAdmin()
    .from("sources")
    .update({ url, interval_minutes: interval, enabled, verified_publisher: f.get("verified_publisher") === "on", terms_note: terms })
    .eq("id", str(f, "id"));
  if (error) throw error;
  await log("info", "admin", "source updated", { id: str(f, "id"), by: u.email, enabled });
  revalidatePath("/admin");
}

export async function runSourceNow(f: FormData) {
  await requireAdmin();
  await runIngestion(supabaseAdmin(), { force: true, sourceId: str(f, "id") });
  revalidatePath("/admin");
}

const updateSchema = z.object({
  status: z.enum(["reported", "investigating", "crew_dispatched", "repair_in_progress", "testing", "restored"]),
  message: z.string().max(500).optional(),
});

/** Create or update an outage manually (e.g. transcribing an official notice). */
export async function postOutageUpdate(f: FormData) {
  const u = await requireAdmin();
  const sb = supabaseAdmin();
  const p = updateSchema.parse({ status: str(f, "status"), message: str(f, "message") });
  const sourceUrl = str(f, "source_url") || null;
  const official = f.get("official") === "on";
  if (official && !sourceUrl) throw new Error("Official updates must link to the publication they come from");
  const eta = sast(str(f, "eta"));
  const id = str(f, "outage_id");
  let existing: Outage | null = null;
  if (id) {
    const { data } = await sb.from("outages").select("*").eq("id", id).single();
    existing = data as Outage;
  }
  const suburbs = str(f, "suburbs").split(",").map((s) => s.trim()).filter(Boolean);
  if (!existing && !suburbs.length) throw new Error("At least one suburb is required");
  await applyChange(
    sb,
    existing,
    {
      status: p.status,
      title: str(f, "title") || undefined,
      suburbs,
      streets: str(f, "streets").split(",").map((s) => s.trim()).filter(Boolean),
      ward: str(f, "ward") ? Number(str(f, "ward")) : null,
      substation: str(f, "substation") || null,
      feeder: str(f, "feeder") || null,
      eta_at: f.has("eta") ? eta : undefined,
      eta_kind: eta ? (official ? "official" : "community") : undefined,
      eta_note: eta ? (official ? "Entered by operator from a linked official publication" : "Operator-entered estimate, not confirmed") : undefined,
      message: p.message || null,
    },
    { kind: "admin", id: null, name: official ? "Official notice (entered by PowerWatch operator)" : "PowerWatch operator", url: sourceUrl, publishedAt: null, verification: official ? "verified" : "unverified" },
  );
  await log("info", "admin", "manual outage update", { by: u.email, outage: id || "new", status: p.status });
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function reviewReport(f: FormData) {
  const u = await requireAdmin();
  const status = str(f, "decision") === "accept" ? "accepted" : "rejected";
  await supabaseAdmin().from("reports").update({ status }).eq("id", str(f, "id"));
  await log("info", "admin", `report ${status}`, { id: str(f, "id"), by: u.email });
  revalidatePath("/admin");
}

export async function deleteOutage(f: FormData) {
  const u = await requireAdmin();
  await supabaseAdmin().from("outages").delete().eq("id", str(f, "id"));
  await log("warn", "admin", "outage deleted", { id: str(f, "id"), by: u.email });
  revalidatePath("/admin");
}
