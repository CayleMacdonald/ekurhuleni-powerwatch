import type { NotifyEvent, OutageStatus, SourceKind, Verification } from "./types";

export const STATUS_ORDER: OutageStatus[] = [
  "reported",
  "investigating",
  "crew_dispatched",
  "repair_in_progress",
  "testing",
  "restored",
];

export const STATUS_META: Record<OutageStatus, { label: string; color: string; hex: string; icon: string }> = {
  reported: { label: "Reported", color: "bg-st-reported", hex: "#dc2626", icon: "!" },
  investigating: { label: "Under Investigation", color: "bg-st-investigating", hex: "#c2410c", icon: "?" },
  crew_dispatched: { label: "Crew Dispatched", color: "bg-st-crew_dispatched", hex: "#a16207", icon: "➜" },
  repair_in_progress: { label: "Repair in Progress", color: "bg-st-repair_in_progress", hex: "#2563eb", icon: "⚙" },
  testing: { label: "Testing", color: "bg-st-testing", hex: "#7c3aed", icon: "≈" },
  restored: { label: "Power Restored", color: "bg-st-restored", hex: "#15803d", icon: "✓" },
};

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  municipal_notice: "Ekurhuleni municipal notice",
  municipal_social: "Verified municipal social media",
  eskom: "Eskom",
  public_service: "Public outage-reporting service",
  community: "Community reports",
  admin: "PowerWatch operator (manual)",
};

export const VERIFICATION_LABEL: Record<Verification, string> = {
  verified: "Verified official source",
  unverified: "Unverified",
  community_cluster: "Unverified – multiple community reports",
};

export const EVENT_LABEL: Record<NotifyEvent, string> = {
  outage_reported: "New outage reported",
  repair_update: "Repair update published",
  eta_changed: "Restoration time changed",
  power_restored: "Power restored",
};

export const TZ = "Africa/Johannesburg";

/**
 * Approximate suburb centroids for map placement and text matching ONLY.
 * Coordinates are approximate (±1 km) and should be replaced by an authoritative
 * gazetteer / Municipal Demarcation Board ward data via the `areas` table.
 * Ward numbers are deliberately omitted except where explicitly supplied by the product brief.
 */
export interface Gazetteer {
  name: string;
  lat: number;
  lng: number;
  region: string;
  ward?: number;
}

export const GAZETTEER: Gazetteer[] = [
  { name: "Witfield", lat: -26.2297, lng: 28.2603, region: "Boksburg", ward: 22 },
  { name: "Boksburg", lat: -26.2125, lng: 28.2625, region: "Boksburg" },
  { name: "Boksburg North", lat: -26.18, lng: 28.25, region: "Boksburg" },
  { name: "Parkdene", lat: -26.2406, lng: 28.2339, region: "Boksburg" },
  { name: "Impala Park", lat: -26.2336, lng: 28.2186, region: "Boksburg" },
  { name: "Reiger Park", lat: -26.2386, lng: 28.2503, region: "Boksburg" },
  { name: "Vosloorus", lat: -26.355, lng: 28.2, region: "Boksburg" },
  { name: "Benoni", lat: -26.1885, lng: 28.3208, region: "Benoni" },
  { name: "Northmead", lat: -26.1696, lng: 28.3187, region: "Benoni" },
  { name: "Actonville", lat: -26.1822, lng: 28.3485, region: "Benoni" },
  { name: "Brakpan", lat: -26.236, lng: 28.369, region: "Brakpan" },
  { name: "Springs", lat: -26.25, lng: 28.4, region: "Springs" },
  { name: "Daveyton", lat: -26.15, lng: 28.42, region: "Benoni" },
  { name: "Etwatwa", lat: -26.06, lng: 28.43, region: "Benoni" },
  { name: "Nigel", lat: -26.43, lng: 28.48, region: "Nigel" },
  { name: "Germiston", lat: -26.2309, lng: 28.167, region: "Germiston" },
  { name: "Primrose", lat: -26.1827, lng: 28.1544, region: "Germiston" },
  { name: "Bedfordview", lat: -26.18, lng: 28.13, region: "Germiston" },
  { name: "Edenvale", lat: -26.1411, lng: 28.1522, region: "Edenvale" },
  { name: "Kempton Park", lat: -26.1, lng: 28.23, region: "Kempton Park" },
  { name: "Tembisa", lat: -25.996, lng: 28.226, region: "Tembisa" },
  { name: "Alberton", lat: -26.269, lng: 28.122, region: "Alberton" },
  { name: "Brackenhurst", lat: -26.3, lng: 28.1, region: "Alberton" },
  { name: "Katlehong", lat: -26.34, lng: 28.15, region: "Katlehong" },
  { name: "Thokoza", lat: -26.35, lng: 28.17, region: "Thokoza" },
];

export function findPlace(name: string): Gazetteer | undefined {
  const n = name.trim().toLowerCase();
  return GAZETTEER.find((g) => g.name.toLowerCase() === n);
}

export const WITFIELD = { suburb: "Witfield", ward: 22, region: "Boksburg" };
