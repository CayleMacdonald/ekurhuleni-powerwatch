export type OutageStatus =
  | "reported"
  | "investigating"
  | "crew_dispatched"
  | "repair_in_progress"
  | "testing"
  | "restored";

export type SourceKind =
  | "municipal_notice"
  | "municipal_social"
  | "eskom"
  | "public_service"
  | "community"
  | "admin";

export type Verification = "verified" | "unverified" | "community_cluster";
export type EtaKind = "official" | "community";
export type NotifyChannel = "push" | "email" | "whatsapp";
export type NotifyEvent = "outage_reported" | "repair_update" | "eta_changed" | "power_restored";
export type ReportType = "outage" | "still_off" | "restored";

export interface Outage {
  id: string;
  title: string;
  status: OutageStatus;
  planned: boolean;
  suburbs: string[];
  streets: string[];
  ward: number | null;
  substation: string | null;
  feeder: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  started_at: string;
  updated_at: string;
  restored_at: string | null;
  eta_at: string | null;
  eta_kind: EtaKind | null;
  eta_note: string | null;
  source_kind: SourceKind;
  source_name: string;
  source_url: string | null;
  source_published_at: string | null;
  verification: Verification;
  report_count: number;
  restored_confirmations: number;
  /** true only for in-code demonstration records */
  is_demo?: boolean;
}

export interface OutageUpdate {
  id: string;
  outage_id: string;
  event: NotifyEvent;
  status: OutageStatus;
  eta_at: string | null;
  eta_kind: EtaKind | null;
  previous_eta_at: string | null;
  message: string | null;
  source_name: string;
  source_url: string | null;
  created_at: string;
}

export interface Subscription {
  id?: string;
  kind: "suburb" | "ward" | "street" | "location";
  value: string;
  lat?: number | null;
  lng?: number | null;
  radius_m?: number | null;
  channels: NotifyChannel[];
  events: NotifyEvent[];
}
