"use client";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { STATUS_META } from "@/lib/constants";
import { fmtDateTime } from "@/lib/time";
import type { Outage } from "@/lib/types";

const CENTRE: [number, number] = [-26.19, 28.26]; // Ekurhuleni

function Fly({ target }: { target: Outage | null }) {
  const map = useMap();
  useEffect(() => {
    if (target?.lat != null && target.lng != null) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
  }, [target, map]);
  return null;
}

export default function OutageMap({ outages, selectedId, onSelect, height = "100%" }: { outages: Outage[]; selectedId?: string | null; onSelect?: (id: string) => void; height?: string }) {
  const located = outages.filter((o) => o.lat != null && o.lng != null);
  const selected = located.find((o) => o.id === selectedId) ?? null;
  return (
    <MapContainer center={CENTRE} zoom={10} scrollWheelZoom style={{ height, width: "100%" }} aria-label="Map of electricity outages in Ekurhuleni">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fly target={selected} />
      {located.map((o) => {
        const c = STATUS_META[o.status].hex;
        const pos: [number, number] = [o.lat!, o.lng!];
        const active = o.status !== "restored";
        return (
          <span key={o.id}>
            <Circle center={pos} radius={o.radius_m ?? 800} pathOptions={{ color: c, fillColor: c, fillOpacity: active ? 0.2 : 0.08, weight: o.id === selectedId ? 3 : 1, dashArray: o.verification === "verified" ? undefined : "6 4" }} />
            <CircleMarker center={pos} radius={active ? 9 : 6} pathOptions={{ color: "#fff", weight: 2, fillColor: c, fillOpacity: 1 }} eventHandlers={{ click: () => onSelect?.(o.id) }}>
              <Popup>
                <strong>{o.title}</strong>
                <br />
                {STATUS_META[o.status].label}
                <br />
                {o.verification === "verified" ? "Verified source" : "Unverified"} · updated {fmtDateTime(o.updated_at)}
              </Popup>
            </CircleMarker>
          </span>
        );
      })}
    </MapContainer>
  );
}
