import { GAZETTEER } from "../constants";
import type { OutageStatus } from "../types";

export interface ParsedNotice {
  relevant: boolean;
  skipReason?: string;
  suburbs: string[];
  streets: string[];
  ward: number | null;
  substation: string | null;
  feeder: string | null;
  status: OutageStatus;
  planned: boolean;
  /** ISO. Only set when the notice EXPLICITLY states a time that can be resolved unambiguously. */
  eta: string | null;
  etaText: string | null;
}

// Must be electricity-specific: generic words like "supply"/"interruption" also appear in water notices.
const OUTAGE_WORDS = /(power|electric|substation|sub-station|transformer|blackout|feeder|\bmini-?sub\b|\bkva\b)/i;
const LOADSHEDDING = /load[\s-]?shedding|stage\s*\d/i;
const FAULT_WORDS = /(outage|fault|interruption|without (power|electricity)|no (power|electricity)|restor|repair|substation|transformer|feeder|tripped|vandal|cable)/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function extractSuburbs(text: string): string[] {
  // longest names first so "Boksburg North" wins over "Boksburg"
  const names = [...GAZETTEER].sort((a, b) => b.name.length - a.name.length);
  let rest = text;
  const found: string[] = [];
  for (const g of names) {
    const re = new RegExp(`\\b${esc(g.name)}\\b`, "i");
    if (re.test(rest)) {
      found.push(g.name);
      rest = rest.replace(new RegExp(`\\b${esc(g.name)}\\b`, "gi"), " ");
    }
  }
  return found;
}

export function detectStatus(t: string): OutageStatus {
  if (/\b(has|have|had|been|is now|was|were|now)\s+(been\s+)?(fully\s+)?restored\b/i.test(t) || /\b(power|supply|electricity)\s+(is\s+)?(back|restored)\b/i.test(t)) {
    if (!/\b(will|to be|until|expected to|should)\s+(be\s+)?restored\b/i.test(t)) return "restored";
  }
  if (/\b(testing|re-?energi[sz]|switching in|being tested)\b/i.test(t)) return "testing";
  if (/\brepairs?\s+(is|are)?\s*(in progress|underway|ongoing|under way)\b|\b(technicians?|crews?|team)s?\s+(is|are)\s+(currently\s+)?(repairing|working|on site)\b/i.test(t)) return "repair_in_progress";
  if (/\b(crews?|technicians?|teams?)\s+(has|have|had)?\s*(been\s+)?(dispatched|en route|on their way)\b/i.test(t)) return "crew_dispatched";
  if (/\b(investigat|assess|attending to|looking into)/i.test(t)) return "investigating";
  return "reported";
}

/** SAST is a fixed UTC+2 (no DST). */
function sastTimeOn(publishedIso: string, h: number, m: number): Date {
  const shifted = new Date(new Date(publishedIso).getTime() + 2 * 3.6e6);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), h - 2, m));
}

/**
 * Conservative ETA extraction. Returns null unless an explicit clock time follows an ETA phrase,
 * the publish time is known, and the resolved time is after publication and within 48h.
 * Anything vaguer ("shortly", "as soon as possible") yields NO estimate.
 */
export function extractEta(text: string, publishedAt: string | null): { eta: string | null; etaText: string | null } {
  if (!publishedAt) return { eta: null, etaText: null };
  const re =
    /(estimated (?:time of )?(?:restoration|repair)(?: time)?|restoration (?:time|expected)|\bETA\b|expected (?:to be )?(?:restored|back|completed)|restored (?:by|before|at)|(?:power|supply) (?:will|should) be (?:back|restored) (?:by|at|before))[^0-9]{0,30}(\d{1,2})\s*[:h.]\s*(\d{2})/i;
  const m = text.match(re);
  if (!m) return { eta: null, etaText: null };
  const h = Number(m[2]);
  const mi = Number(m[3]);
  if (h > 23 || mi > 59) return { eta: null, etaText: null };
  const d = sastTimeOn(publishedAt, h, mi);
  const delta = d.getTime() - new Date(publishedAt).getTime();
  if (delta <= 0 || delta > 48 * 3.6e6) return { eta: null, etaText: null };
  return { eta: d.toISOString(), etaText: m[0].trim() };
}

export function parseNotice(title: string, body: string, publishedAt: string | null): ParsedNotice {
  const text = `${title}. ${body}`.replace(/\s+/g, " ");
  const empty = { suburbs: [], streets: [], ward: null, substation: null, feeder: null, status: "reported" as OutageStatus, planned: false, eta: null, etaText: null };
  if (!OUTAGE_WORDS.test(text)) return { relevant: false, skipReason: "not about electricity supply", ...empty };
  if (LOADSHEDDING.test(text) && !FAULT_WORDS.test(text)) return { relevant: false, skipReason: "load-shedding schedule, not a fault", ...empty };
  const suburbs = extractSuburbs(text);
  if (!suburbs.length) return { relevant: false, skipReason: "no known Ekurhuleni suburb mentioned", ...empty };

  const ward = text.match(/\bward\s*(\d{1,3})\b/i);
  const sub = text.match(/\b([A-Z0-9][\w'-]*(?:\s+[A-Z0-9][\w'-]*){0,3})\s+(?:mini-?)?sub-?station\b/);
  const feeder = text.match(/\bfeeder\s+([A-Za-z0-9-]+)/i);
  const streets = [...text.matchAll(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(Street|Road|Avenue|Drive|Crescent|Lane)\b/g)].map((x) => `${x[1]} ${x[2]}`);
  const { eta, etaText } = extractEta(text, publishedAt);

  return {
    relevant: true,
    suburbs,
    streets: [...new Set(streets)].slice(0, 10),
    ward: ward ? Number(ward[1]) : null,
    substation: sub ? `${sub[1]} Substation` : null,
    feeder: feeder ? feeder[1] : null,
    status: detectStatus(text),
    planned: /\b(planned|scheduled)\b.*\b(maintenance|outage|interruption)\b|\bmaintenance\b/i.test(text),
    eta,
    etaText,
  };
}
