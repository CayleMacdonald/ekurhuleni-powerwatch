-- ═══════════════════════════════════════════════════════════════════════════
-- Ekurhuleni PowerWatch – database schema
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
-- Every table has Row Level Security enabled. The server (service role) performs
-- ingestion, report processing and notification; browsers only get what the
-- policies below allow.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type public.outage_status as enum
    ('reported','under_investigation','crew_dispatched','repair_in_progress','testing','restored');
exception when duplicate_object then null; end $$;

-- ── Profiles & roles ────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','moderator','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator'));
$$;

-- ── Reference data: suburbs ─────────────────────────────────────────────────
create table if not exists public.suburbs (
  id serial primary key,
  name text not null,
  town text not null,
  ward int,
  lat double precision not null,
  lng double precision not null,
  unique (name, town)
);

-- ── Data sources (integration layer config) ────────────────────────────────
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('rss','json','manual')),
  source_kind text not null default 'official_notice'
    check (source_kind in ('official_notice','municipal_social','eskom','public_service')),
  url text,
  official boolean not null default false,          -- true only for sources run by the municipality / Eskom
  enabled boolean not null default false,
  interval_minutes int not null default 15 check (interval_minutes between 1 and 1440),
  config jsonb not null default '{}'::jsonb,        -- adapter options. NEVER store secrets here (use env vars).
  terms_url text,
  terms_reviewed boolean not null default false,    -- admin attests the source's terms permit this use
  last_checked_at timestamptz,
  last_status text,
  last_error text,
  consecutive_failures int not null default 0,
  created_at timestamptz not null default now(),
  constraint sources_enabled_requires_terms check (not enabled or terms_reviewed)
);

-- ── Outages ─────────────────────────────────────────────────────────────────
create table if not exists public.outages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'fault' check (category in ('fault','planned','unknown')),
  status public.outage_status not null default 'reported',
  suburbs text[] not null default '{}',
  streets text[] not null default '{}',
  wards int[] not null default '{}',
  substation text,
  feeder text,
  lat double precision,
  lng double precision,
  started_at timestamptz,
  reported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  restored_at timestamptz,
  eta_at timestamptz,
  eta_kind text check (eta_kind in ('official','community')),
  eta_note text,
  source_kind text not null check (source_kind in
    ('official_notice','municipal_social','eskom','public_service','community','admin')),
  source_name text not null,
  source_url text,
  source_published_at timestamptz,
  verification text not null default 'unverified' check (verification in ('official','verified','unverified')),
  community_report_count int not null default 0,
  community_restored_count int not null default 0,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  constraint outages_eta_requires_kind check (eta_at is null or eta_kind is not null)
);
create index if not exists outages_status_idx on public.outages (status);
create index if not exists outages_updated_idx on public.outages (updated_at desc);
create index if not exists outages_suburbs_gin on public.outages using gin (suburbs);
create index if not exists outages_wards_gin on public.outages using gin (wards);

create table if not exists public.outage_updates (
  id uuid primary key default gen_random_uuid(),
  outage_id uuid not null references public.outages(id) on delete cascade,
  status public.outage_status,
  message text not null,
  eta_at timestamptz,
  eta_kind text check (eta_kind in ('official','community')),
  source_name text not null,
  source_url text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists outage_updates_outage_idx on public.outage_updates (outage_id, created_at desc);

-- ── Ingestion bookkeeping ───────────────────────────────────────────────────
create table if not exists public.ingested_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  external_id text not null,
  content_hash text not null,
  outage_id uuid references public.outages(id) on delete set null,
  title text,
  url text,
  published_at timestamptz,
  needs_review boolean not null default false,
  review_note text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create table if not exists public.ingest_log (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','error','skipped')),
  items_found int not null default 0,
  items_new int not null default 0,
  items_updated int not null default 0,
  items_review int not null default 0,
  error text
);
create index if not exists ingest_log_started_idx on public.ingest_log (started_at desc);

-- ── Community reports ───────────────────────────────────────────────────────
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('outage','still_off','restored')),
  suburb text not null,
  street text,
  ward int,
  event_time timestamptz,
  notes text,                       -- visible to moderators only
  fingerprint text not null,
  ip_hash text,                     -- salted hash, never the raw IP
  reporter_id uuid references auth.users(id) on delete set null,
  status text not null default 'accepted' check (status in ('accepted','flagged','duplicate','rejected')),
  flag_reason text,
  outage_id uuid references public.outages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reports_suburb_idx on public.reports (suburb, created_at desc);
create index if not exists reports_ip_idx on public.reports (ip_hash, created_at desc);
create index if not exists reports_fp_idx on public.reports (fingerprint, created_at desc);

-- ── Alert subscriptions ─────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  suburbs text[] not null default '{}',
  wards int[] not null default '{}',
  streets text[] not null default '{}',
  events text[] not null default '{outage_reported,status_update,eta_changed,restored}',
  include_unverified boolean not null default true,
  push_enabled boolean not null default false,
  push_subscription jsonb,
  email_enabled boolean not null default false,
  email text,
  whatsapp_enabled boolean not null default false,
  whatsapp_number text,
  whatsapp_opt_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_suburbs_gin on public.subscriptions using gin (suburbs);
create index if not exists subscriptions_wards_gin on public.subscriptions using gin (wards);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  outage_id uuid references public.outages(id) on delete cascade,
  event text not null,
  channel text not null check (channel in ('push','email','whatsapp')),
  dedupe_key text not null,
  status text not null check (status in ('sent','failed','skipped')),
  error text,
  created_at timestamptz not null default now(),
  unique (subscription_id, channel, dedupe_key)
);

-- ── Settings & audit ────────────────────────────────────────────────────────
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.profiles          enable row level security;
alter table public.suburbs           enable row level security;
alter table public.sources           enable row level security;
alter table public.outages           enable row level security;
alter table public.outage_updates    enable row level security;
alter table public.ingested_items    enable row level security;
alter table public.ingest_log        enable row level security;
alter table public.reports           enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.notification_log  enable row level security;
alter table public.app_settings      enable row level security;
alter table public.audit_log         enable row level security;

-- profiles: read your own row (or all if staff). No client writes → nobody can self-promote to admin.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_staff());

-- suburbs: public read, admin write
drop policy if exists suburbs_read on public.suburbs;
create policy suburbs_read on public.suburbs for select using (true);
drop policy if exists suburbs_admin_write on public.suburbs;
create policy suburbs_admin_write on public.suburbs for all using (public.is_admin()) with check (public.is_admin());

-- outages & updates: public read, staff write
drop policy if exists outages_read on public.outages;
create policy outages_read on public.outages for select using (true);
drop policy if exists outages_staff_write on public.outages;
create policy outages_staff_write on public.outages for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists outage_updates_read on public.outage_updates;
create policy outage_updates_read on public.outage_updates for select using (true);
drop policy if exists outage_updates_staff_write on public.outage_updates;
create policy outage_updates_staff_write on public.outage_updates for all using (public.is_staff()) with check (public.is_staff());

-- sources: staff only (config may be sensitive). Public gets a safe view below.
drop policy if exists sources_staff_all on public.sources;
create policy sources_staff_all on public.sources for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists sources_staff_read on public.sources;
create policy sources_staff_read on public.sources for select using (public.is_staff());

create or replace view public.public_sources as
  select id, name, kind, source_kind, url, official, interval_minutes, last_checked_at, last_status
  from public.sources where enabled;
grant select on public.public_sources to anon, authenticated;

-- operational tables: staff read only (writes come from the server using the service role)
drop policy if exists ingested_items_staff_read on public.ingested_items;
create policy ingested_items_staff_read on public.ingested_items for select using (public.is_staff());
drop policy if exists ingest_log_staff_read on public.ingest_log;
create policy ingest_log_staff_read on public.ingest_log for select using (public.is_staff());
drop policy if exists notification_log_staff_read on public.notification_log;
create policy notification_log_staff_read on public.notification_log for select using (public.is_staff());
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log for select using (public.is_admin());
drop policy if exists app_settings_staff_read on public.app_settings;
create policy app_settings_staff_read on public.app_settings for select using (public.is_staff());
drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings for all using (public.is_admin()) with check (public.is_admin());

-- reports: residents see their own; staff see all. Inserts happen server-side (rate limiting, dedupe, flagging).
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select
  using (reporter_id = auth.uid() or public.is_staff());
drop policy if exists reports_staff_update on public.reports;
create policy reports_staff_update on public.reports for update using (public.is_staff()) with check (public.is_staff());

-- subscriptions: strictly per-user
drop policy if exists subscriptions_own on public.subscriptions;
create policy subscriptions_own on public.subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Realtime: lets the dashboard refresh instantly when an outage changes ───
do $$ begin
  alter publication supabase_realtime add table public.outages;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ── Default settings ────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('cluster_threshold',   '3'::jsonb),   -- independent reporters needed to raise a "possible widespread outage"
  ('cluster_window_min',  '60'::jsonb),  -- …within this many minutes
  ('dedupe_window_min',   '30'::jsonb),  -- same reporter, same place, same kind → duplicate within this window
  ('rate_limit_per_hour', '6'::jsonb)    -- max reports per hashed IP per hour before flagging
on conflict (key) do nothing;
