-- Ekurhuleni PowerWatch schema. Run in the Supabase SQL editor or via `supabase db push`.
create extension if not exists pgcrypto;

-- ───────────── Enums ─────────────
create type outage_status as enum ('reported','investigating','crew_dispatched','repair_in_progress','testing','restored');
create type source_kind as enum ('municipal_notice','municipal_social','eskom','public_service','community','admin');
create type verification as enum ('verified','unverified','community_cluster');
create type eta_kind as enum ('official','community');
create type report_type as enum ('outage','still_off','restored');
create type notify_channel as enum ('push','email','whatsapp');
create type notify_event as enum ('outage_reported','repair_update','eta_changed','power_restored');

-- ───────────── Profiles & roles ─────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  whatsapp_number text,              -- E.164, only used after opt-in
  whatsapp_opt_in boolean not null default false,
  email_opt_in boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Prevent users from promoting themselves.
create or replace function protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not is_admin() and auth.uid() is not null then
    new.role := old.role;
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on profiles
  for each row execute function protect_role();

-- ───────────── Reference data ─────────────
create table areas (
  id serial primary key,
  name text not null,
  kind text not null default 'suburb' check (kind in ('suburb','ward','substation','feeder')),
  ward int,
  region text,
  lat double precision,
  lng double precision,
  unique (name, kind)
);

-- ───────────── Sources ─────────────
create table sources (
  id text primary key,                    -- e.g. 'ekurhuleni-notices'
  name text not null,
  adapter text not null,                  -- rss | json | x | custom adapter id
  kind source_kind not null,
  url text,
  config jsonb not null default '{}',
  verified_publisher boolean not null default false,  -- true only for official accounts/feeds
  terms_note text,                        -- record WHY this source use is permitted
  enabled boolean not null default false,
  interval_minutes int not null default 15 check (interval_minutes >= 1),
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz not null default now()
);

create table raw_notices (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references sources(id) on delete cascade,
  external_id text not null,
  title text,
  body text,
  url text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  parse_result text not null default 'pending',   -- matched | skipped | pending | error
  outage_id uuid,
  unique (source_id, external_id)
);

-- ───────────── Outages ─────────────
create table outages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status outage_status not null default 'reported',
  planned boolean not null default false,
  suburbs text[] not null default '{}',
  streets text[] not null default '{}',
  ward int,
  substation text,
  feeder text,
  lat double precision,
  lng double precision,
  radius_m int default 800,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  restored_at timestamptz,
  eta_at timestamptz,
  eta_kind eta_kind,                      -- null => "Restoration time not confirmed"
  eta_note text,
  source_kind source_kind not null,
  source_id text references sources(id) on delete set null,
  source_name text not null,
  source_url text,
  source_published_at timestamptz,
  verification verification not null default 'unverified',
  report_count int not null default 0,
  restored_confirmations int not null default 0,
  created_at timestamptz not null default now(),
  -- an official ETA may only come from a verified publisher
  constraint eta_official_requires_verified check (eta_kind is distinct from 'official' or verification = 'verified'),
  constraint eta_requires_kind check ((eta_at is null) = (eta_kind is null))
);
create index outages_status_idx on outages (status, updated_at desc);
create index outages_suburbs_idx on outages using gin (suburbs);
create index outages_ward_idx on outages (ward);
create index outages_started_idx on outages (started_at desc);

create table outage_updates (
  id uuid primary key default gen_random_uuid(),
  outage_id uuid not null references outages(id) on delete cascade,
  event notify_event not null,
  status outage_status not null,
  eta_at timestamptz,
  eta_kind eta_kind,
  previous_eta_at timestamptz,
  message text,
  source_name text not null,
  source_url text,
  created_at timestamptz not null default now()
);
create index outage_updates_outage_idx on outage_updates (outage_id, created_at desc);

-- ───────────── Community reports ─────────────
create table reports (
  id uuid primary key default gen_random_uuid(),
  type report_type not null,
  user_id uuid references auth.users(id) on delete set null,
  reporter_hash text not null,             -- salted hash of IP+UA; never the raw IP
  suburb text not null,
  street text,
  ward int,
  started_at timestamptz,
  notes text,
  outage_id uuid references outages(id) on delete set null,
  status text not null default 'accepted' check (status in ('accepted','flagged','rejected')),
  flags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index reports_recent_idx on reports (suburb, created_at desc);
create index reports_hash_idx on reports (reporter_hash, created_at desc);

-- ───────────── Subscriptions & notifications ─────────────
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('suburb','ward','street','location')),
  value text not null,                     -- suburb name / ward number / street name / label
  lat double precision,
  lng double precision,
  radius_m int default 1000,
  channels notify_channel[] not null default '{push}',
  events notify_event[] not null default '{outage_reported,repair_update,eta_changed,power_restored}',
  created_at timestamptz not null default now(),
  unique (user_id, kind, value)
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel notify_channel not null,
  event notify_event not null,
  outage_id uuid not null references outages(id) on delete cascade,
  update_id uuid not null references outage_updates(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, channel, update_id)
);
create index notification_queue_pending_idx on notification_queue (status, created_at) where status = 'pending';

-- ───────────── Logs ─────────────
create table app_logs (
  id bigserial primary key,
  level text not null check (level in ('debug','info','warn','error')),
  scope text not null,
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index app_logs_created_idx on app_logs (created_at desc);

-- ───────────── Row-level security ─────────────
alter table profiles enable row level security;
alter table areas enable row level security;
alter table sources enable row level security;
alter table raw_notices enable row level security;
alter table outages enable row level security;
alter table outage_updates enable row level security;
alter table reports enable row level security;
alter table subscriptions enable row level security;
alter table push_subscriptions enable row level security;
alter table notification_queue enable row level security;
alter table app_logs enable row level security;

-- Public read: reference data, outages and their updates.
create policy areas_read on areas for select using (true);
create policy outages_read on outages for select using (true);
create policy outage_updates_read on outage_updates for select using (true);
-- Writes to outages/updates: admin only (ingestion + report clustering use the service role, which bypasses RLS).
create policy outages_admin_write on outages for all using (is_admin()) with check (is_admin());
create policy outage_updates_admin_write on outage_updates for all using (is_admin()) with check (is_admin());
create policy areas_admin_write on areas for all using (is_admin()) with check (is_admin());

-- Sources & raw notices: admin only (config may reference credentials).
create policy sources_admin on sources for all using (is_admin()) with check (is_admin());
create policy raw_notices_admin on raw_notices for select using (is_admin());

-- Profiles: own row (role is protected by trigger); admins see all.
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_update on profiles for update using (is_admin()) with check (is_admin());

-- Reports: inserted server-side only (anonymous reporters are allowed through the API, not directly).
create policy reports_own_read on reports for select using (user_id = auth.uid() or is_admin());
create policy reports_admin_update on reports for update using (is_admin()) with check (is_admin());

-- Subscriptions & push endpoints: owner only.
create policy subs_owner on subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_owner on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Queue & logs: admin read; service role writes.
create policy queue_admin_read on notification_queue for select using (is_admin());
create policy logs_admin_read on app_logs for select using (is_admin());

-- To make yourself admin after first login (run once in SQL editor):
--   update profiles set role = 'admin' where email = 'you@example.org';
