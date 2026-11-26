-- ════════════════════════════════════════════════════════════════════════════════════════════
-- NearMe · 0002 · Tables, constraints and indexes
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Re-runnable (`if not exists` everywhere). Behaviour (triggers, RPCs) is in 0003, access
-- control (grants + RLS) in 0004. Until 0004 has run the tables are NOT protected: always apply
-- the migrations as a set.
--
-- Design notes that apply to many tables
--
--  Coordinates
--    Every spatial table stores plain `lat` / `lon` (double precision) as the source of truth and
--    derives `location geography(Point,4326)` from them as a STORED generated column with a GiST
--    index. Reasons: (1) PostgREST and Realtime serialise geography as hex EWKB, which the
--    frontend cannot read, while lat/lon arrive as numbers; (2) clients can insert a row without
--    building WKT; (3) the two representations can never drift apart.
--
--  Privacy
--    No table stores where a *user* is or has been. The spatial columns hold the position of
--    places, events and community reports. A report that is not tied to a place is snapped to a
--    ~300 m grid before it is written (see submit_report in 0003), reports are hard-deleted
--    shortly after they expire (expire_reports), search_history has no coordinates, and
--    analytics_events has neither a user id nor coordinates. The single user-linked position is
--    the optional, user-chosen, ~1 km-coarsened `user_preferences.alert_lat/lon` used to target
--    "near you" notifications: one overwritable value, never a history.
--
--  Denormalised aggregates
--    businesses.rating_*, reviews.helpful_count, community_reports.*_count,
--    events.interested_count and profiles.points/level/reputation are maintained by triggers.
--    They exist so that list queries, the nearby_* RPCs and Realtime payloads never need a
--    join/aggregate per row, and so that the public can see counts without being able to read
--    *who* voted. Clients have no INSERT/UPDATE privilege on these columns (0004).
--
--  Soft deletion
--    `deleted_at` is used where rows are referenced by moderation history or where an "undo" is
--    plausible (businesses, reviews, community_reports, deals, events). Pure join tables and
--    private per-user rows are hard-deleted.
--
--  is_sample
--    Development seed rows are flagged so the UI can label them and so they can be removed with
--    `select public.purge_sample_data();`. Clients cannot set the flag.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── Accounts ────────────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 60),
  avatar_url    text check (char_length(avatar_url) <= 500),
  -- role/status are changed by administrators only (guard trigger in 0003). `business` is granted
  -- automatically when a user first owns a listing and carries no data access by itself.
  role          public.user_role not null default 'user',
  status        public.account_status not null default 'active',
  home_area     text check (char_length(home_area) <= 80),   -- free-text neighbourhood label, private
  bio           text check (char_length(bio) <= 240),
  -- Contribution score, recomputed from user_contributions (verified rows only).
  points        integer  not null default 0  check (points >= 0),
  level         smallint not null default 0  check (level between 0 and 3),
  reputation    smallint not null default 40 check (reputation between 0 and 100),
  is_sample     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.profiles is
  'One row per auth.users row (created by handle_new_user). Readable by its owner and admins only; other users see public.public_profiles.';

create index if not exists profiles_role_idx on public.profiles (role) where role <> 'user';

create table if not exists public.user_preferences (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  theme                   text not null default 'light' check (theme in ('light', 'dark')),
  travel_mode             public.travel_mode not null default 'bike',
  reduce_motion           boolean not null default false,
  save_search_history     boolean not null default true,
  -- NotificationPrefs
  notifications_enabled   boolean not null default true,
  notify_deal             boolean not null default true,
  notify_saved            boolean not null default true,
  notify_availability     boolean not null default true,
  notify_event            boolean not null default true,
  notify_community        boolean not null default true,
  notify_favorite         boolean not null default true,
  notification_radius_m   integer not null default 2000 check (notification_radius_m between 100 and 50000),
  notification_frequency  public.notification_frequency not null default 'hourly',
  quiet_hours_enabled     boolean not null default true,
  quiet_hours_from        time not null default '22:00',
  quiet_hours_to          time not null default '07:00',
  timezone                text not null default 'Asia/Kolkata',
  push_enabled            boolean not null default false,
  -- Optional centre for "near you" alerts. Snapped to a 0.01° grid (~1.1 km) by trigger; the
  -- precise value the client sends is never stored. NULL = no geo-targeted notifications.
  alert_lat               double precision check (alert_lat between -90 and 90),
  alert_lon               double precision check (alert_lon between -180 and 180),
  alert_location          extensions.geography(Point, 4326)
                          generated always as (extensions.st_setsrid(extensions.st_makepoint(alert_lon, alert_lat), 4326)::extensions.geography) stored,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint user_preferences_alert_pair check ((alert_lat is null) = (alert_lon is null))
);

create index if not exists user_preferences_alert_gix on public.user_preferences using gist (alert_location)
  where alert_location is not null;

-- ── Category taxonomy (mirror of src/data/categories.ts) ────────────────────────────────────

create table if not exists public.category_groups (
  id          text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label       text not null,
  blurb       text not null default '',
  icon        text not null,
  tone        public.ui_tone not null default 'brand',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id          text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  group_id    text not null references public.category_groups (id) on update cascade on delete restrict,
  label       text not null,
  singular    text not null,
  icon        text not null,
  keywords    text[] not null default '{}',             -- lower-case search synonyms
  osm_rules   jsonb  not null default '[]'::jsonb check (jsonb_typeof(osm_rules) = 'array'),
  nameless    boolean not null default false,
  -- AdminConfig.featuredCategoryIds / disabledCategoryIds are these two flags.
  featured    boolean not null default false,
  enabled     boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists categories_group_idx on public.categories (group_id, sort_order);
create index if not exists categories_keywords_gin on public.categories using gin (keywords);

-- ── Admin configuration (exactly one row) ───────────────────────────────────────────────────

create table if not exists public.app_config (
  id                              boolean primary key default true check (id),  -- single-row lock
  -- Minutes a community report stays current, per report_type (AdminConfig.expiryMinutes).
  report_expiry_minutes           jsonb not null default
    '{"queue":20,"wait_time":30,"parking":20,"traffic":20,"road":60,"availability":45,"service":45,"closure":240,"outage":180,"price":720,"event":360}'::jsonb,
  min_confirmations_for_verified  integer not null default 3 check (min_confirmations_for_verified between 1 and 100),
  max_reports_per_hour            integer not null default 6 check (max_reports_per_hour between 1 and 1000),
  -- Not in the frontend's AdminConfig: reviews are rewarded as soon as they are posted, so the
  -- number a person can post per day is capped to make score farming unattractive.
  max_reviews_per_day             integer not null default 20 check (max_reviews_per_day between 1 and 1000),
  disagreements_to_hide           integer not null default 4 check (disagreements_to_hide between 1 and 1000),
  deals_require_approval          boolean not null default false,
  events_require_approval         boolean not null default true,
  -- How long an expired report is kept (for the reporter's own history) before expire_reports()
  -- hard-deletes it. Short on purpose: old reports are a trail of where people were.
  report_retention_hours          integer not null default 24 check (report_retention_hours between 0 and 8760),
  -- What each plan includes (PLANS[..].limits in src/features/business-portal/plans.ts).
  -- Enforced by triggers on deals / business_photos and by business_analytics_daily().
  plan_limits                     jsonb not null default
    '{"free":{"photos":6,"active_offers":1,"promoted_offers":0,"insights_days":30},"plus":{"photos":12,"active_offers":5,"promoted_offers":1,"insights_days":90},"pro":{"photos":24,"active_offers":20,"promoted_offers":5,"insights_days":180}}'::jsonb
    check (jsonb_typeof(plan_limits) = 'object' and plan_limits ?& array['free', 'plus', 'pro']),
  flags                           jsonb not null default '{}'::jsonb check (jsonb_typeof(flags) = 'object'),
  updated_at                      timestamptz not null default now(),
  updated_by                      uuid references public.profiles (id) on delete set null,
  constraint app_config_expiry_shape check (
    jsonb_typeof(report_expiry_minutes) = 'object'
    and report_expiry_minutes ?& array['queue','wait_time','availability','parking','traffic','road','closure','event','price','outage','service']
  )
);

-- The defaults above equal DEFAULT_CONFIG in src/services/backend/localDb.ts, so production
-- works without any seed file.
insert into public.app_config default values on conflict (id) do nothing;

-- ── Businesses ──────────────────────────────────────────────────────────────────────────────

create table if not exists public.businesses (
  id                         uuid primary key default gen_random_uuid(),
  -- OpenStreetMap reference (n123 node, w123 way, r123 relation). NULL for listings that exist
  -- only in NearMe (the frontend addresses those as `l_<id>`). UNIQUE allows many NULLs.
  osm_ref                    text unique check (osm_ref ~ '^[nwr][0-9]{1,19}$'),
  owner_id                   uuid references public.profiles (id) on delete set null,
  name                       text not null check (char_length(btrim(name)) between 1 and 120),
  -- normalize_text(name), stored: search compares and ranks on this column, so the (fairly
  -- expensive) normalisation runs once per write instead of once per row per query.
  search_name                text generated always as (public.normalize_text(name)) stored,
  description                text check (char_length(description) <= 500),
  -- Category and position may be missing only while an owner is still filling in a draft
  -- (the onboarding wizard asks for them in later steps); see businesses_complete_unless_draft.
  category_id                text references public.categories (id) on update cascade on delete restrict,
  lat                        double precision check (lat between -90 and 90),
  lon                        double precision check (lon between -180 and 180),
  location                   extensions.geography(Point, 4326)
                             generated always as (extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography) stored,
  address                    text check (char_length(address) <= 200),
  locality                   text check (char_length(locality) <= 120),
  phone                      text check (char_length(phone) <= 32),
  email                      text check (char_length(email) <= 254),
  website                    text check (char_length(website) <= 200),
  opening_hours              text check (char_length(opening_hours) <= 500),  -- raw OSM syntax, display only
  timezone                   text not null default 'Asia/Kolkata',           -- for business_hours evaluation
  amenities                  text[] not null default '{}' check (cardinality(amenities) <= 40),
  price_level                smallint check (price_level between 1 and 4),
  onboarding_step            smallint check (onboarding_step between 1 and 10),   -- PortalListing.onboardingStep (wizard resume)
  -- Rating aggregate over visible, non-deleted reviews (trigger-maintained). sum + count are
  -- stored and the average is generated, so the three can never disagree.
  rating_count               integer not null default 0 check (rating_count >= 0),
  rating_sum                 integer not null default 0 check (rating_sum >= 0),
  rating_avg                 numeric(3, 2)
                             generated always as (case when rating_count > 0 then round(rating_sum::numeric / rating_count, 2) end) stored,
  verification_status        public.verification_status not null default 'unclaimed',
  verified_at                timestamptz,
  -- Owner-published live status (BusinessListing.availability).
  availability_status        public.availability_status,
  availability_note          text check (char_length(availability_note) <= 200),
  availability_wait_minutes  integer check (availability_wait_minutes between 0 and 1440),
  availability_updated_at    timestamptz,
  moderation                 public.moderation_state not null default 'visible',
  is_sample                  boolean not null default false,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  deleted_at                 timestamptz,
  constraint businesses_coordinate_pair check ((lat is null) = (lon is null)),
  constraint businesses_complete_unless_draft check (
    verification_status = 'draft' or (category_id is not null and lat is not null and lon is not null)
  )
);
comment on table public.businesses is
  'A place NearMe holds data about. Created lazily from OSM (upsert_business_from_osm) or by an owner (osm_ref IS NULL).';
comment on column public.businesses.owner_id is
  'Set by review_business_claim() or at insert for owner-registered listings. All owner checks use public.owns_business().';

create index if not exists businesses_location_gix  on public.businesses using gist (location);
create index if not exists businesses_category_idx  on public.businesses (category_id) where deleted_at is null;
create index if not exists businesses_owner_idx     on public.businesses (owner_id) where owner_id is not null;
create index if not exists businesses_rating_idx    on public.businesses (rating_avg desc nulls last, rating_count desc) where deleted_at is null;
-- Typo-tolerant name search (search_businesses): trigram index over the normalised name.
-- Serves the pg_trgm operators %, %> and LIKE '%…%'.
create index if not exists businesses_name_trgm_gin on public.businesses
  using gin (search_name extensions.gin_trgm_ops) where deleted_at is null;

-- Every category a business belongs to, including the primary one (mirrored by trigger), so
-- category filters are a single indexed semi-join.
create table if not exists public.business_categories (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  category_id  text not null references public.categories (id) on update cascade on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (business_id, category_id)
);
create index if not exists business_categories_category_idx on public.business_categories (category_id, business_id);

-- A request to own a business: either claiming an OSM place or submitting an owner-registered
-- listing for verification. The supporting document lives in the private `verification-docs`
-- bucket; this table (not `businesses`, which is public) carries everything that is private to
-- the request: the contact person, the proof, the admin's note.
--
-- Claiming an OSM place does NOT give the claimant any control over the public business row
-- until an administrator approves the claim. `draft` lets the portal keep what the claimant
-- has prepared in the meantime (hours, services, description …) as an opaque JSON document;
-- after approval the client writes it to the real tables with its new owner rights.
create table if not exists public.business_claims (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  claimant_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status         public.claim_status not null default 'pending',
  contact_name   text check (char_length(contact_name) <= 80),     -- BusinessListing.ownerName
  contact_phone  text check (char_length(contact_phone) <= 32),
  proof_type     text check (proof_type in ('gst', 'shop_licence', 'utility_bill', 'owner_id')),
  message        text check (char_length(message) <= 600),         -- verificationRequest.note
  document_path  text check (char_length(document_path) <= 400),   -- object name in bucket `verification-docs`
  draft          jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) <= 65536),
  review_note    text check (char_length(review_note) <= 600),     -- BusinessListing.verificationNote
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- One open request per claimant per business.
create unique index if not exists business_claims_one_open on public.business_claims (business_id, claimant_id)
  where status in ('pending', 'in_review');
create index if not exists business_claims_claimant_idx on public.business_claims (claimant_id, created_at desc);
create index if not exists business_claims_queue_idx    on public.business_claims (status, created_at)
  where status in ('pending', 'in_review');

-- Structured weekly hours (WeekHours). One interval per day; `closes <= opens` means the
-- interval runs past midnight. Used by is_business_open() for the "open now" filter.
create table if not exists public.business_hours (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  day_of_week  smallint not null check (day_of_week between 1 and 7),  -- ISO: 1 = Monday … 7 = Sunday
  is_closed    boolean not null default false,
  opens        time,
  closes       time,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (business_id, day_of_week),
  constraint business_hours_interval check (is_closed or (opens is not null and closes is not null))
);

create table if not exists public.business_services (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  price        text check (char_length(price) <= 40),
  note         text check (char_length(note) <= 200),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists business_services_business_idx on public.business_services (business_id, sort_order);

create table if not exists public.business_photos (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  storage_path  text not null check (char_length(storage_path) between 3 and 400),  -- object name in bucket `business-photos`
  caption       text check (char_length(caption) <= 140),
  sort_order    integer not null default 0,
  uploaded_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  moderation    public.moderation_state not null default 'visible',
  is_sample     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, storage_path)
);
create index if not exists business_photos_business_idx on public.business_photos (business_id, sort_order);

-- ── Reviews ─────────────────────────────────────────────────────────────────────────────────

create table if not exists public.reviews (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating          smallint not null check (rating between 1 and 5),
  aspects         jsonb not null default '{}'::jsonb check (jsonb_typeof(aspects) = 'object'),  -- {"Service": 4, …}, validated by trigger
  body            text not null check (char_length(btrim(body)) between 12 and 1500),           -- Review.text
  helpful_count   integer not null default 0 check (helpful_count >= 0),
  flag_count      integer not null default 0 check (flag_count >= 0),
  -- Owner reply. Written only through reply_to_review(): clients hold no privilege on these.
  owner_reply     text check (char_length(owner_reply) between 3 and 600),
  owner_reply_at  timestamptz,
  owner_reply_by  uuid references public.profiles (id) on delete set null,
  moderation      public.moderation_state not null default 'visible',
  is_sample       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint reviews_reply_consistent check ((owner_reply is null) = (owner_reply_at is null))
);

-- One live review per user per business. Partial, so a soft-deleted review does not block a new one.
create unique index if not exists reviews_one_per_user_per_business on public.reviews (business_id, user_id) where deleted_at is null;
create index if not exists reviews_business_recent_idx on public.reviews (business_id, created_at desc) where deleted_at is null and moderation = 'visible';
create index if not exists reviews_user_recent_idx     on public.reviews (user_id, created_at desc);
create index if not exists reviews_moderation_idx      on public.reviews (moderation, created_at desc) where moderation <> 'visible';

create table if not exists public.review_photos (
  id            uuid primary key default gen_random_uuid(),
  review_id     uuid not null references public.reviews (id) on delete cascade,
  storage_path  text not null check (char_length(storage_path) between 3 and 400),  -- object name in bucket `review-photos`
  sort_order    smallint not null default 0 check (sort_order between 0 and 3),      -- with the UNIQUE below: at most 4 photos
  created_at    timestamptz not null default now(),
  unique (review_id, sort_order)
);

-- "Helpful" marks. The primary key is the one-vote-per-user-per-review rule.
create table if not exists public.review_votes (
  review_id   uuid not null references public.reviews (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (review_id, user_id)
);
create index if not exists review_votes_user_idx on public.review_votes (user_id);

-- ── Saved places & collections ──────────────────────────────────────────────────────────────

create table if not exists public.saved_places (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  note         text check (char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, business_id)
);
create index if not exists saved_places_business_idx on public.saved_places (business_id);
create index if not exists saved_places_recent_idx   on public.saved_places (user_id, created_at desc);

create table if not exists public.collections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 2 and 40),
  description  text check (char_length(description) <= 120),
  icon         text not null default 'Heart' check (char_length(icon) <= 40),
  tone         public.ui_tone not null default 'brand',
  is_starter   boolean not null default false,   -- created for every user by handle_new_user
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)                           -- target of the composite FK below
);
create unique index if not exists collections_user_name_key on public.collections (user_id, lower(name));

-- The two composite foreign keys encode the product rules declaratively:
--   (collection_id, user_id) → the collection belongs to the same user as the row;
--   (user_id, business_id)   → a place in a collection is always a saved place, and un-saving
--                              it removes it from every collection (ON DELETE CASCADE).
create table if not exists public.collection_places (
  collection_id  uuid not null,
  user_id        uuid not null default auth.uid(),
  business_id    uuid not null,
  sort_order     integer not null default 0,
  added_at       timestamptz not null default now(),
  primary key (collection_id, business_id),
  constraint collection_places_collection_fk foreign key (collection_id, user_id)
    references public.collections (id, user_id) on delete cascade,
  constraint collection_places_saved_fk foreign key (user_id, business_id)
    references public.saved_places (user_id, business_id) on delete cascade
);
create index if not exists collection_places_saved_idx on public.collection_places (user_id, business_id);

-- ── Community intelligence ──────────────────────────────────────────────────────────────────

create table if not exists public.community_reports (
  id                   uuid primary key default gen_random_uuid(),
  type                 public.report_type not null,
  level                public.report_level not null,
  title                text not null check (char_length(btrim(title)) between 3 and 90),
  note                 text check (char_length(note) <= 280),
  value                numeric(10, 2) check (value between 0 and 100000),  -- queue length, minutes, price … depends on type
  business_id          uuid references public.businesses (id) on delete cascade,
  -- Position shown to other people: the business's own position, or a ~300 m grid cell.
  -- Written only by submit_report(); never the reporter's precise position.
  lat                  double precision not null check (lat between -90 and 90),
  lon                  double precision not null check (lon between -180 and 180),
  location             extensions.geography(Point, 4326) not null
                       generated always as (extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography) stored,
  area_label           text not null default '' check (char_length(area_label) <= 120),
  source               public.report_source not null default 'community',
  reporter_id          uuid not null references public.profiles (id) on delete cascade,
  reporter_reputation  smallint not null default 40 check (reporter_reputation between 0 and 100),  -- snapshot at posting time
  -- Vote tallies (trigger-maintained). The public reads these; who voted stays private.
  confirm_count        integer not null default 0 check (confirm_count >= 0),
  dispute_count        integer not null default 0 check (dispute_count >= 0),
  helpful_count        integer not null default 0 check (helpful_count >= 0),
  flag_count           integer not null default 0 check (flag_count >= 0),
  moderation           public.moderation_state not null default 'visible',
  is_sample            boolean not null default false,
  created_at           timestamptz not null default now(),
  -- When the content was last (re)posted. Freshness and confidence are measured from here
  -- (CommunityReport.updatedAt). Deliberately separate from `updated_at`, which also moves when
  -- a vote tally changes and must not make a report look fresh.
  refreshed_at         timestamptz not null default now(),
  expires_at           timestamptz not null,
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint community_reports_expiry_after_refresh check (expires_at > refreshed_at),
  constraint community_reports_refresh_after_create check (refreshed_at >= created_at)
);

create index if not exists community_reports_location_gix  on public.community_reports using gist (location);
create index if not exists community_reports_expires_idx   on public.community_reports (expires_at);
create index if not exists community_reports_business_idx  on public.community_reports (business_id, type, expires_at desc) where business_id is not null;
-- Serves both the per-hour rate limit and the "refresh my existing report" lookup.
create index if not exists community_reports_reporter_idx  on public.community_reports (reporter_id, created_at desc);
create index if not exists community_reports_moderation_idx on public.community_reports (moderation, created_at desc) where moderation <> 'visible';

-- "I can confirm this". Primary key = one confirmation per user per report.
create table if not exists public.report_confirmations (
  report_id   uuid not null references public.community_reports (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index if not exists report_confirmations_user_idx on public.report_confirmations (user_id);

-- Other reactions. Primary key = one vote of each kind per user per report. "confirm" and
-- "disagree" are mutually exclusive; confirm_report()/dispute_report() move the vote.
create table if not exists public.report_votes (
  report_id   uuid not null references public.community_reports (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        public.report_vote_kind not null,
  created_at  timestamptz not null default now(),
  primary key (report_id, user_id, kind)
);
create index if not exists report_votes_user_idx on public.report_votes (user_id);

-- ── Deals & events ──────────────────────────────────────────────────────────────────────────

create table if not exists public.deals (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,  -- position comes from the business
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  title        text not null check (char_length(btrim(title)) between 6 and 70),
  description  text not null check (char_length(btrim(description)) between 12 and 300),
  kind         public.deal_kind not null,
  badge        text not null check (char_length(btrim(badge)) between 2 and 18),
  code         text check (char_length(code) <= 16),
  terms        text check (char_length(terms) <= 200),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  promoted     boolean not null default false,   -- paid placement: only as far as the business's plan allows (trigger)
  moderation   public.moderation_state not null default 'visible',
  is_sample    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint deals_period check (ends_at > starts_at)
);
create index if not exists deals_business_idx on public.deals (business_id, ends_at desc);
create index if not exists deals_active_idx   on public.deals (ends_at, starts_at) where deleted_at is null and moderation = 'visible';

create table if not exists public.saved_deals (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  deal_id     uuid not null references public.deals (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, deal_id)
);
create index if not exists saved_deals_deal_idx on public.saved_deals (deal_id);

create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(btrim(title)) between 4 and 80),
  description       text not null check (char_length(btrim(description)) between 20 and 600),
  kind              public.event_kind not null,
  venue_name        text not null check (char_length(btrim(venue_name)) between 2 and 80),
  business_id       uuid references public.businesses (id) on delete set null,
  lat               double precision not null check (lat between -90 and 90),      -- the venue, not the submitter
  lon               double precision not null check (lon between -180 and 180),
  location          extensions.geography(Point, 4326) not null
                    generated always as (extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography) stored,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  price             text not null default 'Free' check (char_length(price) <= 30),
  organizer_name    text not null default '' check (char_length(organizer_name) <= 80),
  submitted_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  source            public.event_source not null default 'community',
  interested_count  integer not null default 0 check (interested_count >= 0),
  moderation        public.moderation_state not null default 'pending',
  is_sample         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint events_period check (ends_at > starts_at)
);
create index if not exists events_location_gix  on public.events using gist (location);
create index if not exists events_upcoming_idx  on public.events (ends_at, starts_at) where deleted_at is null and moderation = 'visible';
create index if not exists events_submitter_idx on public.events (submitted_by, created_at desc) where submitted_by is not null;
create index if not exists events_business_idx  on public.events (business_id) where business_id is not null;

create table if not exists public.event_interest (
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_interest_user_idx on public.event_interest (user_id);

-- ── Notifications & web push ────────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        public.notification_kind not null,
  title       text not null check (char_length(title) between 1 and 120),
  body        text not null default '' check (char_length(body) <= 500),
  href        text check (char_length(href) <= 300),       -- in-app path, e.g. /place/n123
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,                                  -- NULL = unread
  pushed_at   timestamptz,                                  -- set by the push Edge Function
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_recent_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx      on public.notifications (user_id) where read_at is null;

-- One row per browser/device push endpoint (PushSubscriptionJSON). The keys only let a server
-- holding the VAPID private key send to that endpoint; they are still private to the user.
create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint         text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 2000),
  p256dh           text not null check (char_length(p256dh) between 1 and 512),
  auth_key         text not null check (char_length(auth_key) between 1 and 512),
  user_agent       text check (char_length(user_agent) <= 300),
  expires_at       timestamptz,
  failure_count    integer not null default 0 check (failure_count >= 0),
  last_success_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ── Contributions, levels and badges ────────────────────────────────────────────────────────

create table if not exists public.user_contributions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         public.contribution_kind not null,
  title        text not null check (char_length(title) between 1 and 200),
  points       integer not null check (points >= 0),
  status       public.contribution_status not null default 'pending',  -- only 'verified' rows earn points
  ref_id       text check (char_length(ref_id) <= 120),               -- id of the review / report / suggestion …
  business_id  uuid references public.businesses (id) on delete set null,
  -- Identity of the rewarded *action* (not of the row that happened to record it), e.g.
  -- 'review:<business_id>', 'report:<report_id>', 'confirm:<report_id>'. With the UNIQUE below,
  -- deleting and re-posting a review, or withdrawing and repeating a confirmation, can never be
  -- rewarded twice.
  dedupe_key   text not null check (char_length(dedupe_key) between 1 and 200),
  is_sample    boolean not null default false,
  verified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint user_contributions_dedupe unique (user_id, dedupe_key)
);
create index if not exists user_contributions_user_recent_idx on public.user_contributions (user_id, created_at desc);
create index if not exists user_contributions_ref_idx         on public.user_contributions (kind, ref_id) where ref_id is not null;

create table if not exists public.badges (
  id           text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null,
  description  text not null,
  icon         text not null,
  -- Rule: either "at least min_count non-rejected contributions of these kinds" …
  kinds        public.contribution_kind[],
  min_count    integer check (min_count > 0),
  -- … or "reached level min_level" (0 Explorer … 3 Community Hero).
  min_level    smallint check (min_level between 0 and 3),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint badges_one_rule check (
    (kinds is not null and cardinality(kinds) > 0 and min_count is not null and min_level is null)
    or (kinds is null and min_count is null and min_level is not null)
  )
);

create table if not exists public.user_badges (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  badge_id   text not null references public.badges (id) on update cascade on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- ── Billing ─────────────────────────────────────────────────────────────────────────────────

-- Written only by the payment webhook (service role). ON DELETE RESTRICT on business_id is
-- intentional: billing history must be dealt with before a business row is hard-deleted
-- (normal removal is a soft delete, which is unaffected).
create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses (id) on delete restrict,
  owner_id              uuid references public.profiles (id) on delete set null,
  plan                  public.plan_id not null default 'free',
  status                public.subscription_status not null default 'active',
  current_period_start  timestamptz not null default now(),
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  provider              text check (char_length(provider) <= 40),        -- 'razorpay', 'stripe', …
  provider_ref          text check (char_length(provider_ref) <= 200),   -- provider's subscription id
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint subscriptions_period check (current_period_end is null or current_period_end > current_period_start)
);
-- At most one live subscription per business.
create unique index if not exists subscriptions_one_live_per_business on public.subscriptions (business_id)
  where status in ('trialing', 'active', 'past_due');
create unique index if not exists subscriptions_provider_ref_key on public.subscriptions (provider, provider_ref)
  where provider_ref is not null;
create index if not exists subscriptions_owner_idx on public.subscriptions (owner_id) where owner_id is not null;

-- ── Moderation queue ────────────────────────────────────────────────────────────────────────

create table if not exists public.moderation_reports (
  id            uuid primary key default gen_random_uuid(),
  target_type   public.moderation_target not null,
  target_id     text not null check (char_length(target_id) between 1 and 80),  -- uuid, or an OSM ref for 'place'
  target_label  text not null default '' check (char_length(target_label) <= 200),
  reason        text not null check (char_length(btrim(reason)) between 1 and 120),
  note          text check (char_length(note) <= 500),
  reporter_id   uuid references public.profiles (id) on delete set null,
  -- Raised automatically (e.g. a report many people disputed). A separate flag rather than
  -- "reporter_id IS NULL", because reporter_id also becomes NULL when a user is deleted.
  is_system     boolean not null default false,
  status        public.moderation_status not null default 'open',
  resolution    text check (char_length(resolution) <= 500),
  resolved_by   uuid references public.profiles (id) on delete set null,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint moderation_reports_system_has_no_reporter check (not is_system or reporter_id is null)
);
-- One open flag per person per item, and one open automatic flag per item.
create unique index if not exists moderation_reports_one_open_per_user on public.moderation_reports (target_type, target_id, reporter_id)
  where status = 'open' and reporter_id is not null;
create unique index if not exists moderation_reports_one_open_system on public.moderation_reports (target_type, target_id)
  where status = 'open' and is_system;
create index if not exists moderation_reports_queue_idx    on public.moderation_reports (status, created_at desc);
create index if not exists moderation_reports_target_idx   on public.moderation_reports (target_type, target_id);
create index if not exists moderation_reports_reporter_idx on public.moderation_reports (reporter_id) where reporter_id is not null;

-- ── Search history (private; no coordinates on purpose) ─────────────────────────────────────

create table if not exists public.search_history (
  id                bigint generated always as identity primary key,
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  query             text not null check (char_length(btrim(query)) between 1 and 120),
  normalized_query  text generated always as (public.normalize_text(query)) stored,
  category_ids      text[] not null default '{}',
  result_count      integer check (result_count >= 0),
  created_at        timestamptz not null default now()
);
create index if not exists search_history_user_recent_idx on public.search_history (user_id, created_at desc);
create index if not exists search_history_trending_idx    on public.search_history (created_at desc, normalized_query);

-- ── Map corrections suggested by users ──────────────────────────────────────────────────────

create table if not exists public.place_suggestions (
  id           uuid primary key default gen_random_uuid(),
  kind         public.suggestion_kind not null,
  business_id  uuid references public.businesses (id) on delete set null,
  osm_ref      text check (osm_ref ~ '^[nwr][0-9]{1,19}$'),
  name         text not null check (char_length(btrim(name)) between 2 and 80),
  category_id  text references public.categories (id) on update cascade on delete set null,
  lat          double precision check (lat between -90 and 90),      -- where the place is, not where the user is
  lon          double precision check (lon between -180 and 180),
  location     extensions.geography(Point, 4326)
               generated always as (extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography) stored,
  details      text not null check (char_length(btrim(details)) between 10 and 600),
  photo_paths  text[] not null default '{}' check (cardinality(photo_paths) <= 4),
  user_id      uuid default auth.uid() references public.profiles (id) on delete set null,
  status       public.suggestion_status not null default 'pending',
  review_note  text check (char_length(review_note) <= 600),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  is_sample    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint place_suggestions_coordinate_pair check ((lat is null) = (lon is null))
);
-- "The same person reporting the same thing about the same place twice is one contribution"
-- (contributeService.submit): at most one pending suggestion per user, kind and place.
create unique index if not exists place_suggestions_one_pending_per_osm_ref on public.place_suggestions (user_id, kind, osm_ref)
  where status = 'pending' and osm_ref is not null;
create unique index if not exists place_suggestions_one_pending_per_business on public.place_suggestions (user_id, kind, business_id)
  where status = 'pending' and business_id is not null and osm_ref is null;
create unique index if not exists place_suggestions_one_pending_per_name on public.place_suggestions (user_id, kind, lower(name))
  where status = 'pending' and business_id is null and osm_ref is null;
create index if not exists place_suggestions_queue_idx on public.place_suggestions (status, created_at) where status = 'pending';
create index if not exists place_suggestions_user_idx  on public.place_suggestions (user_id, created_at desc) where user_id is not null;

-- ── Business analytics (anonymous by construction: no user id, no coordinates) ──────────────

create table if not exists public.analytics_events (
  id           bigint generated always as identity primary key,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  kind         public.analytics_kind not null,
  occurred_at  timestamptz not null default now()
);
create index if not exists analytics_events_business_time_idx on public.analytics_events (business_id, occurred_at desc);
create index if not exists analytics_events_time_brin         on public.analytics_events using brin (occurred_at);

-- ── Foreign-key support indexes ─────────────────────────────────────────────────────────────
-- "Who did this" columns (ON DELETE SET NULL) and two optional business references. Without an
-- index, deleting an account or a business would scan each of these tables. Partial, because
-- the columns are NULL on most rows.
create index if not exists reviews_owner_reply_by_idx        on public.reviews (owner_reply_by) where owner_reply_by is not null;
create index if not exists deals_created_by_idx              on public.deals (created_by) where created_by is not null;
create index if not exists business_photos_uploaded_by_idx   on public.business_photos (uploaded_by) where uploaded_by is not null;
create index if not exists business_claims_reviewed_by_idx   on public.business_claims (reviewed_by) where reviewed_by is not null;
create index if not exists moderation_reports_resolved_by_idx on public.moderation_reports (resolved_by) where resolved_by is not null;
create index if not exists place_suggestions_reviewed_by_idx on public.place_suggestions (reviewed_by) where reviewed_by is not null;
create index if not exists place_suggestions_business_idx    on public.place_suggestions (business_id) where business_id is not null;
create index if not exists user_contributions_business_idx   on public.user_contributions (business_id) where business_id is not null;
create index if not exists user_badges_badge_idx             on public.user_badges (badge_id);
