"use client";
/** Per-device "my areas" so alerts prioritisation works without an account. Synced to the DB from Settings when signed in. */
export interface MyArea {
  kind: "suburb" | "ward" | "street" | "location";
  value: string;
  lat?: number;
  lng?: number;
}
const KEY = "pw_areas_v1";

export function loadAreas(): MyArea[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function saveAreas(a: MyArea[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
    window.dispatchEvent(new Event("pw-areas"));
  } catch {}
}
