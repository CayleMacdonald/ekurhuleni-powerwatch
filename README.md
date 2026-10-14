# Ekurhuleni PowerWatch

Live electricity outage and restoration information for Ekurhuleni, Gauteng.
Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS) · Leaflet/OpenStreetMap.

## Truthfulness rules (enforced in code)

- **No fabricated data.** With no Supabase configured the app runs in **demo mode**: a gold banner is shown on every page and every record is tagged `DEMO`. With Supabase configured, demo data is never shown.
- **Official ETA only from verified publishers.** A DB constraint (`eta_official_requires_verified`) plus `applyChange()` downgrade any ETA from an unverified source to "community prediction". Countdowns are shown only for official ETAs. No ETA => "Restoration time not confirmed".
- **ETA parsing is conservative** (`src/lib/ingest/parse.ts`): only an explicit clock time after an ETA phrase, after the publish time, within 48h. "Soon" / "ASAP" yields no ETA.
- **Community reports are always labelled unverified** and never override an official status. Community-only outages can be closed only by ≥N independent restoration confirmations.
- Sources are created **disabled, with no URL**. Enabling requires a URL and a recorded terms/permission note.

## Quick start (demo mode)

```bash
npm install
npm run dev         # http://localhost:3000  (demo data, banner shown)
npm test            # parser + report-abuse unit tests
```

## Go live

1. **Supabase**: create a project. In the SQL editor run `supabase/migrations/001_schema.sql` (the only schema file), then `supabase/seed.sql`.
   Auth → URL configuration: add `https://YOUR_DOMAIN/auth/callback` as a redirect URL. Email (magic link) auth is used.
2. `cp .env.example .env.local` and fill in values. Generate secrets: `openssl rand -hex 32` (CRON_SECRET, REPORTER_HASH_SALT); VAPID keys: `npx web-push generate-vapid-keys`.
3. Sign in once via `/login`, then make yourself admin:
   `update profiles set role = 'admin' where email = 'you@example.org';`
4. **Deploy** to Vercel (import repo, add the env vars). `vercel.json` contains only a once-a-day safety-net schedule, because Vercel Hobby rejects anything more frequent. For real-time operation, call `/api/cron/ingest` (every 5 min) and `/api/cron/notify` (every minute) from an external scheduler such as cron-job.org or Supabase pg_cron, with the header `Authorization: Bearer $CRON_SECRET`. On Vercel Pro you can instead set `*/5 * * * *` and `* * * * *` in `vercel.json`. Each source still honours its own `interval_minutes`.
5. **Configure sources** at `/admin` → Data sources. For each: set the URL, confirm the publisher's terms allow automated retrieval, write that in the terms note, tick *Verified publisher* **only** for official municipal/Eskom channels, enable, and press *Run now*. Check the log panel.
6. **Notifications**: Resend (email: verify your sending domain), web push (VAPID keys), WhatsApp Cloud API (needs a Meta business account, an approved template with 3 body variables `{{1}}` title, `{{2}}` details, `{{3}}` link, and user opt-in — collected in Settings).

## What you must supply / verify

I could not test against live municipal endpoints. Before relying on the feed:

- **Source URLs.** Find the official Ekurhuleni / Eskom feeds (RSS/Atom/JSON) or a licensed API. If a source has no feed, add a purpose-built adapter only if its terms permit it; do not scrape sites that forbid it. Social media: use the official API (`x` adapter) for verified accounts only.
- **Parser tuning.** `parse.ts` matches suburbs from `GAZETTEER` in `src/lib/constants.ts` and uses English keyword rules. Real notice wording will need tuning (and Afrikaans if published). Skipped notices are kept in `raw_notices` with `parse_result = 'skipped'` so you can review misses in Supabase.
- **Gazetteer and wards.** Suburb coordinates are approximate centroids. Ward numbers are only set for Witfield (22, from the brief). Import authoritative ward/suburb boundaries (Municipal Demarcation Board) into `areas` for accurate matching and geo-alerts.
- **Map tiles.** Default is the public OpenStreetMap tile server (fine for light use; for production switch to a provider such as MapTiler/Stadia in `OutageMap.tsx`).

## Architecture

```
src/lib/ingest/adapters/*   one file per provider (rss, json, x) – registry.ts registers them
src/lib/ingest/parse.ts     notice → suburbs/status/ETA (unit tested)
src/lib/ingest/run.ts       cron job: due sources → dedupe (raw_notices) → applyChange
src/lib/outages-write.ts    single write path: timeline entry + notification enqueue
src/lib/notify.ts           subscriber matching, queue, push/email/WhatsApp delivery
src/lib/reports.ts          dedupe, abuse flags, independent-reporter clustering (unit tested)
src/lib/analytics.ts        durations, recurring areas, daily/monthly, ETA accuracy
supabase/migrations         schema + RLS
```

Add a provider: create `adapters/foo.ts` exporting `{ id, fetch(source) }`, register it in `registry.ts`, insert a `sources` row (disabled), enable in Admin.

## Security

- RLS on every table: public read of outages/updates/areas; subscriptions, push endpoints, profiles owner-only; sources, raw notices, logs, queue admin-only. Role changes are blocked by trigger.
- The service-role key is used only server-side (cron, report intake, admin actions). Admin server actions re-check the role on every call.
- Reports: honeypot, salted-hash reporter ID (no raw IPs), 30-min duplicate rule, rate limits, flags (links/phones in notes, future/old start times, unknown suburb) that hold a report for admin review and exclude it from counts.
- Cron endpoints require `Bearer CRON_SECRET`; security headers set in `next.config.mjs`.
- Consider adding edge rate limiting (Vercel Firewall / Upstash) in front of `/api/reports`.

## Pages

`/` live map & list · `/witfield` Witfield, Boksburg, Ward 22 view with history · `/outage/[id]` timeline · `/analytics` · `/report` · `/settings` (areas, channels, push, WhatsApp opt-in) · `/admin` (sources, manual official updates, flagged reports, queue, logs).
