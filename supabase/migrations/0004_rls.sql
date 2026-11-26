-- ════════════════════════════════════════════════════════════════════════════════════════════
-- NearMe · 0004 · Privileges, Row Level Security policies, Realtime
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Re-runnable: privileges are revoked and re-granted, policies are dropped and re-created.
--
-- The model has three layers, and a request must pass all of them:
--
--   1. PRIVILEGES (GRANT) decide which tables, *columns* and functions the API roles can touch
--      at all. Supabase grants ALL on everything in `public` to `anon` and `authenticated` by
--      default; this file takes that away and grants back the minimum. Columns that only the
--      system maintains (rating aggregates, vote tallies, points, is_sample, owner replies, ids
--      and foreign keys that identify the author) are never granted, so no policy mistake can
--      expose them to writes.
--   2. ROW LEVEL SECURITY decides which rows. Every table has RLS enabled; no policy = no rows.
--   3. GUARD TRIGGERS (0003) protect the few columns that administrators must be able to
--      change through the same API as everyone else (profiles.role/status,
--      *.moderation, businesses.owner_id/verification_status, the decision fields of
--      business_claims).
--
-- Identity is always `auth.uid()` (the verified JWT subject). Admin rights come from
-- `profiles.role = 'admin'` read by public.is_admin(); business rights from
-- `businesses.owner_id` read by public.owns_business(). Nothing here reads a role, a flag or
-- metadata from the JWT, which the client could influence.
--
-- `(select auth.uid())` / `(select public.is_admin())` are written as scalar sub-selects on
-- purpose: Postgres then evaluates them once per statement instead of once per row.
--
-- The service role bypasses RLS and keeps full privileges. It must only ever be used on a
-- server (Edge Functions, webhooks, cron) — never shipped to the browser.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Enable RLS, reset privileges and policies ────────────────────────────────────────────

do $$
declare
  v_tables constant text[] := array[
    'profiles', 'user_preferences', 'category_groups', 'categories', 'app_config',
    'businesses', 'business_categories', 'business_claims', 'business_hours', 'business_services', 'business_photos',
    'reviews', 'review_photos', 'review_votes',
    'saved_places', 'collections', 'collection_places',
    'community_reports', 'report_confirmations', 'report_votes',
    'deals', 'saved_deals', 'events', 'event_interest',
    'notifications', 'push_subscriptions',
    'user_contributions', 'badges', 'user_badges',
    'subscriptions', 'moderation_reports', 'search_history', 'place_suggestions', 'analytics_events'
  ];
  t text;
  p record;
  f record;
begin
  -- Guard against a table being added to 0002 and forgotten here.
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> all (v_tables)
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')   -- skip extension tables
  loop
    raise warning 'Table public.% is not covered by 0004_rls.sql: it has no NearMe policies.', t;
  end loop;

  foreach t in array v_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;

  for p in
    select pol.policyname, pol.tablename
    from pg_policies pol
    where pol.schemaname = 'public' and pol.tablename = any (v_tables)
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  -- Functions: default deny. Postgres grants EXECUTE to PUBLIC on every new function and
  -- Supabase adds anon/authenticated; both are removed for every non-extension function in
  -- `public`, and section 2 grants back the ones that are part of the API.
  -- (A function added later is therefore not callable until it is granted here.)
  for f in
    select pr.oid::regprocedure as signature
    from pg_proc pr
    join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public'
      and pr.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = pr.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end
$$;

revoke all on public.public_profiles from anon, authenticated;

-- ── 2. Function privileges ──────────────────────────────────────────────────────────────────

-- Used inside policies, guard triggers and views, so every API role must be able to call them.
grant execute on function public.is_admin()                      to anon, authenticated;
grant execute on function public.is_active_user()                to anon, authenticated;
grant execute on function public.owns_business(uuid)             to anon, authenticated;
grant execute on function public.is_client_request()             to anon, authenticated;
grant execute on function public.level_name(integer)             to anon, authenticated;
grant execute on function public.level_for_points(integer)       to anon, authenticated;
grant execute on function public.contribution_points(public.contribution_kind) to anon, authenticated;
grant execute on function public.immutable_unaccent(text)        to anon, authenticated;
grant execute on function public.normalize_text(text)            to anon, authenticated;
grant execute on function public.report_ttl_minutes(public.report_type) to anon, authenticated;
grant execute on function public.coarsen_point(double precision, double precision) to anon, authenticated;
grant execute on function public.report_verification(public.report_source, integer, integer, integer) to anon, authenticated;
grant execute on function public.report_freshness(timestamptz, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.report_confidence(public.report_source, integer, integer, integer, timestamptz, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.is_business_open(uuid, timestamptz) to anon, authenticated;

-- Read RPCs: open to signed-out visitors too (they are SECURITY INVOKER, so RLS still applies).
grant execute on function public.nearby_businesses(double precision, double precision, integer, text[], boolean, integer, integer) to anon, authenticated;
grant execute on function public.search_businesses(text, double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.nearby_reports(double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.business_reviews(uuid, integer, integer) to anon, authenticated;
grant execute on function public.nearby_deals(double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.nearby_events(double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.trending_searches(integer, integer, integer) to anon, authenticated;
grant execute on function public.track_business_event(uuid, public.analytics_kind) to anon, authenticated;

-- Write RPCs: signed-in users only (each one also checks auth.uid() itself).
grant execute on function public.submit_report(public.report_type, public.report_level, text, numeric, text, uuid, double precision, double precision, text, boolean) to authenticated;
grant execute on function public.confirm_report(uuid)            to authenticated;
grant execute on function public.dispute_report(uuid)            to authenticated;
grant execute on function public.toggle_report_helpful(uuid)     to authenticated;
grant execute on function public.flag_content(public.moderation_target, text, text, text, text) to authenticated;
grant execute on function public.upsert_business_from_osm(text, text, text, double precision, double precision) to authenticated;
grant execute on function public.reply_to_review(uuid, text)     to authenticated;
grant execute on function public.register_push_subscription(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.business_analytics_daily(uuid, integer) to authenticated;
-- Plan lookups: used by the plan-limit triggers (which run as the caller) and by the portal.
-- business_plan() answers only for the owner / admins.
grant execute on function public.business_plan(uuid)             to authenticated;
grant execute on function public.business_plan_limit(uuid, text) to authenticated;
-- Admin RPCs: callable by any signed-in user, refused inside unless public.is_admin().
grant execute on function public.review_business_claim(uuid, public.claim_status, text) to authenticated;
grant execute on function public.admin_set_moderation(public.moderation_target, uuid, public.moderation_state, text) to authenticated;

-- Deliberately NOT granted to API roles (service role / SQL editor / triggers only):
--   handle_new_user, set_updated_at, guard_admin_columns, gate_content_moderation,
--   deals_enforce_plan, business_photos_enforce_plan, every *_before_* / *_after_* trigger
--   function (trigger functions need no EXECUTE privilege to fire), notify_user, sync_contribution,
--   recompute_user_score, refresh_business_rating, lock_votable_report, expire_reports,
--   purge_sample_data.

-- ── 3. Table and column privileges ──────────────────────────────────────────────────────────
-- A column missing from an INSERT/UPDATE list below cannot be written by any API client,
-- administrators included. That is intentional for system-maintained columns.

-- Reference data: world-readable, edited by admins.
grant select on public.category_groups, public.categories, public.badges, public.app_config to anon, authenticated;
grant insert, update, delete on public.category_groups, public.categories, public.badges to authenticated;
grant update (report_expiry_minutes, min_confirmations_for_verified, max_reports_per_hour, max_reviews_per_day,
              disagreements_to_hide, deals_require_approval, events_require_approval, report_retention_hours,
              plan_limits, flags, updated_by)
  on public.app_config to authenticated;

-- Accounts. (points / level / reputation / is_sample are never writable; role and status are
-- writable only by admins — trg_profiles_guard.)
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, home_area, bio, role, status) on public.profiles to authenticated;
grant select on public.public_profiles to anon, authenticated;
grant select, insert, update on public.user_preferences to authenticated;

-- Businesses. Not writable by clients: rating_*, verified_at, availability_updated_at,
-- is_sample, created_at. owner_id / osm_ref / verification_status / moderation: admins only
-- (trg_businesses_guard); on INSERT the owner is forced to the caller (trg_businesses_prepare).
grant select on public.businesses to anon, authenticated;
grant insert (name, description, category_id, lat, lon, address, locality, phone, email, website,
              opening_hours, timezone, amenities, price_level, onboarding_step)
  on public.businesses to authenticated;
grant update (name, description, category_id, lat, lon, address, locality, phone, email, website,
              opening_hours, timezone, amenities, price_level, onboarding_step,
              availability_status, availability_note, availability_wait_minutes, deleted_at,
              owner_id, osm_ref, verification_status, moderation)
  on public.businesses to authenticated;
grant delete on public.businesses to authenticated;   -- admins only (no owner DELETE policy; owners soft-delete)

grant select on public.business_categories to anon, authenticated;
grant insert (business_id, category_id), delete on public.business_categories to authenticated;

grant select on public.business_claims to authenticated;
grant insert (business_id, contact_name, contact_phone, proof_type, message, document_path, draft) on public.business_claims to authenticated;
-- The claimant may edit an open request; status / review_* are admin-only (trg_business_claims_guard).
grant update (contact_name, contact_phone, proof_type, message, document_path, draft,
              status, review_note, reviewed_by, reviewed_at)
  on public.business_claims to authenticated;
grant delete on public.business_claims to authenticated;

grant select on public.business_hours, public.business_services to anon, authenticated;
grant insert, update, delete on public.business_hours, public.business_services to authenticated;

grant select on public.business_photos to anon, authenticated;
grant insert (business_id, storage_path, caption, sort_order) on public.business_photos to authenticated;
grant update (caption, sort_order, moderation) on public.business_photos to authenticated;
grant delete on public.business_photos to authenticated;

-- Reviews. Not writable by clients: user_id (defaults to auth.uid()), business_id after
-- insert, helpful_count, flag_count, owner_reply* (reply_to_review only), is_sample.
grant select on public.reviews to anon, authenticated;
grant insert (business_id, rating, aspects, body) on public.reviews to authenticated;
grant update (rating, aspects, body, deleted_at, moderation) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;

grant select on public.review_photos to anon, authenticated;
grant insert (review_id, storage_path, sort_order), delete on public.review_photos to authenticated;

-- `anon` gets SELECT on the per-user reaction tables only so the SECURITY INVOKER read RPCs
-- (which compute "did I vote?") do not fail with "permission denied" for signed-out visitors.
-- No policy applies to anon on these tables, so anon always sees zero rows.
grant select on public.review_votes to anon, authenticated;
grant insert (review_id), delete on public.review_votes to authenticated;

-- Private per-user data.
grant select on public.saved_places to authenticated;
grant insert (business_id, note), update (business_id, note), delete on public.saved_places to authenticated;

grant select on public.collections to authenticated;
grant insert (name, description, icon, tone), update (name, description, icon, tone), delete on public.collections to authenticated;

grant select on public.collection_places to authenticated;
grant insert (collection_id, business_id, sort_order), update (sort_order), delete on public.collection_places to authenticated;

-- Community reports: created only by submit_report(); votes only by the voting RPCs.
-- The reporter may soft-delete (deleted_at); `moderation` is admin-only (trg_community_reports_guard).
grant select on public.community_reports to anon, authenticated;
grant update (deleted_at, moderation) on public.community_reports to authenticated;
grant delete on public.community_reports to authenticated;   -- admins only (policy)
grant select on public.report_confirmations, public.report_votes to anon, authenticated;

-- Deals and events.
grant select on public.deals to anon, authenticated;
-- `promoted` is writable, but only as far as the business's plan allows (trg_deals_plan).
grant insert (business_id, title, description, kind, badge, code, terms, starts_at, ends_at, promoted) on public.deals to authenticated;
grant update (title, description, kind, badge, code, terms, starts_at, ends_at, deleted_at, moderation, promoted) on public.deals to authenticated;
grant delete on public.deals to authenticated;

grant select on public.saved_deals to anon, authenticated;
grant insert (deal_id), delete on public.saved_deals to authenticated;

grant select on public.events to anon, authenticated;
grant insert (title, description, kind, venue_name, business_id, lat, lon, starts_at, ends_at, price, organizer_name) on public.events to authenticated;
grant update (title, description, kind, venue_name, business_id, lat, lon, starts_at, ends_at, price, organizer_name, deleted_at, moderation) on public.events to authenticated;
grant delete on public.events to authenticated;

grant select on public.event_interest to anon, authenticated;
grant insert (event_id), delete on public.event_interest to authenticated;

-- Notifications are written by the server; the user can mark them read or remove them.
grant select on public.notifications to authenticated;
grant update (read_at), delete on public.notifications to authenticated;

grant select on public.push_subscriptions to authenticated;
grant insert (endpoint, p256dh, auth_key, user_agent, expires_at),
      update (p256dh, auth_key, user_agent, expires_at),
      delete
  on public.push_subscriptions to authenticated;

-- Contributions and badges are computed by the server; nobody can award themselves points.
grant select on public.user_contributions to authenticated;
grant update (status) on public.user_contributions to authenticated;   -- admins (policy)
grant select on public.user_badges to anon, authenticated;

-- Subscriptions are written by the billing webhook (service role). The write privileges below
-- are usable by administrators only: there is no owner INSERT/UPDATE policy.
grant select on public.subscriptions to authenticated;
grant insert (business_id, owner_id, plan, status, current_period_start, current_period_end, cancel_at_period_end),
      update (plan, status, current_period_start, current_period_end, cancel_at_period_end)
  on public.subscriptions to authenticated;

grant select on public.moderation_reports to authenticated;             -- created by flag_content()
grant update (status, resolution, resolved_by, resolved_at), delete on public.moderation_reports to authenticated;   -- admins (policy)

grant select on public.search_history to authenticated;
grant insert (query, category_ids, result_count), delete on public.search_history to authenticated;

grant select on public.place_suggestions to authenticated;
grant insert (kind, business_id, osm_ref, name, category_id, lat, lon, details, photo_paths) on public.place_suggestions to authenticated;
grant update (status, review_note, reviewed_by, reviewed_at) on public.place_suggestions to authenticated;   -- admins (policy)
grant delete on public.place_suggestions to authenticated;

grant select on public.analytics_events to authenticated;               -- written by track_business_event()

-- ── 4. Policies ─────────────────────────────────────────────────────────────────────────────

-- 4.0 Administrators: full row access on every table (within the column privileges above).
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_preferences', 'category_groups', 'categories', 'app_config',
    'businesses', 'business_categories', 'business_claims', 'business_hours', 'business_services', 'business_photos',
    'reviews', 'review_photos', 'review_votes',
    'saved_places', 'collections', 'collection_places',
    'community_reports', 'report_confirmations', 'report_votes',
    'deals', 'saved_deals', 'events', 'event_interest',
    'notifications', 'push_subscriptions',
    'user_contributions', 'badges', 'user_badges',
    'subscriptions', 'moderation_reports', 'search_history', 'place_suggestions', 'analytics_events'
  ]
  loop
    execute format(
      'create policy "admin: full access" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t
    );
  end loop;
end
$$;

-- 4.1 Reference data: public read.
create policy "category_groups: public read" on public.category_groups for select to anon, authenticated using (true);
create policy "categories: public read"      on public.categories      for select to anon, authenticated using (true);
create policy "badges: public read"          on public.badges          for select to anon, authenticated using (true);
create policy "app_config: public read"      on public.app_config      for select to anon, authenticated using (true);
create policy "user_badges: public read"     on public.user_badges     for select to anon, authenticated using (true);

-- 4.2 Accounts.
-- A profile row is visible to its owner only (others use the public_profiles view). The row is
-- created by handle_new_user and removed by deleting the auth user: no INSERT/DELETE policy.
create policy "profiles: owner read" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: owner update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "user_preferences: owner read" on public.user_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_preferences: owner insert" on public.user_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "user_preferences: owner update" on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 4.3 Businesses.
-- Public: not deleted, not hidden, and either an OpenStreetMap place or a verified NearMe-only
-- listing (drafts and unverified owner listings stay private to their owner).
create policy "businesses: public read" on public.businesses
  for select to anon, authenticated
  using (
    deleted_at is null
    and moderation = 'visible'
    and (osm_ref is not null or verification_status = 'verified')
  );

-- Owners always see their own rows, including drafts and soft-deleted ones. (Also required for
-- soft deletion to work: Postgres checks the updated row against the SELECT policies.)
create policy "businesses: owner read" on public.businesses
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Registering a NearMe-only listing. trg_businesses_prepare has already forced
-- owner_id = auth.uid() and verification_status = 'draft' when this check runs.
create policy "businesses: register own listing" on public.businesses
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and osm_ref is null
    and (select public.is_active_user())
  );

create policy "businesses: owner update" on public.businesses
  for update to authenticated
  using (owner_id = (select auth.uid()) and deleted_at is null)
  with check (owner_id = (select auth.uid()));

-- Child tables inherit visibility from the parent: the sub-select on public.businesses is
-- itself filtered by the caller's RLS, so "the business is visible to you" is the whole rule.
create policy "business_categories: read with business" on public.business_categories
  for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));

create policy "business_categories: owner add" on public.business_categories
  for insert to authenticated
  with check (public.owns_business(business_id));

-- The primary category row is maintained by trigger and cannot be removed here.
create policy "business_categories: owner remove secondary" on public.business_categories
  for delete to authenticated
  using (
    public.owns_business(business_id)
    and category_id <> (select b.category_id from public.businesses b where b.id = business_id)
  );

create policy "business_hours: read with business" on public.business_hours
  for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));

create policy "business_hours: owner manage" on public.business_hours
  for all to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

create policy "business_services: read with business" on public.business_services
  for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));

create policy "business_services: owner manage" on public.business_services
  for all to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

create policy "business_photos: public read" on public.business_photos
  for select to anon, authenticated
  using (moderation = 'visible' and exists (select 1 from public.businesses b where b.id = business_id));

create policy "business_photos: owner read" on public.business_photos
  for select to authenticated
  using (public.owns_business(business_id));

-- The row may only point at a file inside the uploader's own storage folder.
create policy "business_photos: owner add" on public.business_photos
  for insert to authenticated
  with check (
    public.owns_business(business_id)
    and storage_path like ((select auth.uid())::text || '/%')
  );

create policy "business_photos: owner update" on public.business_photos
  for update to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

create policy "business_photos: owner delete" on public.business_photos
  for delete to authenticated
  using (public.owns_business(business_id));

-- Claims: private to the claimant and admins. Decisions are made by review_business_claim().
create policy "business_claims: claimant read" on public.business_claims
  for select to authenticated
  using (claimant_id = (select auth.uid()));

create policy "business_claims: claimant create" on public.business_claims
  for insert to authenticated
  with check (claimant_id = (select auth.uid()) and (select public.is_active_user()));

create policy "business_claims: claimant edit pending" on public.business_claims
  for update to authenticated
  using (claimant_id = (select auth.uid()) and status = 'pending')
  with check (claimant_id = (select auth.uid()) and status = 'pending');

create policy "business_claims: claimant withdraw pending" on public.business_claims
  for delete to authenticated
  using (claimant_id = (select auth.uid()) and status = 'pending');

-- 4.4 Reviews: public read of visible ones; insert / update / delete by the author only.
create policy "reviews: public read" on public.reviews
  for select to anon, authenticated
  using (deleted_at is null and moderation = 'visible');

create policy "reviews: author read" on public.reviews
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "reviews: author insert" on public.reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active_user())
    and exists (select 1 from public.businesses b where b.id = business_id)   -- a business the caller can see
  );

create policy "reviews: author update" on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reviews: author delete" on public.reviews
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "review_photos: read with review" on public.review_photos
  for select to anon, authenticated
  using (exists (select 1 from public.reviews r where r.id = review_id));

create policy "review_photos: author add" on public.review_photos
  for insert to authenticated
  with check (
    exists (select 1 from public.reviews r where r.id = review_id and r.user_id = (select auth.uid()) and r.deleted_at is null)
    and storage_path like ((select auth.uid())::text || '/%')
  );

create policy "review_photos: author delete" on public.review_photos
  for delete to authenticated
  using (exists (select 1 from public.reviews r where r.id = review_id and r.user_id = (select auth.uid())));

-- Who found a review helpful is private; the tally on the review is public.
create policy "review_votes: voter read" on public.review_votes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "review_votes: voter add" on public.review_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active_user())
    and exists (select 1 from public.reviews r where r.id = review_id and r.deleted_at is null and r.moderation = 'visible')
  );

create policy "review_votes: voter remove" on public.review_votes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 4.5 Private per-user data: the owner and nobody else.
create policy "saved_places: owner all" on public.saved_places
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "collections: owner all" on public.collections
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "collection_places: owner all" on public.collection_places
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "saved_deals: owner all" on public.saved_deals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "event_interest: owner all" on public.event_interest
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "search_history: owner all" on public.search_history
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "push_subscriptions: owner all" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notifications: owner read" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: owner mark read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notifications: owner delete" on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "user_contributions: owner read" on public.user_contributions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 4.6 Community reports.
-- Public: visible, not deleted and NOT EXPIRED. An expired report is never served as current,
-- whether or not expire_reports() has run yet.
create policy "community_reports: public read current" on public.community_reports
  for select to anon, authenticated
  using (deleted_at is null and moderation = 'visible' and expires_at > now());

-- The reporter keeps seeing their own reports (history, pending, expired) until they are purged.
create policy "community_reports: reporter read" on public.community_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Only `deleted_at` is writable by the reporter (column privilege); content changes go through
-- submit_report(). There is no INSERT policy on purpose: inserts happen inside submit_report(),
-- which sets reporter_id = auth.uid() and applies the rate limit, expiry and coarsening.
create policy "community_reports: reporter update" on public.community_reports
  for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

create policy "report_confirmations: voter read" on public.report_confirmations
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "report_votes: voter read" on public.report_votes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 4.7 Deals and events.
-- Public: approved deals that are running right now, at a business the caller can see.
create policy "deals: public read active" on public.deals
  for select to anon, authenticated
  using (
    deleted_at is null
    and moderation = 'visible'
    and starts_at <= now()
    and ends_at > now()
    and exists (select 1 from public.businesses b where b.id = business_id)
  );

create policy "deals: owner read" on public.deals
  for select to authenticated
  using (public.owns_business(business_id));

create policy "deals: owner insert" on public.deals
  for insert to authenticated
  with check (public.owns_business(business_id) and (select public.is_active_user()));

create policy "deals: owner update" on public.deals
  for update to authenticated
  using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

create policy "deals: owner delete" on public.deals
  for delete to authenticated
  using (public.owns_business(business_id));

-- Public: approved events that have not ended.
create policy "events: public read upcoming" on public.events
  for select to anon, authenticated
  using (deleted_at is null and moderation = 'visible' and ends_at > now());

create policy "events: submitter read" on public.events
  for select to authenticated
  using (submitted_by = (select auth.uid()));

create policy "events: submitter insert" on public.events
  for insert to authenticated
  with check (submitted_by = (select auth.uid()) and (select public.is_active_user()));

create policy "events: submitter update" on public.events
  for update to authenticated
  using (submitted_by = (select auth.uid()) and deleted_at is null)
  with check (submitted_by = (select auth.uid()));

create policy "events: submitter delete" on public.events
  for delete to authenticated
  using (submitted_by = (select auth.uid()));

-- 4.8 Business back office.
create policy "subscriptions: owner read" on public.subscriptions
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.owns_business(business_id));

create policy "analytics_events: owner read" on public.analytics_events
  for select to authenticated
  using (public.owns_business(business_id));

-- 4.9 Moderation and suggestions.
create policy "moderation_reports: reporter read" on public.moderation_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy "place_suggestions: author read" on public.place_suggestions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "place_suggestions: author insert" on public.place_suggestions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy "place_suggestions: author withdraw pending" on public.place_suggestions
  for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'pending');

-- ── 5. Realtime ─────────────────────────────────────────────────────────────────────────────
-- Realtime (postgres_changes) evaluates the SELECT policies above for every subscriber, so a
-- client only receives rows it could also read with a query.
--   community_reports → the live feed          notifications → the signed-in user's own inbox
-- An *expiry* produces no database change and therefore no event: clients must drop a report
-- locally when its expires_at passes (the server will not return it again either way).
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime not found (not a Supabase database?): Realtime not configured.';
    return;
  end if;
  foreach t in array array['community_reports', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
