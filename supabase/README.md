# NearMe · Supabase backend

PostgreSQL + PostGIS schema, Row Level Security, RPCs, storage buckets and a development seed
for NearMe. The frontend runs in "local mode" (IndexedDB, `src/services/backend/localDb.ts`)
until `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set; this folder is what it moves to.

```
supabase/
  migrations/
    0001_extensions_and_types.sql    extensions (postgis, pg_trgm, unaccent, pgcrypto), enums, text-search helpers
    0002_schema.sql                  34 tables, constraints, indexes
    0003_functions_and_triggers.sql  triggers, RPCs, public_profiles view, pg_cron schedule
    0004_rls.sql                     privileges (table / column / function), RLS policies, Realtime publication
    0005_storage.sql                 buckets + storage.objects policies
    0006_reference_data.sql          category taxonomy, badges, default config (required in production)
  seed/
    dev_seed.sql                     development only: reference data mirror + flagged sample data
  README.md
```

Contents: [Apply](#1-apply) · [Auth settings](#2-auth-settings) · [Environment](#3-environment-variables) ·
[Data model](#4-data-model) · [Frontend mapping](#5-frontend-service--database-mapping) · [RPC reference](#6-rpc-reference) ·
[Realtime](#7-realtime) · [Push](#8-push-notifications) · [Scheduled jobs](#9-scheduled-jobs) ·
[Security model](#10-security-model-in-plain-language) · [Sample data](#11-sample-data) ·
[Validation](#12-what-was-validated-and-what-was-not) · [Known limits](#13-known-limits-and-follow-ups)

---

## 1. Apply

Always apply the six migrations as a set and in order. Until `0004_rls.sql` has run, the tables
are not protected.

**Supabase CLI**

```bash
supabase init          # only if supabase/config.toml does not exist yet; it leaves migrations/ alone
supabase link --project-ref <ref>
supabase db push       # applies supabase/migrations/* in filename order
```

The CLI orders migrations by their numeric prefix, so `0001_…` to `0006_…` sort before any
timestamped migration you add later. (If your CLI version insists on timestamps, rename the
files keeping the same order.)

**SQL editor** (Dashboard → SQL): paste and run each file, `0001` → `0006`, one after the other.

**Local stack**: `supabase start`, then `supabase db reset` (migrations, then the seed if
`config.toml` contains `[db.seed]` with `sql_paths = ["./seed/dev_seed.sql"]`).

Notes

- Every file is re-runnable (`if not exists`, `create or replace`, policies dropped and
  re-created). Re-running `0004` is also how a newly added function or table gets its
  privileges reset to "nothing until granted".
- The migrations expect `postgis`, `pg_trgm` and `unaccent` in the **`extensions`** schema
  (the Supabase default). `0001` stops with a clear message if one of them was previously
  enabled into another schema.
- `0003` creates the trigger `on_auth_user_created` on `auth.users`. If the project already has
  a trigger with that name it is replaced.
- Production needs **only the migrations**. Never run `seed/dev_seed.sql` there.
- First administrator (there is no way to become one through the API):

  ```sql
  update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'you@example.com');
  ```

## 2. Auth settings

Dashboard → Authentication.

| Setting | Value |
| --- | --- |
| URL configuration → Site URL | the deployed origin, e.g. `https://nearme.example` |
| URL configuration → Redirect URLs | the origin and `<origin>/login` (password reset returns there); add `http://localhost:5173` and `http://localhost:5173/login` for development |
| Providers → Email | enabled; "Confirm email" on (the app handles `needsEmailConfirmation`); minimum password length 8 (same as `passwordSchema`) |
| Providers → Google | enabled; OAuth client ID + secret from Google Cloud; authorised redirect URI in Google = `https://<ref>.supabase.co/auth/v1/callback` |
| Providers → Phone | enabled with an SMS provider (Twilio, MessageBird, Vonage, …); OTP length 6 |
| Anonymous sign-ins | off (nothing in the schema is designed for them) |
| Attack protection | CAPTCHA and leaked-password protection recommended; keep the default rate limits |

`handle_new_user` creates `profiles`, `user_preferences` and the five starter collections for
every new `auth.users` row. The display name comes from `raw_user_meta_data.full_name` (set by
`authService.signUp` and by Google), else `name`, else the e-mail local part, else "Explorer".
Role and status always start as `user` / `active`, whatever the sign-up metadata says.

E-mail and phone stay in `auth.users`; they are not copied into `profiles`.

## 3. Environment variables

Browser (`.env.local`, see `.env.example`):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>
VITE_VAPID_PUBLIC_KEY=<public VAPID key>          # only for web push
```

**Never put the service-role key in a `VITE_*` variable or anywhere in the frontend.** It
bypasses every policy in this folder. It belongs in Edge Function secrets only:

```bash
supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:ops@nearme.example PUSH_WEBHOOK_SECRET=…
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected into Edge Functions automatically
```

## 4. Data model

| Area | Tables |
| --- | --- |
| Accounts | `profiles` (private row per user: role, status, home area, score), `user_preferences`, view `public_profiles` (author chip: name, avatar, level) |
| Taxonomy & config | `category_groups`, `categories`, `badges`, `app_config` (one row) |
| Businesses | `businesses`, `business_categories`, `business_hours`, `business_services`, `business_photos`, `business_claims`, `subscriptions`, `analytics_events` |
| Reviews | `reviews`, `review_photos`, `review_votes` |
| Saved | `saved_places`, `collections`, `collection_places` |
| Community | `community_reports`, `report_confirmations`, `report_votes` |
| Deals & events | `deals`, `saved_deals`, `events`, `event_interest` |
| Notifications | `notifications`, `push_subscriptions` |
| Contributions | `user_contributions`, `user_badges` |
| Moderation | `moderation_reports`, `place_suggestions` |
| Search | `search_history` |

Things worth knowing before writing queries

- **Place identity.** The frontend's `Place.id` is an OSM reference (`n123`, `w45`, `r6`) or
  `l_<uuid>` for a NearMe-only listing. The database key is `businesses.id` (uuid);
  `businesses.osm_ref` holds the OSM reference (unique, NULL for NearMe-only listings). Every
  read RPC returns `place_ref` in the frontend's format. To get the uuid for a write:
  `l_<uuid>` → strip the prefix; an OSM place →
  `rpc('upsert_business_from_osm', { p_osm_ref, p_name, p_category_id, p_lat, p_lon })`
  (idempotent, returns the uuid, creates the row the first time).
- **Coordinates.** Spatial tables have plain `lat` / `lon` columns (the source of truth; this
  is what you insert and what Realtime delivers) and a generated `location geography(Point,4326)`
  with a GiST index (what the RPCs query). Ignore `location` in API responses: it is hex EWKB.
- **Timestamps** are `timestamptz` (ISO strings over the API); the frontend types use epoch
  milliseconds: convert with `Date.parse` / `new Date(ms).toISOString()`.
- **Counts instead of id arrays.** `helpful: string[]`, `confirmations: string[]`,
  `interested: string[]` … become `helpful_count`, `confirm_count`, `interested_count` plus a
  per-caller flag from the RPCs (`my_helpful`, `my_vote`, `is_interested`, `is_saved`). Who
  voted is private.
- **Soft deletion.** `businesses`, `reviews`, `community_reports`, `deals`, `events` have
  `deleted_at`. Owners "delete" by setting it; the public policies hide such rows.
- **Aggregates are server-maintained**: `businesses.rating_count / rating_sum / rating_avg`,
  all `*_count` columns, `profiles.points / level / reputation`. Clients cannot write them.
- **Level** is `0..3` = Explorer, Local Scout, Neighborhood Expert, Community Hero
  (`level_name` in `public_profiles` and the RPCs).

## 5. Frontend service ↔ database mapping

Each service keeps its public API; only its body changes from `localDb` to Supabase calls.
`sb` below is the client from `getSupabase()`.

### `services/auth.ts`
Already written against this schema: reads `profiles (id, display_name, role, home_area, bio,
created_at, status)` and updates `display_name, home_area, bio`. `role = 'business'` is set by
the database when the user first owns a listing. Deleting an account needs
`auth.admin.deleteUser(id)` from an Edge Function (service role); everything the user owns
cascades.

### `services/reviews.ts`
| Method | Backend |
| --- | --- |
| `listForPlace` | `sb.rpc('business_reviews', { p_business_id, p_limit, p_offset })` → visible reviews with `author_name`, `author_level`, `photos[]`, `my_helpful`, `is_mine` |
| `mine` | `from('reviews').select().eq('business_id', id).eq('user_id', uid).is('deleted_at', null).maybeSingle()` |
| `listByUser` | `from('reviews').select('*, business:businesses(id, osm_ref, name, category_id)').eq('user_id', uid)` |
| `save` | insert `{ business_id, rating, aspects, body }` or update `{ rating, aspects, body }` on the existing row. One live review per user per business is a unique index: a second insert fails with `23505`. Photos: upload to `review-photos/<uid>/<review id>/<n>.jpg`, then insert `review_photos { review_id, storage_path, sort_order 0..3 }` |
| `remove` | `update({ deleted_at: new Date().toISOString() })` (or `delete()`) |
| `toggleHelpful` | insert / delete `review_votes { review_id }` |
| `flag` | `sb.rpc('flag_content', { p_target_type: 'review', p_target_id, p_reason, p_note, p_target_label })` → `true` when created |
| `reply` | `sb.rpc('reply_to_review', { p_review_id, p_text })` (owner of a verified business, or admin; `null` removes the reply) |
| `computeStats` | `businesses.rating_avg`, `rating_count`, `price_level`; for many OSM places at once: `from('businesses').select('id, osm_ref, rating_avg, rating_count, price_level, verification_status').in('osm_ref', refs)` |

Field names: `Review.text` ↔ `body`; `reply { text, at }` ↔ `owner_reply`, `owner_reply_at`.
Contribution points for reviews and photos are recorded by triggers: drop the
`contributionsService.record(...)` calls.

### `services/community.ts`
| Method | Backend |
| --- | --- |
| `feed` | `sb.rpc('nearby_reports', { p_lat, p_lon, p_radius_m: 12000 })` → rows already carry `verification`, `freshness`, `confidence`, `distance_m`, `reporter_name`, `reporter_level`, `my_vote`, `my_helpful`. Only unexpired, visible reports are returned; the "Earlier" list of just-expired items has to come from what the client already holds |
| `forPlace` | filter the feed by `place_ref`, or `from('community_reports').select().eq('business_id', id)` and run the existing `deriveReport` |
| `mine` | `from('community_reports').select().eq('reporter_id', uid)` (own reports stay readable, expired or not, until they are purged ~24 h after expiry) |
| `submit` | `sb.rpc('submit_report', { p_type, p_level, p_title, p_value, p_note, p_business_id, p_lat, p_lon, p_area_label, p_as_business })` → `{ refreshed, report }`. `error.code === 'NM429'` → `ReportLimitError` |
| `vote` | `sb.rpc('confirm_report', { p_report_id })` / `sb.rpc('dispute_report', { p_report_id })` → `{ my_vote, confirm_count, dispute_count, moderation }` (calling again withdraws) |
| `toggleHelpful` | `sb.rpc('toggle_report_helpful', { p_report_id })` → boolean |
| `flag` | `sb.rpc('flag_content', { p_target_type: 'report', … })` |
| `remove` | `from('community_reports').update({ deleted_at }).eq('id', id)` |
| `prune` | not needed (`expire_reports()` runs on the server) |

Field names: `CommunityReport.updatedAt` ↔ **`refreshed_at`** (when the content was last
posted; `updated_at` also moves when a vote arrives and must not be used for freshness);
`placeId` ↔ `place_ref`; `confirmations.length` ↔ `confirm_count`.

Differences from local mode, all deliberate:
- for a report without a place, pass the position you have; the server snaps it to a ~300 m
  cell and returns the stored `lat` / `lon`. Keep calling `approximate()` first so the precise
  position never leaves the device;
- refreshing a report with a different level / title / value clears the confirmations and
  disagreements it had collected (they were about the old statement);
- posting as a business needs a verified listing owned by the caller;
- a withdrawn confirmation takes the confirmer's 2 points back; re-confirming restores them.

### `services/contributions.ts`
Read-only on the server. `list` → `from('user_contributions').select()` (own rows);
`summary` → own `profiles.points / level / reputation`, `user_badges` joined with `badges`
(progress counts can still be derived from the list). `record`, `setStatusByRef` and
`removeByRef` have no client equivalent: triggers and RPCs do it, so that nobody can award
themselves points. `Contribution.placeId` ↔ `business_id`, `refId` ↔ `ref_id`.

### `services/contribute.ts`
`submit` → insert into `place_suggestions { kind, business_id?, osm_ref?, name, category_id,
lat, lon, details, photo_paths }`; a second pending suggestion of the same kind for the same
place fails with `23505`. `mine` → select own rows. Points follow the admin's decision.

### `services/moderation.ts`
`flag` → `sb.rpc('flag_content', …)`; `autoFlag` is done by `dispute_report` on the server.

### `services/saved.ts`
`saved_places { business_id, note }`, `collections { name, description, icon, tone }`,
`collection_places { collection_id, business_id, sort_order }`, all private to the user.
Starter collections are created at sign-up (`ensureStarters` becomes a no-op). Adding a place to
a collection saves it automatically; un-saving removes it from every collection (foreign key).
Collection names are unique per user, case-insensitively (`23505`). The offline place snapshot
stays a client concern (`placeStore`); online, `select('*, business:businesses(*)')`.

### `services/deals.ts`
`dealsService.list` → `sb.rpc('nearby_deals', { p_lat, p_lon, p_radius_m })` (`is_saved`
included); `toggleSave` → insert / delete `saved_deals { deal_id }`.
`eventsService.list` → `sb.rpc('nearby_events', …)` plus the caller's own pending events
(`from('events').select().eq('submitted_by', uid)`); `toggleInterested` → insert / delete
`event_interest { event_id }`; `submit` → insert into `events { title, description, kind,
venue_name, business_id?, lat, lon, starts_at, ends_at, price }`. The server decides
`moderation` (from `app_config.events_require_approval`), `source`, `submitted_by` and the
organiser name, and records the contribution.

### `services/notifications.ts`
`list` → `from('notifications').select()`; `markRead` → `update({ read_at })`; `remove` /
`clear` → `delete()`. `push()` has no client equivalent: notifications are written by the
server (triggers, Edge Functions). `NotificationPrefs` ↔ `user_preferences`:
`enabled` ↔ `notifications_enabled`, `kinds.deal` ↔ `notify_deal` (and `notify_saved`,
`notify_availability`, `notify_event`, `notify_community`, `notify_favorite`), `radius` ↔
`notification_radius_m`, `frequency` ↔ `notification_frequency`, `quietHours` ↔
`quiet_hours_enabled / quiet_hours_from / quiet_hours_to`, `push` ↔ `push_enabled`.
`enablePush` → after `pushManager.subscribe`, call
`sb.rpc('register_push_subscription', { p_endpoint, p_p256dh, p_auth_key, p_user_agent, p_expires_at })`;
`disablePush` → `from('push_subscriptions').delete().eq('endpoint', endpoint)`.

### `services/analytics.ts`
`track` → `sb.rpc('track_business_event', { p_business_id, p_kind })` (anonymous; recorded only
for businesses that have an owner). `totals` / `daily` →
`sb.rpc('business_analytics_daily', { p_business_id, p_days })` (owner or admin; the window is
capped by the plan's `insights_days`).

### `services/search.ts`
Intent parsing and ranking stay in the client. History: `search_history { query, category_ids,
result_count }` (insert / select / delete own rows; the server skips the insert when
`user_preferences.save_search_history` is false, keeps the latest 50, stores no position).
`popularSearches` → `sb.rpc('trending_searches', { p_days, p_limit })`. Name search over
NearMe's own rows: `sb.rpc('search_businesses', { p_q, p_lat, p_lon, p_radius_m })`.

### `services/businessPortal.ts`
| Method | Backend |
| --- | --- |
| `listMine` / `get` | `from('businesses').select('*, hours:business_hours(*), services:business_services(*), photos:business_photos(*)').eq('owner_id', uid)` + own `business_claims` |
| `createDraft` | insert into `businesses { name, description, onboarding_step }`. Category and position may be missing while `verification_status = 'draft'` (use `null`, not `0,0` / `''`) |
| `claimedPlaces` | `from('businesses').select('osm_ref, owner_id').in('osm_ref', refs)` + own open claims |
| `claimPlace` | `upsert_business_from_osm` → insert `business_claims { business_id, contact_name, draft }` (**see below**) |
| `save` (sections) | update `businesses`; upsert `business_hours` (one row per ISO weekday 1 = Monday … 7 = Sunday; `closes <= opens` means past midnight); insert / update / delete `business_services` |
| photos | upload to `business-photos/<uid>/<business id>/…`, insert `business_photos { business_id, storage_path, caption, sort_order }`; plan limit → `NM402` |
| `submitVerification` | upload the document to `verification-docs/<uid>/<business id>/…`, insert `business_claims { business_id, contact_name, proof_type, message, document_path }`; the listing becomes `submitted` |
| `setPlan` | not writable by the owner: a checkout flow ends in a billing webhook (service role) writing `subscriptions`. Read with `sb.rpc('business_plan', { p_business_id })` |
| `deleteListing` | `update({ deleted_at })` |
| offers | insert / update / delete `deals`; `moderation` is set by the server; plan limits (`active_offers`, `promoted_offers`) → `NM402` |
| reviews | `business_reviews`, `reply_to_review`, `flag_content` |
| `insights` | `business_analytics_daily` |
| `setAvailability` | update `businesses.availability_status / availability_note / availability_wait_minutes` and `submit_report(…, p_as_business: true)` |

`BusinessListing.ownerName`, `verificationNote`, `verificationDoc` and
`PortalListing.verificationRequest` live on the latest `business_claims` row (`contact_name`,
`review_note`, `document_path`, `proof_type` + `message` + `created_at`): the business row is
public once verified, the claim row is private.

**Claiming an OSM place works differently from local mode.** Locally a claim creates an owned
draft immediately. On a shared database that would let anyone edit a public place before being
verified, so a claim is only a request: the claimant gets no control over the business row until
an administrator approves it (`review_business_claim`). Until then, keep what the wizard
collects in `business_claims.draft` (free-form JSON, private to the claimant and admins, editable
while the claim is `pending`); after approval the owner writes it to the real tables. Several
people may have an open claim on the same place; approving one closes the others.

### `services/admin.ts`
Admins use the same API; RLS lets `profiles.role = 'admin'` read every row.

| Method | Backend |
| --- | --- |
| `overview`, `attention`, `analytics`, list screens | plain selects |
| `reviewListing` | `sb.rpc('review_business_claim', { p_claim_id, p_decision: 'in_review' \| 'approved' \| 'rejected', p_note })` (a rejection needs a note; the owner is notified). To suspend a verified business: `admin_set_moderation('business', id, 'hidden')`; to remove its owner: `update({ owner_id: null })` |
| `setListingPlan` | insert / update `subscriptions` |
| `users` | `profiles` (e-mail / phone are in `auth.users`: list them through an Edge Function if the admin UI needs them) |
| `setUserRole` / `setUserStatus` | `from('profiles').update({ role })` / `sb.rpc('admin_set_moderation', { p_target_type: 'user', p_target_id, p_state: 'hidden' \| 'visible' })` |
| `deleteUser` | Edge Function → `auth.admin.deleteUser` |
| `config` / `updateConfig` | `app_config` (single row): `expiryMinutes` ↔ `report_expiry_minutes`, `minConfirmationsForVerified`, `maxReportsPerHour`, `disagreementsToHide`, `dealsRequireApproval`, `eventsRequireApproval` in snake_case |
| `setCategoryEnabled` / `setCategoryFeatured` | `categories.enabled` / `categories.featured` (replaces `disabledCategoryIds` / `featuredCategoryIds`) |
| `resolveSuggestion` | `from('place_suggestions').update({ status, reviewed_by, reviewed_at, review_note })` |
| content moderation, queue | `sb.rpc('admin_set_moderation', { p_target_type, p_target_id, p_state, p_resolution })` sets the state and closes the open flags; dismiss a flag with `from('moderation_reports').update({ status: 'dismissed', resolution, resolved_by, resolved_at })` |
| `setDealPromoted` | `from('deals').update({ promoted })` |
| deletes | `delete()` on `reviews`, `community_reports`, `deals`, `events`, `businesses` |

### `hooks/usePlaces.ts`
OSM stays the source of places. NearMe-only verified listings come from
`sb.rpc('nearby_businesses', { p_lat, p_lon, p_radius_m, p_category_ids, p_open_only, p_limit, p_offset })`
(rows with `osm_ref = null`, id `place_ref = 'l_<uuid>'`); the same call returns ratings,
verification and live availability for OSM places NearMe knows about.

## 6. RPC reference

Parameters are named `p_*` (so they cannot collide with column names); pass them by name.
Errors arrive as `error.code` + `error.message`:

| Code | Meaning |
| --- | --- |
| `28000` | not signed in |
| `42501` | not allowed (not the owner, not an admin, suspended account, protected column) |
| `22023` | invalid argument |
| `P0002` | the target does not exist or is not visible |
| `NM409` | not allowed in the current state (own report, expired report, already decided, own business …) |
| `NM429` | rate limit (`max_reports_per_hour`, `max_reviews_per_day`) |
| `NM402` | plan limit (offers, promoted offers, photos) |
| `23505` / `23514` | unique / check constraint (duplicate review, text too short …) |

Read (anon + signed in). These run with the caller's rights, so RLS applies; the two exceptions
are `trending_searches` (returns aggregates only) and `track_business_event` (insert-only).

| Function | Returns |
| --- | --- |
| `nearby_businesses(p_lat, p_lon, p_radius_m = 2000, p_category_ids text[] = null, p_open_only = false, p_limit = 50, p_offset = 0)` | businesses within the radius (`ST_DWithin` on geography), nearest first, with `distance_m`, `category_ids`, rating, `is_open` (null = hours unknown; `p_open_only` keeps only `true`) |
| `search_businesses(p_q, p_lat = null, p_lon = null, p_radius_m = 5000, p_limit = 30)` | typo-tolerant name search (pg_trgm + unaccent), `match_score`; with a position also matches by category keyword ("petrol") |
| `nearby_reports(p_lat, p_lon, p_radius_m = 12000, p_limit = 200)` | current reports with `verification`, `freshness`, `confidence` (same formulas as `deriveReport`), `my_vote`, `my_helpful` |
| `business_reviews(p_business_id, p_limit = 30, p_offset = 0)` | visible reviews with author chip and photos |
| `nearby_deals(p_lat, p_lon, p_radius_m = 15000, p_limit = 100)` | deals running now, promoted first |
| `nearby_events(p_lat, p_lon, p_radius_m = 20000, p_limit = 100)` | approved events that have not ended |
| `trending_searches(p_days = 7, p_limit = 10, p_min_users = 5)` | queries typed by at least `p_min_users` (min 3) different people |
| `track_business_event(p_business_id, p_kind)` | void |
| `is_business_open(p_business_id, p_at = now())` | boolean / null |

Write (signed in)

| Function | Returns |
| --- | --- |
| `submit_report(p_type, p_level, p_title, p_value, p_note, p_business_id, p_lat, p_lon, p_area_label, p_as_business)` | `{ refreshed, report }` |
| `confirm_report(p_report_id)`, `dispute_report(p_report_id)` | `{ report_id, my_vote, confirm_count, dispute_count, moderation }` |
| `toggle_report_helpful(p_report_id)` | boolean |
| `flag_content(p_target_type, p_target_id, p_reason, p_note, p_target_label)` | boolean (false = you already have an open flag on it) |
| `upsert_business_from_osm(p_osm_ref, p_name, p_category_id, p_lat, p_lon)` | uuid |
| `reply_to_review(p_review_id, p_text)` | the review row |
| `register_push_subscription(p_endpoint, p_p256dh, p_auth_key, p_user_agent, p_expires_at)` | uuid |
| `business_analytics_daily(p_business_id, p_days = 14)` | `(day, kind, events)` |
| `business_plan(p_business_id)` | `free \| plus \| pro` (null unless owner / admin) |
| `review_business_claim(p_claim_id, p_decision, p_note)` — admin | the claim row |
| `admin_set_moderation(p_target_type, p_target_id, p_state, p_resolution)` — admin | number of flags closed |

Service role / SQL only: `expire_reports()`, `purge_sample_data()`, `notify_user(...)`.

## 7. Realtime

`0004` adds two tables to the `supabase_realtime` publication. Realtime applies the SELECT
policies per subscriber.

```ts
// Live feed. Rows carry lat / lon numbers and the vote tallies, not the derived fields.
sb.channel('live-updates')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'community_reports' }, (payload) => {
    // INSERT / UPDATE: payload.new  ·  DELETE: payload.old.id only
    // Simplest correct handling: debounce and re-run nearby_reports for the visible area.
  })
  .subscribe();

// The signed-in user's inbox.
sb.channel('inbox')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, onNotification)
  .subscribe();
```

Two things Realtime cannot tell you, so the client must handle them:

1. **Expiry is not an event.** Nothing changes in the database when `expires_at` passes. Drop a
   report locally at that moment (a timer per report, or a tick that filters the list).
2. **A report that stops being visible** (auto-hidden after disputes, removed by its author)
   no longer passes the policy, so the update may not be delivered. Refetch `nearby_reports`
   periodically (for example once a minute and on tab focus).

## 8. Push notifications

1. The browser subscribes (`notificationsService.enablePush`, public VAPID key) and stores the
   subscription with `register_push_subscription`. One row per browser endpoint in
   `push_subscriptions`, private to the user.
2. Something creates a row in `notifications`: a database trigger (first confirmation of your
   report, a reply to your review, a verification decision — all through `notify_user`, which
   honours the user's category switches) or a server job using the service role.
3. A **Database Webhook** on `INSERT` into `public.notifications` calls an Edge Function, which
   signs and sends the push with the private VAPID key.

Edge Function sketch (`supabase/functions/push/index.ts`, not included in this folder):

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  // Only the database webhook may call this.
  if (req.headers.get('authorization') !== `Bearer ${Deno.env.get('PUSH_WEBHOOK_SECRET')}`) return new Response('forbidden', { status: 403 });
  const { record } = await req.json();                       // the new notifications row

  const { data: prefs } = await admin.from('user_preferences')
    .select('push_enabled, quiet_hours_enabled, quiet_hours_from, quiet_hours_to, timezone, notification_frequency')
    .eq('user_id', record.user_id).single();
  if (!prefs?.push_enabled) return new Response('push off');
  // TODO: honour quiet hours (in prefs.timezone) and 'hourly' / 'daily' digests here.

  const { data: subs } = await admin.from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key').eq('user_id', record.user_id);

  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        JSON.stringify({ title: record.title, body: record.body, href: record.href ?? '/notifications' }),
      );
      await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', s.id);
    } catch (err) {
      // 404 / 410: the browser dropped the subscription. Remove it.
      if (err.statusCode === 404 || err.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
    }
  }));

  await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', record.id);
  return new Response('ok');
});
```

"Near you" notifications (a new deal within the user's radius) need a place to measure from.
The only user-linked position in the schema is the optional `user_preferences.alert_lat /
alert_lon`: one value the user chooses, snapped to a ~1 km grid by a trigger, never a history.
A fan-out job (service role) selects users with
`ST_DWithin(alert_location, <business location>, notification_radius_m)` and the matching
`notify_*` switch, and inserts their notifications. If the product does not want this, leave the
two columns NULL: nothing else depends on them.

## 9. Scheduled jobs

`expire_reports()` hard-deletes reports `app_config.report_retention_hours` (default 24) after
they expire, removes the pending contributions of reports nobody confirmed (no penalty) and
closes automatic flags about them. **Correctness does not depend on it**: every read path
compares `expires_at` with `now()`, so an expired report is never returned as current even if
the job is not running. The job is the privacy half: the table must not become a record of
where people were.

Enable `pg_cron` (Dashboard → Database → Extensions), then either re-run `0003` or:

```sql
select cron.schedule('nearme-expire-reports', '*/5 * * * *', $$select public.expire_reports()$$);
select * from cron.job;                                -- inspect
select cron.unschedule('nearme-expire-reports');       -- remove
```

`0003` schedules it automatically when `pg_cron` is already installed.

## 10. Security model in plain language

- **Who you are** is the user id inside the signed session token (`auth.uid()`). Nothing else
  in the token is trusted: not a role claim, not user metadata.
- **Admins** are accounts whose `profiles.role` is `admin`. Only an existing admin (or someone
  with database access) can change `role` or `status`; a guard trigger refuses it for everybody
  else, and the columns holding points, level and reputation cannot be written through the API
  at all.
- **Business owners** are whoever `businesses.owner_id` says. That column is set when you
  register your own listing, or by an admin approving your claim. Owners manage only their own
  business: its details, hours, services, photos, offers, and replies to its reviews (through
  one narrow function; they cannot touch the review itself).
- **Everyone, signed in or not, can read** public content: categories, visible businesses
  (OSM places and *verified* NearMe-only listings), visible reviews, live reports that have not
  expired, running deals, upcoming approved events, and the name / level of authors.
- **Only you can read or change** your preferences, saved places, collections, notifications,
  search history, push subscriptions, contributions, claims and the flags you raised.
- **You write only as yourself.** Author columns default to the caller and are not writable;
  reports and votes can only be created through functions that enforce one vote per person, no
  voting on your own report, the hourly limit, the expiry time and the location coarsening.
- **Moderation state belongs to the server.** Authors cannot un-hide their content; editing an
  approved event or deal sends it back for review when approval is required.
- **Location privacy.** No table records where a user is or has been. A report about a place
  sits on the place; a report about an area is stored on a ~300 m grid; reports are deleted about
  a day after they expire; search history and analytics hold no coordinates; analytics hold no
  user id.
- **Files.** Users upload only into a folder named after their own user id. Photo buckets are
  public by URL but cannot be listed; verification documents are private to the uploader and
  admins.
- **Three layers enforce this**: column-level privileges (what can be written at all), row
  policies (which rows), guard triggers (the few admin-only columns). The service-role key
  bypasses all three and must stay on the server.

Expected advisor warning: the Supabase linter reports `public.public_profiles` as a "security
definer view". That is intentional: `profiles` is private, and the view is the deliberately
narrow public projection (id, name, avatar, level).

## 11. Sample data

`seed/dev_seed.sql` (development only, idempotent, must run as `postgres`):

- **Part A** repeats the reference data of migration `0006` with `ON CONFLICT DO NOTHING`, so
  the seed also works on a database that only has `0001`–`0005`. Production gets these rows
  from the migration and never needs the seed.
- **Part B** adds six sample accounts (they cannot sign in), six businesses around BTM Layout,
  reviews, live updates, deals, events and one suggestion. Every row has `is_sample = true`,
  including the contributions derived by triggers. Clients cannot set `is_sample`.

Remove all sample data with one statement:

```sql
select public.purge_sample_data();
```

The seed refuses to run when it finds more than 25 real accounts (override:
`set nearme.allow_dev_seed = 'on';`). Sample live updates expire like real ones; run the seed
again to refresh them.

## 12. What was validated, and what was not

There is no local Postgres on the authoring machine, so the SQL was executed in
[PGlite](https://pglite.dev) (PostgreSQL compiled to WebAssembly) with its **real PostGIS**
build and the `pg_trgm`, `unaccent` and `pgcrypto` contrib modules, in a scratch folder outside
this repository. Everything below was run on two engine versions, with identical results:

| PGlite | PostgreSQL | PostGIS |
| --- | --- | --- |
| 0.4.6 | 17.5 | 3.6.2 |
| 0.6.0 | 19.0 | 3.7.0 |

Supabase-provided objects were replaced by minimal stand-ins: roles `anon` / `authenticated` /
`service_role`, Supabase's default privileges on `public`, `auth.users`, `auth.uid()`,
`storage.buckets`, `storage.objects`, `storage.foldername()`, the `supabase_realtime`
publication and a `cron.schedule()` stub.

Executed, with no shims or edits to the migration files themselves:

- all six migrations in order, with only `public` on the `search_path` (so an unqualified
  reference to an extension object would fail), then **all six a second time** (idempotency);
- `dev_seed.sql` twice, then `purge_sample_data()`;
- **423 behavioural assertions, all passing**, run as `anon`, as several ordinary users, as a
  business owner and as an admin (`SET ROLE` + JWT claims, with the JWT deliberately claiming
  admin in its metadata). They cover: sign-up trigger; every "cannot" in section 10 (role /
  status / points escalation, reading other users' private rows, writing protected columns,
  forged authors, direct inserts into reports / votes / notifications / contributions);
  reviews (one per user, aggregates through insert / edit / hide / restore / soft delete /
  hard delete, reward exactly once); reports (coarsening, expiry from config, refresh instead
  of duplicate, hourly limit incl. after deletion, one vote per user, no own votes, auto-hide
  at the threshold, verification after the first confirmation, expired never returned, purge);
  **numeric parity of `report_verification / report_freshness / report_confidence` with a
  port of `deriveReport()` on 1,120 input combinations**; businesses, drafts, claims,
  verification, plan limits; `nearby_businesses` (distance vs. haversine, radius, categories,
  paging, open-now incl. overnight hours); typo-tolerant search; events, suggestions, flags,
  admin moderation; storage policies; account deletion cascades;
- structural checks: RLS enabled and at least one policy on all 34 tables; `anon` holds no
  write privilege anywhere and no SELECT on private tables; the exact list of functions
  executable by `anon` and by `authenticated`; every function pins `search_path` and every
  SECURITY DEFINER function pins it to empty; geography columns exist only where intended;
- index use on 20,000 synthetic businesses and 5,000 reports, planned without knowing the
  argument values: trigram GIN for `search_businesses`, GiST for `nearby_businesses`,
  `nearby_reports` and the category branch of search.

Not executed, and therefore to be checked on a real Supabase project:

- **PostgreSQL 15 and PostGIS 3.3.** Supabase projects run PG 15 or PG 17 with PostGIS 3.3.x.
  PG 17 is covered above; PG 15 is not (no PGlite build pairs it with PostGIS). The SQL was
  written to PG 15 syntax — the newest features used are `create or replace trigger` (PG 14)
  and `as materialized` (PG 12) — but that has not been proven by execution, and neither has
  the older PostGIS release;
- the real `auth`, `storage`, Realtime and `pg_cron` services: GoTrue creating users, Storage
  enforcing the 5 MB / MIME limits from the bucket rows, Realtime delivery under these
  policies, the cron job actually firing;
- anything that goes through PostgREST: resource embedding (for example
  `reviews → public_profiles`), upserts, and how the custom error codes surface in
  `supabase-js`;
- concurrency. PGlite is single-connection, so the row locks and the advisory lock in
  `submit_report` were exercised but never contended;
- the Edge Function in section 8 is a sketch and has not been run.

## 13. Known limits and follow-ups

- **`upsert_business_from_osm` trusts the first caller** for the name, category and position
  of an OSM place and never overwrites them afterwards (so nobody can rename an existing
  place, but the first write can be wrong). The UI keeps showing OSM's own data for OSM
  places. A server-side job should reconcile unclaimed rows against OSM.
- **Rate limits in SQL cover reports and reviews only.** Creating business rows, events,
  suggestions, flags and analytics events is limited only by Supabase's API rate limiting.
- **Plan limits**: offers, promoted offers and photos are enforced by triggers; the insights
  window only inside `business_analytics_daily` (an owner could still read older
  `analytics_events` rows directly).
- **Display names are public** through `public_profiles` for every account id.
- **A suspended owner of an OSM place** keeps the row public (it is an OSM place); hide the
  business or clear `owner_id` to take control away.
- Deleting a business row is blocked while it has `subscriptions` rows (billing history is
  `ON DELETE RESTRICT`); normal removal is a soft delete.
- No table partitioning or retention for `analytics_events` and `notifications` yet.
