-- ════════════════════════════════════════════════════════════════════════════════════════════
-- NearMe · 0003 · Functions, triggers, RPCs and the public_profiles view
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Re-runnable (`create or replace` for functions, views and triggers).
--
-- Rules followed by every function in this file
--   • `set search_path = ''` and fully qualified names (public.*, extensions.*, auth.*), so no
--     object can be shadowed through the caller's search_path.
--   • SECURITY DEFINER is used only where a function must do something its caller cannot
--     (write tallies, cross-user bookkeeping, privileged workflows). Each such RPC re-checks
--     `auth.uid()` itself and never trusts an id passed by the client for "who am I".
--   • Read RPCs (nearby_*, search_*, business_reviews) are SECURITY INVOKER: Row Level Security
--     stays the single source of truth for what a caller may see.
--   • Who may EXECUTE what is decided in 0004 (default: nobody but the service role).
--
-- Error codes raised by the RPCs (PostgREST returns them as `error.code`)
--   28000  not signed in                    42501  not allowed (not owner / not admin / suspended)
--   22023  invalid argument                 P0002  target does not exist or is not visible
--   NM409  not allowed in the current state (own report, expired report, already decided …)
--   NM429  rate limit reached (max_reports_per_hour, max_reviews_per_day)
--   NM402  plan limit reached (offers, promoted offers, photos)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Generic helpers ──────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_preferences', 'category_groups', 'categories', 'app_config', 'businesses',
    'business_claims', 'business_hours', 'business_services', 'business_photos', 'reviews',
    'saved_places', 'collections', 'community_reports', 'deals', 'events', 'push_subscriptions',
    'user_contributions', 'badges', 'subscriptions', 'moderation_reports', 'place_suggestions'
  ]
  loop
    execute format(
      'create or replace trigger trg_%1$s_set_updated_at before update on public.%1$I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end
$$;

-- True when the statement comes straight from an API client (PostgREST switches to the `anon`
-- or `authenticated` role). False for the service role, the dashboard/CLI (`postgres`) and for
-- statements issued from inside a SECURITY DEFINER function, where current_user is the function
-- owner. Guard triggers use this to tell "a user is trying to write this column" apart from
-- "one of our own trusted functions is maintaining it". Must stay SECURITY INVOKER.
create or replace function public.is_client_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated')
$$;

-- ── 2. Identity helpers used by RLS policies ────────────────────────────────────────────────
-- SECURITY DEFINER so they can read `profiles` / `businesses` regardless of the caller's RLS
-- (and so policies on those tables do not recurse). They take no user id argument: the subject
-- is always auth.uid(), i.e. the verified `sub` of the JWT. No JWT role / metadata claim is used.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  )
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
  )
$$;

create or replace function public.owns_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = p_business_id
      and b.owner_id = (select auth.uid())
      and b.deleted_at is null
  )
$$;

-- ── 3. New accounts ─────────────────────────────────────────────────────────────────────────

-- auth.users → profiles + user_preferences + the five starter collections.
-- raw_user_meta_data is supplied by the client at sign-up, so it is used for the display name
-- only; role and status always start at their column defaults.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'Explorer'
    ),
    60
  );

  insert into public.profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  -- Same starters as STARTERS in src/services/saved.ts. created_at is staggered so the order
  -- is stable when sorted by creation time.
  insert into public.collections (user_id, name, description, icon, tone, is_starter, created_at, updated_at)
  select new.id, s.name, s.description, s.icon, s.tone::public.ui_tone, true,
         now() + make_interval(secs => s.ord * 0.001), now() + make_interval(secs => s.ord * 0.001)
  from (values
    (1, 'Favorite Restaurants', 'The places you keep going back to',     'UtensilsCrossed', 'brand'),
    (2, 'Weekend Places',       'For slow Saturdays and Sundays',        'Sun',             'butter'),
    (3, 'Places to Visit',      'On the list, not yet ticked off',       'MapPinned',       'sage'),
    (4, 'Emergency Services',   'Hospitals, pharmacies and help nearby', 'Siren',           'danger'),
    (5, 'My Neighborhood',      'Everyday spots close to home',          'House',           'clay')
  ) as s (ord, name, description, icon, tone)
  on conflict do nothing;

  return new;
end
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 4. Column guards ────────────────────────────────────────────────────────────────────────

-- Generic "only an administrator may change these columns" guard. The protected column names
-- are the trigger arguments. API clients hold UPDATE privilege on these columns (admins are
-- ordinary `authenticated` sessions, so the privilege cannot be withheld from them alone); this
-- trigger is what stops everybody else. Trusted contexts (service role, definer functions) pass.
create or replace function public.guard_admin_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_col text;
begin
  if not public.is_client_request() or public.is_admin() then
    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  foreach v_col in array tg_argv loop
    if (v_old -> v_col) is distinct from (v_new -> v_col) then
      raise exception 'Only an administrator can change "%" on %.', v_col, tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end
$$;

-- profiles.role / profiles.status cannot be self-escalated.
create or replace trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function public.guard_admin_columns('role', 'status');

create or replace trigger trg_businesses_guard
  before update on public.businesses
  for each row execute function public.guard_admin_columns('owner_id', 'osm_ref', 'verification_status', 'verified_at', 'moderation');

create or replace trigger trg_reviews_guard
  before update on public.reviews
  for each row execute function public.guard_admin_columns('moderation');

create or replace trigger trg_community_reports_guard
  before update on public.community_reports
  for each row execute function public.guard_admin_columns('moderation');

create or replace trigger trg_business_photos_guard
  before update on public.business_photos
  for each row execute function public.guard_admin_columns('moderation');

-- A claimant may edit their own open request (policy in 0004) but not the decision fields.
create or replace trigger trg_business_claims_guard
  before update on public.business_claims
  for each row execute function public.guard_admin_columns('status', 'review_note', 'reviewed_by', 'reviewed_at', 'business_id', 'claimant_id');

-- Deals and events: moderation state is decided by the server.
--   INSERT by a client  → 'pending' or 'visible' according to app_config.<flag> (TG_ARGV[0]).
--   UPDATE by a client  → may not touch `moderation`; and if approval is required, editing the
--                         content of an approved row sends it back to 'pending' (no
--                         bait-and-switch after approval).
create or replace function public.gate_content_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_requires boolean;
  v_ignore   text[] := array['updated_at', 'deleted_at', 'moderation', 'promoted', 'interested_count'];
begin
  if not public.is_client_request() or public.is_admin() then
    return new;
  end if;

  execute format('select c.%I from public.app_config c limit 1', tg_argv[0]) into v_requires;
  v_requires := coalesce(v_requires, true);   -- no config row: fail closed

  if tg_op = 'INSERT' then
    new.moderation := case when v_requires then 'pending' else 'visible' end;
    return new;
  end if;

  if new.moderation is distinct from old.moderation then
    raise exception 'Only an administrator can change "moderation" on %.', tg_table_name
      using errcode = '42501';
  end if;
  if v_requires and old.moderation = 'visible' and (to_jsonb(new) - v_ignore) is distinct from (to_jsonb(old) - v_ignore) then
    new.moderation := 'pending';
  end if;
  return new;
end
$$;

create or replace trigger trg_deals_gate
  before insert or update on public.deals
  for each row execute function public.gate_content_moderation('deals_require_approval');

create or replace trigger trg_events_gate
  before insert or update on public.events
  for each row execute function public.gate_content_moderation('events_require_approval');

-- ── 5. Notifications (internal) ─────────────────────────────────────────────────────────────

-- Insert a notification unless the user opted out (mirrors notificationsService.push()).
-- Not executable by API clients: notifications are created by triggers, RPCs and the service role.
create or replace function public.notify_user(
  p_user_id uuid,
  p_kind    public.notification_kind,
  p_title   text,
  p_body    text default '',
  p_href    text default null,
  p_data    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pref public.user_preferences;
  v_id   uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  select * into v_pref from public.user_preferences up where up.user_id = p_user_id;
  if found then
    if not v_pref.notifications_enabled then
      return null;
    end if;
    if (p_kind = 'deal' and not v_pref.notify_deal)
       or (p_kind = 'saved' and not v_pref.notify_saved)
       or (p_kind = 'availability' and not v_pref.notify_availability)
       or (p_kind = 'event' and not v_pref.notify_event)
       or (p_kind = 'community' and not v_pref.notify_community)
       or (p_kind = 'favorite' and not v_pref.notify_favorite) then
      return null;
    end if;
  end if;

  insert into public.notifications (user_id, kind, title, body, href, data)
  values (p_user_id, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 500), left(p_href, 300), coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
exception
  when foreign_key_violation then
    return null;   -- the account disappeared in the meantime
end
$$;

-- ── 6. Contribution points, levels and badges ───────────────────────────────────────────────

-- POINTS in src/lib/community.ts.
create or replace function public.contribution_points(p_kind public.contribution_kind)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_kind
    when 'review'   then 10
    when 'report'   then 5
    when 'confirm'  then 2
    when 'photo'    then 5
    when 'place'    then 15
    when 'edit'     then 8
    when 'event'    then 8
    when 'closed'   then 6
    when 'category' then 4
    when 'missing'  then 6
  end
$$;

-- LEVELS in src/lib/community.ts: Explorer 0, Local Scout 50, Neighborhood Expert 200, Community Hero 600.
create or replace function public.level_for_points(p_points integer)
returns smallint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (case
    when p_points >= 600 then 3
    when p_points >= 200 then 2
    when p_points >= 50  then 1
    else 0
  end)::smallint
$$;

create or replace function public.level_name(p_level integer)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_level
    when 3 then 'Community Hero'
    when 2 then 'Neighborhood Expert'
    when 1 then 'Local Scout'
    else 'Explorer'
  end
$$;

-- Recompute points / level / reputation for one user from user_contributions, then award any
-- badge whose rule is now met (badges are never taken away).
--   points      = Σ points of VERIFIED contributions only (pending and rejected earn nothing)
--   reputation  = clamp(40 + 3·verified − 12·rejected, 5, 100)       (summarise() in contributions.ts)
--   badge count = non-rejected contributions of the badge's kinds    (same as the local summary)
-- These are stored on profiles (denormalised) because they are read on every review / report
-- card, while contributions change rarely.
create or replace function public.recompute_user_score(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_points   integer;
  v_verified integer;
  v_rejected integer;
begin
  -- Lock first, aggregate second: under READ COMMITTED the aggregate below then sees every
  -- contribution committed by a concurrent transaction that held this lock before us.
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not found then
    return;   -- the profile is being deleted (cascade); nothing to maintain
  end if;

  select coalesce(sum(c.points) filter (where c.status = 'verified'), 0)::integer,
         (count(*) filter (where c.status = 'verified'))::integer,
         (count(*) filter (where c.status = 'rejected'))::integer
    into v_points, v_verified, v_rejected
  from public.user_contributions c
  where c.user_id = p_user_id;

  update public.profiles p
  set points     = v_points,
      level      = public.level_for_points(v_points),
      reputation = greatest(5, least(100, 40 + v_verified * 3 - v_rejected * 12))::smallint
  where p.id = p_user_id
    and (p.points, p.level, p.reputation)
        is distinct from (v_points, public.level_for_points(v_points), greatest(5, least(100, 40 + v_verified * 3 - v_rejected * 12))::smallint);

  insert into public.user_badges (user_id, badge_id)
  select p.id, b.id
  from public.profiles p
  cross join public.badges b
  where p.id = p_user_id
    and (
      (b.min_level is not null and p.level >= b.min_level)
      or (b.kinds is not null and (
            select count(*)
            from public.user_contributions c
            where c.user_id = p.id and c.status <> 'rejected' and c.kind = any (b.kinds)
          ) >= b.min_count)
    )
  on conflict do nothing;
end
$$;

create or replace function public.user_contributions_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_user_score(old.user_id);
    return null;
  end if;
  perform public.recompute_user_score(new.user_id);
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform public.recompute_user_score(old.user_id);
  end if;
  return null;
end
$$;

create or replace trigger trg_user_contributions_score
  after insert or delete or update of status, points, kind, user_id on public.user_contributions
  for each row execute function public.user_contributions_after_change();

-- Create / update / remove the contribution that rewards one action.
--   p_status NULL     → remove it (the user took the action back)
--   p_create = false  → only update an existing row
-- The (user_id, dedupe_key) unique constraint makes this idempotent: the same action can be
-- recorded any number of times and is rewarded once.
create or replace function public.sync_contribution(
  p_user_id     uuid,
  p_kind        public.contribution_kind,
  p_dedupe_key  text,
  p_status      public.contribution_status,
  p_title       text default null,
  p_ref_id      text default null,
  p_business_id uuid default null,
  p_create      boolean default true,
  p_is_sample   boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_dedupe_key is null then
    return;
  end if;

  if p_status is null then
    delete from public.user_contributions c
    where c.user_id = p_user_id and c.dedupe_key = p_dedupe_key;
    return;
  end if;

  if p_create then
    insert into public.user_contributions as c
      (user_id, kind, title, points, status, ref_id, business_id, dedupe_key, is_sample, verified_at)
    values (
      p_user_id, p_kind,
      left(coalesce(nullif(btrim(p_title), ''), initcap(p_kind::text)), 200),
      public.contribution_points(p_kind), p_status, p_ref_id, p_business_id, p_dedupe_key,
      coalesce(p_is_sample, false),
      case when p_status = 'verified' then now() end
    )
    on conflict (user_id, dedupe_key) do update
      set status      = excluded.status,
          ref_id      = coalesce(excluded.ref_id, c.ref_id),
          verified_at = case when excluded.status = 'verified' then coalesce(c.verified_at, now()) end
      where c.status is distinct from excluded.status
         or c.ref_id is distinct from coalesce(excluded.ref_id, c.ref_id);
  else
    update public.user_contributions c
    set status      = p_status,
        verified_at = case when p_status = 'verified' then coalesce(c.verified_at, now()) end
    where c.user_id = p_user_id
      and c.dedupe_key = p_dedupe_key
      and c.status is distinct from p_status;
  end if;
end
$$;

-- ── 7. Businesses ───────────────────────────────────────────────────────────────────────────

create or replace function public.businesses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
    begin
      perform now() at time zone new.timezone;
    exception when others then
      raise exception 'Unknown time zone "%".', new.timezone using errcode = '22023';
    end;
  end if;

  if tg_op = 'INSERT' then
    -- A listing registered by a signed-in user always belongs to that user and starts as a
    -- draft, whatever the request said (clients hold no INSERT privilege on these columns
    -- anyway; this also covers an admin using the same API).
    if public.is_client_request() then
      new.owner_id := auth.uid();
      new.verification_status := 'draft';
    end if;
    if new.verification_status = 'verified' and new.verified_at is null then
      new.verified_at := now();
    end if;
    if new.availability_status is not null and new.availability_updated_at is null then
      new.availability_updated_at := now();
    end if;
    return new;
  end if;

  -- Owner removed (account deleted → ON DELETE SET NULL, or an admin released the listing).
  if old.owner_id is not null and new.owner_id is null then
    -- (an unfinished draft has no category/position yet and may only carry the 'draft' status)
    new.verification_status := case when new.category_id is null or new.lat is null then 'draft' else 'unclaimed' end;
    if new.osm_ref is null then
      new.deleted_at := coalesce(new.deleted_at, now());   -- a NearMe-only listing has no reason to exist without its owner
    end if;
  end if;

  if new.verification_status is distinct from old.verification_status then
    new.verified_at := case when new.verification_status = 'verified' then now() end;
  end if;

  if (new.availability_status, new.availability_note, new.availability_wait_minutes)
     is distinct from (old.availability_status, old.availability_note, old.availability_wait_minutes) then
    new.availability_updated_at := now();
  end if;
  return new;
end
$$;

-- Named so that it fires after trg_businesses_guard (BEFORE triggers run in name order).
create or replace trigger trg_businesses_prepare
  before insert or update on public.businesses
  for each row execute function public.businesses_before_write();

create or replace function public.businesses_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Keep the primary category present in business_categories.
  if new.category_id is not null and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id) then
    insert into public.business_categories (business_id, category_id)
    values (new.id, new.category_id)
    on conflict do nothing;
  end if;

  -- First listing owned → the account becomes a 'business' account. This is a UI hint only
  -- (it opens the business portal); no policy grants anything to the 'business' role, every
  -- owner check goes through owns_business(). 'admin' is never touched.
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    update public.profiles p set role = 'business' where p.id = new.owner_id and p.role = 'user';
  end if;
  return null;
end
$$;

create or replace trigger trg_businesses_after_write
  after insert or update of category_id, owner_id on public.businesses
  for each row execute function public.businesses_after_write();

-- Create the row for an OpenStreetMap place the first time someone reviews, saves, claims or
-- reports on it, and return its id. Idempotent.
--
-- The first caller's name / category / position are stored and later calls never overwrite
-- them: the database cannot verify client-supplied OSM data, so "first write wins, admins and
-- the service role can correct" is the least abusable rule (no signed-in user can rename or
-- move an existing place). The UI keeps rendering OSM's own name and position for OSM places;
-- the stored copy is used by search_businesses / nearby_businesses and by owners after a claim.
-- A scheduled server-side job (service role) should reconcile unclaimed rows against OSM.
create or replace function public.upsert_business_from_osm(
  p_osm_ref     text,
  p_name        text,
  p_category_id text,
  p_lat         double precision,
  p_lon         double precision
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if not public.is_active_user() then
    raise exception 'This account cannot add places.' using errcode = '42501';
  end if;
  if p_osm_ref is null or p_osm_ref !~ '^[nwr][0-9]{1,19}$' then
    raise exception 'Invalid OpenStreetMap reference "%".', p_osm_ref using errcode = '22023';
  end if;

  select b.id into v_id from public.businesses b where b.osm_ref = p_osm_ref;
  if found then
    return v_id;
  end if;

  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'Invalid coordinates.' using errcode = '22023';
  end if;

  select coalesce(nullif(left(btrim(coalesce(p_name, '')), 120), ''), c.singular)
    into v_name
  from public.categories c
  where c.id = p_category_id;
  if not found then
    raise exception 'Unknown category "%".', p_category_id using errcode = '22023';
  end if;

  insert into public.businesses (osm_ref, name, category_id, lat, lon, owner_id, verification_status)
  values (p_osm_ref, v_name, p_category_id, p_lat, p_lon, null, 'unclaimed')
  on conflict (osm_ref) do nothing
  returning id into v_id;

  if v_id is null then   -- lost a race with a concurrent call for the same place
    select b.id into v_id from public.businesses b where b.osm_ref = p_osm_ref;
  end if;
  return v_id;
end
$$;

-- Is the business open at p_at according to its structured hours?
--   true / false  when business_hours rows exist (or the raw OSM value is exactly "24/7")
--   NULL          when hours are unknown — callers treat unknown as "not shown as open"
create or replace function public.is_business_open(p_business_id uuid, p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.business_hours h where h.business_id = b.id)
      then case when btrim(coalesce(b.opening_hours, '')) = '24/7' then true end
    else exists (
      select 1
      from public.business_hours h
      cross join lateral (select p_at at time zone b.timezone as ts) l
      where h.business_id = b.id
        and not h.is_closed
        and (
          -- today's interval (the part before midnight when it runs overnight)
          (h.day_of_week = extract(isodow from l.ts)::integer
            and ((h.closes > h.opens and l.ts::time >= h.opens and l.ts::time < h.closes)
              or (h.closes <= h.opens and l.ts::time >= h.opens)))
          -- the after-midnight tail of yesterday's overnight interval
          or (h.day_of_week = extract(isodow from l.ts - interval '1 day')::integer
            and h.closes <= h.opens and l.ts::time < h.closes)
        )
    )
  end
  from public.businesses b
  where b.id = p_business_id
$$;

-- ── 8. Claims, verification and plans ───────────────────────────────────────────────────────

create or replace function public.business_claims_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
begin
  select * into v_business from public.businesses b where b.id = new.business_id and b.deleted_at is null;
  if not found then
    raise exception 'That business does not exist.' using errcode = 'P0002';
  end if;
  if v_business.owner_id is not null and v_business.owner_id <> new.claimant_id then
    raise exception 'This place has already been claimed by another account.' using errcode = 'NM409';
  end if;

  -- An owner sending their own listing for verification.
  if v_business.owner_id = new.claimant_id then
    if v_business.verification_status = 'verified' then
      raise exception 'This listing is already verified.' using errcode = 'NM409';
    end if;
    if v_business.category_id is null or v_business.lat is null then
      raise exception 'Choose a category and a location before you submit the listing.' using errcode = 'NM409';
    end if;
  end if;
  return new;
end
$$;

create or replace trigger trg_business_claims_before_insert
  before insert on public.business_claims
  for each row execute function public.business_claims_before_insert();

-- Keep businesses.verification_status in step with the owner's own verification request:
--   request created            draft / rejected → submitted
--   admin picks it up          submitted → in_review
--   owner withdraws (DELETE)   submitted / in_review → draft, when no other open request is left
-- (A claim on somebody else's / nobody's business never touches the business row; only an
-- approval does, in review_business_claim.)
create or replace function public.business_claims_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.businesses b
    set verification_status = 'submitted'
    where b.id = new.business_id
      and b.owner_id = new.claimant_id
      and b.verification_status in ('draft', 'rejected');
  elsif tg_op = 'UPDATE' then
    if new.status = 'in_review' and old.status = 'pending' then
      update public.businesses b
      set verification_status = 'in_review'
      where b.id = new.business_id
        and b.owner_id = new.claimant_id
        and b.verification_status = 'submitted';
    end if;
  elsif old.status in ('pending', 'in_review') then
    update public.businesses b
    set verification_status = 'draft'
    where b.id = old.business_id
      and b.owner_id = old.claimant_id
      and b.verification_status in ('submitted', 'in_review')
      and not exists (
        select 1 from public.business_claims c
        where c.business_id = old.business_id and c.claimant_id = old.claimant_id and c.status in ('pending', 'in_review')
      );
  end if;
  return null;
end
$$;

create or replace trigger trg_business_claims_after_change
  after insert or delete or update of status on public.business_claims
  for each row execute function public.business_claims_after_change();

-- Admin decision on a claim / verification request.
--   'in_review'  the request is being looked at (no ownership change)
--   'approved'   the claimant becomes the owner and the business is verified; competing open
--                requests for the same business are closed
--   'rejected'   needs a note (it is what the owner reads); an owner-registered listing goes
--                back to 'rejected' and stays private
create or replace function public.review_business_claim(
  p_claim_id uuid,
  p_decision public.claim_status,
  p_note     text default null
)
returns public.business_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim    public.business_claims;
  v_business public.businesses;
  v_note     text := left(nullif(btrim(coalesce(p_note, '')), ''), 600);
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Only an administrator can review claims.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision = 'pending' then
    raise exception 'Decision must be in_review, approved or rejected.' using errcode = '22023';
  end if;

  select * into v_claim from public.business_claims c where c.id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found.' using errcode = 'P0002';
  end if;
  if v_claim.status not in ('pending', 'in_review') then
    raise exception 'This claim has already been %.', v_claim.status using errcode = 'NM409';
  end if;

  select * into v_business from public.businesses b where b.id = v_claim.business_id for update;

  if p_decision = 'in_review' then
    update public.business_claims c
    set status = 'in_review', reviewed_by = auth.uid()
    where c.id = v_claim.id
    returning * into v_claim;
    return v_claim;
  end if;

  if p_decision = 'approved' then
    if v_business.owner_id is not null and v_business.owner_id <> v_claim.claimant_id then
      raise exception 'This business is already managed by someone else.' using errcode = 'NM409';
    end if;
    if v_business.category_id is null or v_business.lat is null then
      raise exception 'The listing has no category or location yet and cannot be verified.' using errcode = 'NM409';
    end if;

    update public.businesses b
    set owner_id = v_claim.claimant_id,
        verification_status = 'verified'
    where b.id = v_claim.business_id;

    update public.business_claims c
    set status = 'rejected', review_note = 'Another claim for this business was approved.',
        reviewed_by = auth.uid(), reviewed_at = now()
    where c.business_id = v_claim.business_id and c.id <> v_claim.id and c.status in ('pending', 'in_review');
  else
    if v_note is null then
      raise exception 'A rejection needs a note for the owner.' using errcode = '22023';
    end if;
    update public.businesses b
    set verification_status = 'rejected'
    where b.id = v_claim.business_id
      and b.owner_id = v_claim.claimant_id
      and b.verification_status in ('submitted', 'in_review');
  end if;

  update public.business_claims c
  set status      = p_decision,
      review_note = v_note,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where c.id = v_claim.id
  returning * into v_claim;

  perform public.notify_user(
    v_claim.claimant_id, 'system',
    case when p_decision = 'approved' then 'Business verified' else 'Verification was not approved' end,
    case when p_decision = 'approved'
      then v_business.name || ' is now a verified business on NearMe.'
      else v_business.name || ': ' || v_note
    end,
    '/business'
  );
  return v_claim;
end
$$;

-- The plan a business is on: its live subscription, otherwise 'free'.
-- Answers only for the owner and for admins (NULL for anyone else): the plan is private.
create or replace function public.business_plan(p_business_id uuid)
returns public.plan_id
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.owns_business(p_business_id) or public.is_admin() then
      coalesce(
        (select s.plan
         from public.subscriptions s
         where s.business_id = p_business_id
           and s.status in ('trialing', 'active', 'past_due')
           and (s.current_period_end is null or s.current_period_end > now())
         limit 1),
        'free'::public.plan_id)
  end
$$;

-- One limit ('photos' | 'active_offers' | 'promoted_offers' | 'insights_days') of the business's
-- plan, from app_config.plan_limits. For callers who are not the owner it answers with the free
-- plan's value, which is public configuration anyway.
create or replace function public.business_plan_limit(p_business_id uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (c.plan_limits -> coalesce(public.business_plan(p_business_id), 'free')::text ->> p_key)::integer
  from public.app_config c
  limit 1
$$;

-- Plan limits on offers: how many may be live or scheduled at once, and how many of those
-- promoted. Ending, deleting or editing an offer is never blocked. Error code NM402.
create or replace function public.deals_enforce_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max          integer;
  v_max_promoted integer;
  v_active       integer;
  v_promoted     integer;
begin
  if not public.is_client_request() or public.is_admin() then
    return new;
  end if;
  if new.deleted_at is not null or new.ends_at <= now() then
    return new;
  end if;

  v_max          := coalesce(public.business_plan_limit(new.business_id, 'active_offers'), 1);
  v_max_promoted := coalesce(public.business_plan_limit(new.business_id, 'promoted_offers'), 0);

  -- The owner can read every deal of their own business, so this count is complete under RLS.
  select count(*), count(*) filter (where d.promoted)
    into v_active, v_promoted
  from public.deals d
  where d.business_id = new.business_id
    and d.id <> new.id
    and d.deleted_at is null
    and d.ends_at > now();

  if v_active >= v_max then
    raise exception 'Your plan includes % offer(s) at a time. End one, or change plan to publish more.', v_max
      using errcode = 'NM402';
  end if;
  if new.promoted and v_promoted >= v_max_promoted then
    raise exception 'Your plan includes % promoted offer(s) at a time.', v_max_promoted
      using errcode = 'NM402';
  end if;
  return new;
end
$$;

create or replace trigger trg_deals_plan
  before insert or update on public.deals
  for each row execute function public.deals_enforce_plan();

-- Plan limit on listing photos.
create or replace function public.business_photos_enforce_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max integer;
begin
  if not public.is_client_request() or public.is_admin() then
    return new;
  end if;
  v_max := coalesce(public.business_plan_limit(new.business_id, 'photos'), 6);
  if (select count(*) from public.business_photos p where p.business_id = new.business_id) >= v_max then
    raise exception 'Your plan includes % photos. Remove one, or change plan to add more.', v_max
      using errcode = 'NM402';
  end if;
  return new;
end
$$;

create or replace trigger trg_business_photos_plan
  before insert on public.business_photos
  for each row execute function public.business_photos_enforce_plan();

-- ── 9. Reviews ──────────────────────────────────────────────────────────────────────────────

create or replace function public.reviews_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cap    integer;
  v_recent integer;
begin
  if tg_op = 'INSERT' or new.aspects is distinct from old.aspects then
    if (select count(*) from jsonb_object_keys(new.aspects)) > 8
       or exists (
         select 1
         from jsonb_each(new.aspects) as a (k, v)
         where char_length(a.k) not between 1 and 40
            or jsonb_typeof(a.v) <> 'number'
            or (a.v #>> '{}')::numeric not in (1, 2, 3, 4, 5)
       ) then
      raise exception 'Aspect ratings must be whole numbers from 1 to 5 (at most 8 aspects).' using errcode = '22023';
    end if;
  end if;

  if tg_op = 'INSERT' and public.is_client_request() then
    if exists (select 1 from public.businesses b where b.id = new.business_id and b.owner_id = new.user_id) then
      raise exception 'You cannot review your own business.' using errcode = 'NM409';
    end if;

    -- Score-farming guard: reviews are rewarded immediately, so cap how many a person can post a day.
    select coalesce((select c.max_reviews_per_day from public.app_config c limit 1), 20) into v_cap;
    select count(*) into v_recent
    from public.reviews r
    where r.user_id = new.user_id and r.created_at > now() - interval '24 hours';
    if v_recent >= v_cap then
      raise exception 'You can post up to % reviews a day.', v_cap using errcode = 'NM429';
    end if;
  end if;
  return new;
end
$$;

create or replace trigger trg_reviews_prepare
  before insert or update on public.reviews
  for each row execute function public.reviews_before_write();

-- Recompute businesses.rating_count / rating_sum from the visible, non-deleted reviews.
-- A full recount per business (indexed, a handful of rows) is used instead of +1/−1 arithmetic
-- so the aggregate cannot drift, whatever combination of edits, moderation and deletes happens.
create or replace function public.refresh_business_rating(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Lock, then count (see recompute_user_score for why the order matters).
  perform 1 from public.businesses b where b.id = p_business_id for update;
  if not found then
    return;
  end if;

  update public.businesses b
  set rating_count = s.n,
      rating_sum   = s.total
  from (
    select count(*)::integer as n, coalesce(sum(r.rating), 0)::integer as total
    from public.reviews r
    where r.business_id = p_business_id
      and r.deleted_at is null
      and r.moderation = 'visible'
  ) s
  where b.id = p_business_id
    and (b.rating_count, b.rating_sum) is distinct from (s.n, s.total);
end
$$;

create or replace function public.reviews_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.contribution_status;
  v_name   text;
begin
  if tg_op = 'DELETE' then
    perform public.refresh_business_rating(old.business_id);
    perform public.sync_contribution(old.user_id, 'review', 'review:' || old.business_id::text, null);
    perform public.sync_contribution(old.user_id, 'photo',  'photo:'  || old.business_id::text, null);
    return null;
  end if;

  perform public.refresh_business_rating(new.business_id);
  if tg_op = 'UPDATE' and old.business_id is distinct from new.business_id then
    perform public.refresh_business_rating(old.business_id);
  end if;

  -- The review's contribution follows its state: visible → verified, awaiting moderation →
  -- pending, hidden by a moderator → rejected (costs reputation), deleted by the author → gone.
  -- Keyed by business, not by review id: deleting and re-posting is rewarded once.
  v_status := case
    when new.deleted_at is not null then null
    when new.moderation = 'visible' then 'verified'
    when new.moderation = 'pending' then 'pending'
    else 'rejected'
  end;
  select b.name into v_name from public.businesses b where b.id = new.business_id;

  perform public.sync_contribution(
    new.user_id, 'review', 'review:' || new.business_id::text, v_status,
    'Reviewed ' || coalesce(v_name, 'a place'), new.id::text, new.business_id, true, new.is_sample
  );
  -- The photo contribution (created when photos are attached) follows the same state.
  perform public.sync_contribution(
    new.user_id, 'photo', 'photo:' || new.business_id::text, v_status,
    null, new.id::text || ':photos', new.business_id, false, new.is_sample
  );
  return null;
end
$$;

create or replace trigger trg_reviews_after_change
  after insert or delete or update of rating, moderation, deleted_at, business_id on public.reviews
  for each row execute function public.reviews_after_change();

create or replace function public.review_photos_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews;
  v_name   text;
begin
  select * into v_review from public.reviews r where r.id = new.review_id;
  if not found or v_review.deleted_at is not null then
    return null;
  end if;
  select b.name into v_name from public.businesses b where b.id = v_review.business_id;

  perform public.sync_contribution(
    v_review.user_id, 'photo', 'photo:' || v_review.business_id::text,
    case v_review.moderation when 'visible' then 'verified' when 'pending' then 'pending' else 'rejected' end::public.contribution_status,
    'Added photos to ' || coalesce(v_name, 'a place'), v_review.id::text || ':photos', v_review.business_id, true, v_review.is_sample
  );
  return null;
end
$$;

create or replace trigger trg_review_photos_after_insert
  after insert on public.review_photos
  for each row execute function public.review_photos_after_insert();

-- "Helpful" tally; nobody can mark their own review.
create or replace function public.review_votes_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.reviews r where r.id = new.review_id and r.user_id = new.user_id) then
      raise exception 'You cannot mark your own review as helpful.' using errcode = 'NM409';
    end if;
    update public.reviews r set helpful_count = r.helpful_count + 1 where r.id = new.review_id;
  else
    update public.reviews r set helpful_count = greatest(r.helpful_count - 1, 0) where r.id = old.review_id;
  end if;
  return null;
end
$$;

create or replace trigger trg_review_votes_tally
  after insert or delete on public.review_votes
  for each row execute function public.review_votes_after_change();

-- Narrow path for owner replies: clients have no privilege on reviews.owner_reply*, so this RPC
-- is the only way to write them. NULL / empty text removes the reply.
create or replace function public.reply_to_review(p_review_id uuid, p_text text)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_review public.reviews;
  v_text   text := nullif(btrim(coalesce(p_text, '')), '');
  v_name   text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select * into v_review from public.reviews r where r.id = p_review_id and r.deleted_at is null for update;
  if not found then
    raise exception 'Review not found.' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or (public.owns_business(v_review.business_id) and public.is_active_user())) then
    raise exception 'Only the owner of this business can reply to its reviews.' using errcode = '42501';
  end if;
  if not public.is_admin() and not exists (
    select 1 from public.businesses b where b.id = v_review.business_id and b.verification_status = 'verified'
  ) then
    raise exception 'Verify this listing to reply to reviews.' using errcode = 'NM409';
  end if;
  if v_text is not null and char_length(v_text) < 3 then
    raise exception 'Write a short reply first.' using errcode = '22023';
  end if;

  update public.reviews r
  set owner_reply    = left(v_text, 600),
      owner_reply_at = case when v_text is null then null else now() end,
      owner_reply_by = case when v_text is null then null else v_uid end
  where r.id = p_review_id
  returning * into v_review;

  if v_text is not null and v_review.user_id <> v_uid then
    select b.name into v_name from public.businesses b where b.id = v_review.business_id;
    perform public.notify_user(v_review.user_id, 'favorite', coalesce(v_name, 'A business') || ' replied to your review', left(v_text, 200), null);
  end if;
  return v_review;
end
$$;

-- ── 10. Saved places, collections, events, search history, preferences ──────────────────────

-- Adding a place to a collection also saves it (savedService.toggleInCollection).
create or replace function public.collection_places_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.saved_places (user_id, business_id)
  values (new.user_id, new.business_id)
  on conflict do nothing;
  return new;
end
$$;

create or replace trigger trg_collection_places_before_insert
  before insert on public.collection_places
  for each row execute function public.collection_places_before_insert();

create or replace function public.event_interest_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.events e set interested_count = e.interested_count + 1 where e.id = new.event_id;
  else
    update public.events e set interested_count = greatest(e.interested_count - 1, 0) where e.id = old.event_id;
  end if;
  return null;
end
$$;

create or replace trigger trg_event_interest_tally
  after insert or delete on public.event_interest
  for each row execute function public.event_interest_after_change();

create or replace function public.events_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_client_request() then
    new.submitted_by := auth.uid();
    new.source := case when new.business_id is not null and public.owns_business(new.business_id) then 'business' else 'community' end;
    if btrim(new.organizer_name) = '' then
      -- the caller can read their own profile row, so this needs no elevated rights
      new.organizer_name := coalesce((select p.display_name from public.profiles p where p.id = auth.uid()), '');
    end if;
  end if;
  return new;
end
$$;

create or replace trigger trg_events_before_insert
  before insert on public.events
  for each row execute function public.events_before_insert();

-- A community event earns its submitter points once it is approved.
create or replace function public.events_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source <> 'community' or new.submitted_by is null then
    return null;
  end if;
  perform public.sync_contribution(
    new.submitted_by, 'event', 'event:' || new.id::text,
    case
      when new.deleted_at is not null then null
      when new.moderation = 'visible' then 'verified'
      when new.moderation = 'pending' then 'pending'
      else 'rejected'
    end::public.contribution_status,
    'Submitted event: ' || new.title, new.id::text, new.business_id, true, new.is_sample
  );
  return null;
end
$$;

create or replace trigger trg_events_contribution
  after insert or update of moderation, deleted_at on public.events
  for each row execute function public.events_after_change();

-- Suggested map corrections earn points when an admin approves them.
create or replace function public.place_suggestions_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.contribution_kind;
begin
  if tg_op = 'DELETE' then
    perform public.sync_contribution(old.user_id, 'place', 'suggestion:' || old.id::text, null);
    return null;
  end if;
  if new.user_id is null then
    return null;
  end if;

  v_kind := case new.kind
    when 'add'      then 'place'
    when 'edit'     then 'edit'
    when 'closed'   then 'closed'
    when 'missing'  then 'missing'
    when 'category' then 'category'
    when 'photo'    then 'photo'
  end;
  perform public.sync_contribution(
    new.user_id, v_kind, 'suggestion:' || new.id::text,
    case new.status when 'approved' then 'verified' when 'rejected' then 'rejected' else 'pending' end::public.contribution_status,
    initcap(replace(v_kind::text, '_', ' ')) || ': ' || new.name, new.id::text, new.business_id, true, new.is_sample
  );
  return null;
end
$$;

create or replace trigger trg_place_suggestions_contribution
  after insert or delete or update of status on public.place_suggestions
  for each row execute function public.place_suggestions_after_change();

-- Privacy: the alert centre is stored on a 0.01° grid (~1.1 km), never as sent.
create or replace function public.user_preferences_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.alert_lat is not null and new.alert_lon is not null then
    new.alert_lat := round(new.alert_lat::numeric, 2)::double precision;
    new.alert_lon := round(new.alert_lon::numeric, 2)::double precision;
  end if;
  if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
    begin
      perform now() at time zone new.timezone;
    exception when others then
      raise exception 'Unknown time zone "%".', new.timezone using errcode = '22023';
    end;
  end if;
  return new;
end
$$;

create or replace trigger trg_user_preferences_prepare
  before insert or update on public.user_preferences
  for each row execute function public.user_preferences_before_write();

-- Search history honours the user's "save search history" switch on the server too, and keeps
-- only the 50 most recent entries per user.
create or replace function public.search_history_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.user_preferences up where up.user_id = new.user_id and not up.save_search_history) then
    return null;   -- silently skip the insert
  end if;
  return new;
end
$$;

create or replace trigger trg_search_history_before_insert
  before insert on public.search_history
  for each row execute function public.search_history_before_insert();

create or replace function public.search_history_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.search_history h
  where h.user_id = new.user_id
    and h.id in (
      select x.id
      from public.search_history x
      where x.user_id = new.user_id
      order by x.created_at desc, x.id desc
      offset 50
    );
  return null;
end
$$;

create or replace trigger trg_search_history_trim
  after insert on public.search_history
  for each row execute function public.search_history_after_insert();

-- Popular searches across users, for the suggestions strip. Returns aggregated, normalised
-- query strings only, and only those typed by at least p_min_users different people, so a
-- single person's searches can never surface.
create or replace function public.trending_searches(p_days integer default 7, p_limit integer default 10, p_min_users integer default 5)
returns table (query text, searches bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select h.normalized_query, count(*)
  from public.search_history h
  where h.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
    and char_length(h.normalized_query) >= 3
  group by h.normalized_query
  having count(distinct h.user_id) >= greatest(coalesce(p_min_users, 5), 3)
  order by count(*) desc, h.normalized_query
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

-- ── 11. Community reports ───────────────────────────────────────────────────────────────────

create or replace function public.report_ttl_minutes(p_type public.report_type)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(1, least(10080, coalesce(
    (select (c.report_expiry_minutes ->> p_type::text)::integer from public.app_config c limit 1),
    30
  )))
$$;

-- Privacy coarsening for anything other people can see that is not a place's own position.
-- Latitude snaps to a 0.003° grid (≈ 333 m). The longitude step is widened by 1/cos(latitude) so
-- a cell is ≈ 333 m wide everywhere instead of shrinking towards the poles. (The frontend's
-- approximate() uses 0.003° on both axes; the server's result is authoritative.)
create or replace function public.coarsen_point(p_lat double precision, p_lon double precision)
returns table (lat double precision, lon double precision)
language sql
immutable
parallel safe
set search_path = ''
as $$
  select g.snapped_lat,
         least(180.0, greatest(-180.0, round((round(p_lon / s.lon_step) * s.lon_step)::numeric, 6)))::double precision
  from (select least(90.0, greatest(-90.0, round((round(p_lat / 0.003) * 0.003)::numeric, 6)))::double precision as snapped_lat) g
  cross join lateral (
    select round((0.003 / greatest(cos(radians(g.snapped_lat)), 0.2))::numeric, 6)::double precision as lon_step
  ) s
$$;

-- The three derivations below mirror deriveReport() in src/lib/community.ts term for term.
create or replace function public.report_verification(
  p_source            public.report_source,
  p_confirms          integer,
  p_disputes          integer,
  p_min_confirmations integer
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_disputes >= greatest(2, p_confirms + 1) then 'disputed'
    when p_source = 'business' then 'business_confirmed'
    when p_confirms >= p_min_confirmations then 'community_verified'
    else 'unverified'
  end
$$;

create or replace function public.report_freshness(p_refreshed_at timestamptz, p_expires_at timestamptz, p_now timestamptz)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_now >= p_expires_at then 'expired'
    when extract(epoch from (p_now - p_refreshed_at)) < greatest(60, extract(epoch from (p_expires_at - p_refreshed_at))) * 0.5 then 'live'
    else 'recent'
  end
$$;

-- 0–1. Who said it, how many independent people agree / disagree, how old it is.
create or replace function public.report_confidence(
  p_source       public.report_source,
  p_reputation   integer,
  p_confirms     integer,
  p_disputes     integer,
  p_refreshed_at timestamptz,
  p_expires_at   timestamptz,
  p_now          timestamptz
)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select round(least(0.97, greatest(0.04,
      ( (case when p_source = 'business' then 0.82 else 0.3 + (p_reputation / 100.0) * 0.25 end)
        + least(0.36, p_confirms * 0.09)
        - least(0.6, p_disputes * 0.16) )
      * (1 - 0.35 * least(1.0, greatest(0.0, t.age / t.ttl)))
      * (case when p_now >= p_expires_at then 0.3 else 1.0 end)
    ))::numeric, 4)
  from (
    select greatest(60, extract(epoch from (p_expires_at - p_refreshed_at)))::numeric as ttl,
           extract(epoch from (p_now - p_refreshed_at))::numeric as age
  ) t
$$;

-- Vote tallies on community_reports.
create or replace function public.report_reactions_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta  integer := case when tg_op = 'INSERT' then 1 else -1 end;
  v_report uuid;
  v_kind   text;
begin
  if tg_op = 'INSERT' then
    v_report := new.report_id;
  else
    v_report := old.report_id;
  end if;

  if tg_table_name = 'report_confirmations' then
    v_kind := 'confirm';
  elsif tg_op = 'INSERT' then
    v_kind := new.kind::text;
  else
    v_kind := old.kind::text;
  end if;

  update public.community_reports r
  set confirm_count = greatest(r.confirm_count + case when v_kind = 'confirm'  then v_delta else 0 end, 0),
      dispute_count = greatest(r.dispute_count + case when v_kind = 'disagree' then v_delta else 0 end, 0),
      helpful_count = greatest(r.helpful_count + case when v_kind = 'helpful'  then v_delta else 0 end, 0),
      flag_count    = greatest(r.flag_count    + case when v_kind = 'flag'     then v_delta else 0 end, 0)
  where r.id = v_report;
  return null;
end
$$;

create or replace trigger trg_report_confirmations_tally
  after insert or delete on public.report_confirmations
  for each row execute function public.report_reactions_after_change();

create or replace trigger trg_report_votes_tally
  after insert or delete on public.report_votes
  for each row execute function public.report_reactions_after_change();

-- The reporter's contribution follows the report:
--   posted                         → pending (an unverified update earns nothing)
--   first independent confirmation → verified (and stays verified if confirmations are later
--                                    withdrawn or reset by a refresh: it was true when confirmed)
--   auto-hidden / under review     → pending
--   hidden by a moderator          → rejected
--   removed by the reporter        → contribution removed
-- Hard deletion by expire_reports() does not fire this trigger, so earned points survive the purge.
create or replace function public.community_reports_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'report:' || new.id::text;
begin
  if new.source <> 'community' then
    return null;   -- business posts are not part of the contribution game
  end if;

  if new.deleted_at is not null then
    perform public.sync_contribution(new.reporter_id, 'report', v_key, null);
  elsif new.moderation = 'hidden' then
    perform public.sync_contribution(new.reporter_id, 'report', v_key, 'rejected', new.title, new.id::text, new.business_id, true, new.is_sample);
  elsif new.moderation = 'pending' then
    perform public.sync_contribution(new.reporter_id, 'report', v_key, 'pending', new.title, new.id::text, new.business_id, true, new.is_sample);
  elsif new.confirm_count >= 1 then
    perform public.sync_contribution(new.reporter_id, 'report', v_key, 'verified', new.title, new.id::text, new.business_id, true, new.is_sample);
  else
    insert into public.user_contributions as c (user_id, kind, title, points, status, ref_id, business_id, dedupe_key, is_sample)
    values (new.reporter_id, 'report', left(new.title, 200), public.contribution_points('report'), 'pending', new.id::text, new.business_id, v_key, new.is_sample)
    on conflict (user_id, dedupe_key) do update
      set status = 'pending', verified_at = null
      where c.status = 'rejected';   -- restored by a moderator; an earned 'verified' is kept
  end if;

  if tg_op = 'UPDATE' and old.confirm_count = 0 and new.confirm_count >= 1
     and new.moderation = 'visible' and new.deleted_at is null then
    perform public.notify_user(new.reporter_id, 'community', 'Your update was confirmed', left(new.title, 200), '/community');
  end if;
  return null;
end
$$;

create or replace trigger trg_community_reports_contribution
  after insert or update of confirm_count, moderation, deleted_at on public.community_reports
  for each row execute function public.community_reports_after_change();

-- Post a live update. The only way a community_reports row is created by a client.
--   (a) at most app_config.max_reports_per_hour new reports per user per hour (owners posting as
--       their business are exempt; soft-deleted reports still count, so delete-and-repost does
--       not reset the limit),
--   (b) posting the same type again for the same place (or, without a place, within 400 m)
--       while the earlier report is still current refreshes that report instead of adding one,
--   (c) expires_at = now + app_config.report_expiry_minutes[type],
--   (d) with a place the report sits on the place; without one the supplied position is
--       coarsened to a ~300 m cell before it is stored. The precise value is never written.
-- Returns {"refreshed": bool, "report": {…community_reports row without `location`…}}.
create or replace function public.submit_report(
  p_type        public.report_type,
  p_level       public.report_level,
  p_title       text,
  p_value       numeric default null,
  p_note        text default null,
  p_business_id uuid default null,
  p_lat         double precision default null,
  p_lon         double precision default null,
  p_area_label  text default null,
  p_as_business boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_title      text := btrim(coalesce(p_title, ''));
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_business   public.businesses;
  v_lat        double precision;
  v_lon        double precision;
  v_area       text;
  v_source     public.report_source := 'community';
  v_reputation smallint;
  v_ttl        interval;
  v_limit      integer;
  v_recent     integer;
  v_existing   public.community_reports;
  v_report     public.community_reports;
  v_refreshed  boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to post an update.' using errcode = '28000';
  end if;
  if not public.is_active_user() then
    raise exception 'This account cannot post updates.' using errcode = '42501';
  end if;
  if p_type is null or p_level is null then
    raise exception 'An update needs a type and a level.' using errcode = '22023';
  end if;
  if char_length(v_title) not between 3 and 90 then
    raise exception 'The update text needs 3 to 90 characters.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 280 then
    raise exception 'Keep the note under 280 characters.' using errcode = '22023';
  end if;
  if p_value is not null and p_value not between 0 and 100000 then
    raise exception 'The value is out of range.' using errcode = '22023';
  end if;

  if p_business_id is not null then
    select * into v_business
    from public.businesses b
    where b.id = p_business_id and b.deleted_at is null and b.moderation = 'visible';
    if not found then
      raise exception 'That place does not exist.' using errcode = 'P0002';
    end if;
    v_lat  := v_business.lat;
    v_lon  := v_business.lon;
    v_area := left(v_business.name, 120);
  else
    if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
      raise exception 'An update that is not about a place needs a location.' using errcode = '22023';
    end if;
    select c.lat, c.lon into v_lat, v_lon from public.coarsen_point(p_lat, p_lon) c;   -- (d)
    v_area := left(btrim(coalesce(p_area_label, '')), 120);
  end if;

  if coalesce(p_as_business, false) then
    if p_business_id is null or v_business.owner_id is distinct from v_uid then
      raise exception 'Only the owner of this business can post as the business.' using errcode = '42501';
    end if;
    -- "Business confirmed" must mean something: the listing has to be verified.
    if v_business.verification_status <> 'verified' then
      raise exception 'Verify this listing to post "Business confirmed" updates.' using errcode = 'NM409';
    end if;
    v_source := 'business';
  end if;

  -- One submit at a time per user, so two concurrent calls cannot both pass (a) or both miss (b).
  perform pg_advisory_xact_lock(hashtextextended('nearme.submit_report:' || v_uid::text, 0));

  v_ttl := make_interval(mins => public.report_ttl_minutes(p_type));   -- (c)

  -- (b) refresh instead of duplicating
  select r.* into v_existing
  from public.community_reports r
  where r.reporter_id = v_uid
    and r.type = p_type
    and r.source = v_source
    and r.deleted_at is null
    and r.expires_at > now()
    and case
          when p_business_id is not null then r.business_id = p_business_id
          else r.business_id is null
               and extensions.st_dwithin(
                     r.location,
                     extensions.st_setsrid(extensions.st_makepoint(v_lon, v_lat), 4326)::extensions.geography,
                     400)
        end
  order by r.refreshed_at desc
  limit 1
  for update;

  if found then
    -- What people confirmed or disputed was the old statement. If the statement changes, the
    -- votes on it no longer apply.
    if v_existing.level is distinct from p_level
       or v_existing.title is distinct from v_title
       or v_existing.value is distinct from p_value then
      delete from public.report_confirmations rc where rc.report_id = v_existing.id;
      delete from public.report_votes rv where rv.report_id = v_existing.id and rv.kind = 'disagree';
    end if;

    update public.community_reports r
    set level        = p_level,
        title        = v_title,
        value        = p_value,
        note         = v_note,
        refreshed_at = now(),
        expires_at   = now() + v_ttl
    where r.id = v_existing.id
    returning r.* into v_report;
    v_refreshed := true;
  else
    -- (a) rate limit
    if v_source = 'community' then
      select coalesce((select c.max_reports_per_hour from public.app_config c limit 1), 6) into v_limit;
      select count(*) into v_recent
      from public.community_reports r
      where r.reporter_id = v_uid
        and r.source = 'community'
        and r.created_at > now() - interval '1 hour';
      if v_recent >= v_limit then
        raise exception 'You can post up to % updates an hour. Thanks for keeping the feed useful.', v_limit
          using errcode = 'NM429';
      end if;
    end if;

    if v_source = 'business' then
      v_reputation := 90;
    else
      select p.reputation into v_reputation from public.profiles p where p.id = v_uid;
    end if;

    insert into public.community_reports
      (type, level, title, note, value, business_id, lat, lon, area_label, source, reporter_id, reporter_reputation, expires_at)
    values
      (p_type, p_level, v_title, v_note, p_value, p_business_id, v_lat, v_lon, coalesce(v_area, ''), v_source, v_uid, coalesce(v_reputation, 40), now() + v_ttl)
    returning * into v_report;
  end if;

  return jsonb_build_object('refreshed', v_refreshed, 'report', to_jsonb(v_report) - 'location');
end
$$;

-- Shared checks for the voting RPCs. Returns the locked report row.
create or replace function public.lock_votable_report(p_report_id uuid)
returns public.community_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_report public.community_reports;
begin
  if v_uid is null then
    raise exception 'Sign in to vote.' using errcode = '28000';
  end if;
  if not public.is_active_user() then
    raise exception 'This account cannot vote.' using errcode = '42501';
  end if;

  select * into v_report from public.community_reports r where r.id = p_report_id for update;
  if not found or v_report.deleted_at is not null or v_report.moderation <> 'visible' then
    raise exception 'That update is no longer available.' using errcode = 'P0002';
  end if;
  if v_report.expires_at <= now() then
    raise exception 'That update has expired.' using errcode = 'NM409';
  end if;
  if v_report.reporter_id = v_uid then
    raise exception 'You cannot vote on your own update.' using errcode = 'NM409';
  end if;
  return v_report;
end
$$;

-- Confirm a report (calling it again withdraws the confirmation). One vote per user per
-- report: confirming removes the caller's disagreement. The first independent confirmation
-- verifies the reporter's contribution (community_reports_after_change).
-- Returns {"report_id", "my_vote": "confirm"|null, "confirm_count", "dispute_count", "moderation"}.
create or replace function public.confirm_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_report public.community_reports;
  v_had    boolean;
begin
  v_report := public.lock_votable_report(p_report_id);

  delete from public.report_confirmations rc where rc.report_id = p_report_id and rc.user_id = v_uid;
  v_had := found;

  if v_had then
    -- Withdrawn: the confirmer's reward goes too (the dedupe key means re-confirming later
    -- simply restores it, never doubles it).
    perform public.sync_contribution(v_uid, 'confirm', 'confirm:' || p_report_id::text, null);
  else
    delete from public.report_votes rv where rv.report_id = p_report_id and rv.user_id = v_uid and rv.kind = 'disagree';
    insert into public.report_confirmations (report_id, user_id) values (p_report_id, v_uid);
    perform public.sync_contribution(
      v_uid, 'confirm', 'confirm:' || p_report_id::text, 'verified',
      'Confirmed: ' || v_report.title, 'confirm:' || p_report_id::text, v_report.business_id
    );
  end if;

  select * into v_report from public.community_reports r where r.id = p_report_id;
  return jsonb_build_object(
    'report_id', v_report.id,
    'my_vote', case when v_had then null else 'confirm' end,
    'confirm_count', v_report.confirm_count,
    'dispute_count', v_report.dispute_count,
    'moderation', v_report.moderation
  );
end
$$;

-- Disagree with a report (calling it again withdraws the disagreement). Removes the caller's
-- confirmation. When disagreements reach app_config.disagreements_to_hide and outnumber the
-- confirmations, the report is taken out of the feed (moderation = 'pending') and queued for
-- a moderator.
create or replace function public.dispute_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_report    public.community_reports;
  v_had       boolean;
  v_threshold integer;
begin
  v_report := public.lock_votable_report(p_report_id);

  delete from public.report_votes rv where rv.report_id = p_report_id and rv.user_id = v_uid and rv.kind = 'disagree';
  v_had := found;

  if not v_had then
    delete from public.report_confirmations rc where rc.report_id = p_report_id and rc.user_id = v_uid;
    if found then
      perform public.sync_contribution(v_uid, 'confirm', 'confirm:' || p_report_id::text, null);
    end if;
    insert into public.report_votes (report_id, user_id, kind) values (p_report_id, v_uid, 'disagree');
  end if;

  select * into v_report from public.community_reports r where r.id = p_report_id;
  select coalesce((select c.disagreements_to_hide from public.app_config c limit 1), 4) into v_threshold;

  if v_report.moderation = 'visible'
     and v_report.dispute_count >= v_threshold
     and v_report.dispute_count > v_report.confirm_count then
    update public.community_reports r set moderation = 'pending' where r.id = p_report_id returning r.* into v_report;

    insert into public.moderation_reports (target_type, target_id, target_label, reason, is_system)
    values ('report', v_report.id::text, left(v_report.title || ' · ' || v_report.area_label, 200), 'Disputed by several people', true)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'report_id', v_report.id,
    'my_vote', case when v_had then null else 'disagree' end,
    'confirm_count', v_report.confirm_count,
    'dispute_count', v_report.dispute_count,
    'moderation', v_report.moderation
  );
end
$$;

-- Toggle the caller's "helpful" mark. Returns true when the mark is now set.
create or replace function public.toggle_report_helpful(p_report_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  perform public.lock_votable_report(p_report_id);

  delete from public.report_votes rv where rv.report_id = p_report_id and rv.user_id = v_uid and rv.kind = 'helpful';
  if found then
    return false;
  end if;
  insert into public.report_votes (report_id, user_id, kind) values (p_report_id, v_uid, 'helpful');
  return true;
end
$$;

-- Housekeeping, meant to be run by pg_cron every few minutes.
--
-- Correctness never depends on this job: every read path (the RLS policy on community_reports,
-- nearby_reports, the voting RPCs) compares expires_at with now(), so an expired report is not
-- returned as current even if the job has not run. What the job does is the privacy half:
-- reports are hard-deleted `report_retention_hours` after they expire, so the table never
-- becomes a history of where reporters were. Pending contributions of purged reports (nobody
-- confirmed them in time) are removed without penalty; verified ones keep their points.
create or replace function public.expire_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff  timestamptz;
  v_deleted integer;
begin
  select now() - make_interval(hours => coalesce((select c.report_retention_hours from public.app_config c limit 1), 24))
    into v_cutoff;

  delete from public.user_contributions c
  using public.community_reports r
  where r.expires_at < v_cutoff
    and c.user_id = r.reporter_id
    and c.dedupe_key = 'report:' || r.id::text
    and c.status = 'pending';

  delete from public.community_reports r where r.expires_at < v_cutoff;
  get diagnostics v_deleted = row_count;

  -- Automatic flags about reports that no longer exist are moot.
  update public.moderation_reports m
  set status = 'dismissed', resolution = 'Report expired', resolved_at = now()
  where m.status = 'open'
    and m.target_type = 'report'
    and not exists (select 1 from public.community_reports r where r.id::text = m.target_id);

  return v_deleted;
end
$$;

-- Scheduling (pg_cron). Enable the extension once (Dashboard → Database → Extensions → pg_cron,
-- or `create extension if not exists pg_cron;`), then either re-run this migration or run the
-- `cron.schedule` call below by hand. cron.schedule() with an existing job name replaces the
-- job, so this block is idempotent. It is skipped silently when pg_cron is not installed.
--
--   select cron.schedule('nearme-expire-reports', '*/5 * * * *', $job$select public.expire_reports()$job$);
--   select * from cron.job;                                  -- inspect
--   select cron.unschedule('nearme-expire-reports');         -- remove
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('nearme-expire-reports', '*/5 * * * *', 'select public.expire_reports()');
  else
    raise notice 'pg_cron is not installed: schedule public.expire_reports() manually (see comment above).';
  end if;
end
$$;

-- ── 12. Flags and moderation ────────────────────────────────────────────────────────────────

-- Put something in the moderation queue. One open flag per person per item; returns false when
-- the caller already has an open flag on it. The only way a client creates a moderation_reports row.
create or replace function public.flag_content(
  p_target_type  public.moderation_target,
  p_target_id    text,
  p_reason       text,
  p_note         text default null,
  p_target_label text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_target text := btrim(coalesce(p_target_id, ''));
  v_uuid   uuid;
  v_exists boolean := true;
begin
  if v_uid is null then
    raise exception 'Sign in to report content.' using errcode = '28000';
  end if;
  if not public.is_active_user() then
    raise exception 'This account cannot report content.' using errcode = '42501';
  end if;
  if p_target_type is null or char_length(v_target) not between 1 and 80 or char_length(v_reason) not between 1 and 120 then
    raise exception 'A target and a reason are required.' using errcode = '22023';
  end if;

  if p_target_type <> 'place' then
    begin
      v_uuid := v_target::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid target id.' using errcode = '22023';
    end;
    v_exists := case p_target_type
      when 'review'   then exists (select 1 from public.reviews x where x.id = v_uuid)
      when 'report'   then exists (select 1 from public.community_reports x where x.id = v_uuid)
      when 'deal'     then exists (select 1 from public.deals x where x.id = v_uuid)
      when 'event'    then exists (select 1 from public.events x where x.id = v_uuid)
      when 'business' then exists (select 1 from public.businesses x where x.id = v_uuid)
      when 'user'     then exists (select 1 from public.profiles x where x.id = v_uuid)
    end;
    if not v_exists then
      raise exception 'That item no longer exists.' using errcode = 'P0002';
    end if;
  end if;

  if exists (
    select 1 from public.moderation_reports m
    where m.target_type = p_target_type and m.target_id = v_target and m.reporter_id = v_uid and m.status = 'open'
  ) then
    return false;
  end if;

  begin
    insert into public.moderation_reports (target_type, target_id, target_label, reason, note, reporter_id)
    values (p_target_type, v_target, left(btrim(coalesce(p_target_label, '')), 200), v_reason,
            left(nullif(btrim(coalesce(p_note, '')), ''), 500), v_uid);
  exception when unique_violation then
    return false;   -- concurrent duplicate
  end;

  -- Flag tallies shown to moderators.
  if p_target_type = 'report' then
    insert into public.report_votes (report_id, user_id, kind) values (v_uuid, v_uid, 'flag') on conflict do nothing;
  elsif p_target_type = 'review' then
    update public.reviews r set flag_count = r.flag_count + 1 where r.id = v_uuid;
  end if;
  return true;
end
$$;

-- Admin: set the moderation state of a piece of content (or suspend / reinstate an account)
-- and close the open flags about it, in one transaction.
--   review | report | deal | event | business  → p_state is the new moderation state
--   user                                        → 'hidden' suspends, 'visible' reinstates
create or replace function public.admin_set_moderation(
  p_target_type public.moderation_target,
  p_target_id   uuid,
  p_state       public.moderation_state,
  p_resolution  text default null
)
returns integer   -- number of flags closed
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Only an administrator can moderate content.' using errcode = '42501';
  end if;
  if p_target_id is null or p_state is null then
    raise exception 'A target and a state are required.' using errcode = '22023';
  end if;

  case p_target_type
    when 'review'   then update public.reviews x           set moderation = p_state where x.id = p_target_id;
    when 'report'   then update public.community_reports x set moderation = p_state where x.id = p_target_id;
    when 'deal'     then update public.deals x             set moderation = p_state where x.id = p_target_id;
    when 'event'    then update public.events x            set moderation = p_state where x.id = p_target_id;
    when 'business' then update public.businesses x        set moderation = p_state where x.id = p_target_id;
    when 'user'     then
      if p_target_id = auth.uid() then
        raise exception 'You cannot suspend your own account.' using errcode = 'NM409';
      end if;
      update public.profiles x
      set status = case when p_state = 'visible' then 'active' else 'suspended' end::public.account_status
      where x.id = p_target_id;
    else
      raise exception 'Target type "%" has no moderation state.', p_target_type using errcode = '22023';
  end case;
  if not found then
    raise exception 'Target not found.' using errcode = 'P0002';
  end if;

  update public.moderation_reports m
  set status      = case when p_state = 'visible' then 'dismissed' else 'resolved' end::public.moderation_status,
      resolution  = left(nullif(btrim(coalesce(p_resolution, '')), ''), 500),
      resolved_by = auth.uid(),
      resolved_at = now()
  where m.target_type = p_target_type
    and m.target_id = p_target_id::text
    and m.status = 'open';
  get diagnostics v_closed = row_count;
  return v_closed;
end
$$;

-- ── 13. Push subscriptions and analytics ────────────────────────────────────────────────────

-- Store (or take over) a browser push subscription. An endpoint identifies one browser profile:
-- if somebody else was signed in on this device before, the endpoint moves to the caller, which
-- a plain upsert could not do under RLS.
create or replace function public.register_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth_key   text,
  p_user_agent text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to enable notifications.' using errcode = '28000';
  end if;

  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth_key, user_agent, expires_at)
  values (v_uid, p_endpoint, p_p256dh, p_auth_key, left(p_user_agent, 300), p_expires_at)
  on conflict (endpoint) do update
    set user_id       = excluded.user_id,
        p256dh        = excluded.p256dh,
        auth_key      = excluded.auth_key,
        user_agent    = excluded.user_agent,
        expires_at    = excluded.expires_at,
        failure_count = 0
  returning s.id into v_id;

  update public.user_preferences up set push_enabled = true where up.user_id = v_uid and not up.push_enabled;
  return v_id;
end
$$;

-- Count an interaction with a managed business. Anonymous on purpose: the row holds the
-- business, the kind and the time. Nothing is recorded for places nobody manages, because
-- nobody could read those numbers (same rule as analyticsService.track()).
create or replace function public.track_business_event(p_business_id uuid, p_kind public.analytics_kind)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.analytics_events (business_id, kind)
  select b.id, p_kind
  from public.businesses b
  where b.id = p_business_id
    and b.owner_id is not null
    and b.deleted_at is null
    and p_kind is not null
$$;

-- Daily totals for the business portal chart. SECURITY INVOKER: RLS on analytics_events limits
-- the rows to businesses the caller owns (or everything, for admins).
create or replace function public.business_analytics_daily(p_business_id uuid, p_days integer default 14)
returns table (day date, kind public.analytics_kind, events bigint)
language sql
stable
set search_path = ''
as $$
  select (e.occurred_at at time zone b.timezone)::date, e.kind, count(*)
  from public.analytics_events e
  join public.businesses b on b.id = e.business_id
  where e.business_id = p_business_id
    -- how far back the insights go is part of the plan (admins are not limited)
    and e.occurred_at > now() - make_interval(days => least(
          greatest(coalesce(p_days, 14), 1),
          case when public.is_admin() then 366 else coalesce(public.business_plan_limit(p_business_id, 'insights_days'), 30) end
        ))
  group by 1, 2
  order by 1, 2
$$;

-- ── 14. Public profile view ─────────────────────────────────────────────────────────────────

-- `profiles` is readable only by its owner and admins (0004): it holds role, status, home
-- area, bio and the exact score. Everybody else gets this view: just the columns needed to
-- render an author chip next to a review or a live update (name, avatar, level).
-- It is deliberately NOT security_invoker — it must bypass the owner-only row policy — which
-- the Supabase linter reports as "security definer view". That is the intent here; the column
-- list is the access control. Do not add columns without thinking about that.
-- (Display names are therefore public: anyone can read the name/level of any account id.)
create or replace view public.public_profiles as
select
  p.id,
  p.display_name,
  p.avatar_url,
  p.level,
  public.level_name(p.level) as level_name,
  (p.role = 'business') as is_business,
  p.is_sample
from public.profiles p;

comment on view public.public_profiles is
  'Author chip: id, display name, avatar, level. No role/status/home_area/bio/points. Intentionally not security_invoker.';

-- ── 15. Read RPCs (SECURITY INVOKER: RLS applies) ───────────────────────────────────────────

-- Businesses within p_radius_m of a point, nearest first.
--   p_category_ids  NULL / empty = any category; otherwise primary or secondary category match
--   p_open_only     keep only businesses known to be open now (unknown hours are excluded)
-- Uses ST_DWithin on geography (GiST index) and returns the geodesic distance in metres.
create or replace function public.nearby_businesses(
  p_lat          double precision,
  p_lon          double precision,
  p_radius_m     integer default 2000,
  p_category_ids text[] default null,
  p_open_only    boolean default false,
  p_limit        integer default 50,
  p_offset       integer default 0
)
returns table (
  id                   uuid,
  osm_ref              text,
  place_ref            text,
  name                 text,
  category_id          text,
  category_ids         text[],
  lat                  double precision,
  lon                  double precision,
  distance_m           double precision,
  address              text,
  locality             text,
  phone                text,
  website              text,
  opening_hours        text,
  price_level          smallint,
  rating_avg           numeric,
  rating_count         integer,
  verification_status  public.verification_status,
  is_claimed           boolean,
  is_open              boolean,
  availability_status  public.availability_status,
  availability_note    text,
  availability_updated_at timestamptz,
  is_sample            boolean
)
language sql
stable
set search_path = ''
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography as g
  )
  select
    b.id,
    b.osm_ref,
    coalesce(b.osm_ref, 'l_' || b.id::text),
    b.name,
    b.category_id,
    array(select bc.category_id from public.business_categories bc where bc.business_id = b.id order by (bc.category_id = b.category_id) desc, bc.category_id),
    b.lat,
    b.lon,
    extensions.st_distance(b.location, o.g),
    b.address,
    b.locality,
    b.phone,
    b.website,
    b.opening_hours,
    b.price_level,
    b.rating_avg,
    b.rating_count,
    b.verification_status,
    b.owner_id is not null,
    open_state.is_open,
    b.availability_status,
    b.availability_note,
    b.availability_updated_at,
    b.is_sample
  from public.businesses b
  cross join origin o
  join public.categories c on c.id = b.category_id and c.enabled
  cross join lateral (select public.is_business_open(b.id) as is_open) open_state
  where p_lat between -90 and 90
    and p_lon between -180 and 180
    and b.deleted_at is null
    and b.moderation = 'visible'
    and extensions.st_dwithin(b.location, o.g, least(greatest(coalesce(p_radius_m, 2000), 50), 50000))
    and (
      p_category_ids is null
      or cardinality(p_category_ids) = 0
      or exists (
        select 1 from public.business_categories bc
        where bc.business_id = b.id and bc.category_id = any (p_category_ids)
      )
    )
    and (not coalesce(p_open_only, false) or open_state.is_open is true)
  order by extensions.st_distance(b.location, o.g), b.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Name search with typo tolerance.
--   • names are compared in normalize_text() form (accents folded, case-insensitive);
--   • a row matches BY NAME when the whole name is trigram-similar to the query (`%`), when the
--     query is similar to some stretch of the name (`%>`, word similarity: "cofee day" finds
--     "Cafe Coffee Day"), or when the name contains the query. All three are served by the GIN
--     trigram index on businesses.search_name (= normalize_text(name), stored). The similarity
--     thresholds are lowered for this function only (SET below), which keeps the operators —
--     and therefore the index — usable;
--   • a row matches BY CATEGORY when the query names a category ("pharmacy", "petrol" →
--     medical-stores, petrol-pumps) by label, singular or keyword. This branch only runs when a
--     position is given ("every pharmacy anywhere" is not a useful answer) and is driven by the
--     GiST index on location.
-- How it is written matters for the planner:
--   • the two branches are arms of a UNION, because an OR across them would rule out both indexes;
--   • the normalised query and the origin are read through scalar sub-selects (`(select nq from
--     q)`), which makes them one-time parameters that an index scan can use as its search key.
-- p_lat / p_lon are optional: without them the name search is not limited by distance.
create or replace function public.search_businesses(
  p_q        text,
  p_lat      double precision default null,
  p_lon      double precision default null,
  p_radius_m integer default 5000,
  p_limit    integer default 30
)
returns table (
  id                   uuid,
  osm_ref              text,
  place_ref            text,
  name                 text,
  category_id          text,
  lat                  double precision,
  lon                  double precision,
  distance_m           double precision,
  address              text,
  price_level          smallint,
  rating_avg           numeric,
  rating_count         integer,
  verification_status  public.verification_status,
  match_score          real,
  matched_category     boolean
)
language sql
stable
set search_path = ''
set pg_trgm.similarity_threshold = 0.3
set pg_trgm.word_similarity_threshold = 0.45
as $$
  with q as materialized (
    select public.normalize_text(p_q) as nq
  ),
  origin as materialized (
    select
      case
        when p_lat between -90 and 90 and p_lon between -180 and 180
          then extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography
      end as g,
      least(greatest(coalesce(p_radius_m, 5000), 50), 50000)::double precision as radius
  ),
  cats as materialized (
    select c.id
    from public.categories c
    where c.enabled
      and char_length((select nq from q)) >= 3
      and (
        (select nq from q) = any (c.keywords)
        or public.normalize_text(c.label) operator(extensions.%) (select nq from q)
        or public.normalize_text(c.singular) operator(extensions.%) (select nq from q)
        or exists (select 1 from unnest(c.keywords) k where extensions.similarity(k, (select nq from q)) >= 0.6)
      )
  ),
  hits as (
    select b.id
    from public.businesses b
    where b.deleted_at is null
      and char_length((select nq from q)) >= 2
      and ((select g from origin) is null or extensions.st_dwithin(b.location, (select g from origin), (select radius from origin)))
      and (
        b.search_name operator(extensions.%) (select nq from q)
        or b.search_name operator(extensions.%>) (select nq from q)
        or b.search_name like '%' || (select nq from q) || '%'
      )
    union
    select b.id
    from public.businesses b
    where b.deleted_at is null
      and extensions.st_dwithin(b.location, (select g from origin), (select radius from origin))
      and b.category_id in (select cats.id from cats)
  )
  select
    b.id,
    b.osm_ref,
    coalesce(b.osm_ref, 'l_' || b.id::text),
    b.name,
    b.category_id,
    b.lat,
    b.lon,
    case when o.g is not null then extensions.st_distance(b.location, o.g) end,
    b.address,
    b.price_level,
    b.rating_avg,
    b.rating_count,
    b.verification_status,
    greatest(
      extensions.similarity(b.search_name, q.nq),
      extensions.word_similarity(q.nq, b.search_name)
    )::real,
    b.category_id in (select cats.id from cats)
  from hits h
  join public.businesses b on b.id = h.id
  cross join q
  cross join origin o
  where b.moderation = 'visible'
    and (o.g is null or extensions.st_dwithin(b.location, o.g, o.radius))
  order by
    greatest(
      extensions.similarity(b.search_name, q.nq),
      extensions.word_similarity(q.nq, b.search_name)
    ) desc,
    case when o.g is not null then extensions.st_distance(b.location, o.g) end asc nulls last,
    b.rating_count desc,
    b.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

-- Current community reports around a point, with the derived fields of ReportView.
-- Only visible, non-deleted, UNEXPIRED reports are returned (the same predicate as the public
-- RLS policy; repeated here so the function is correct on its own).
-- `refreshed_at` is what the frontend calls CommunityReport.updatedAt.
create or replace function public.nearby_reports(
  p_lat      double precision,
  p_lon      double precision,
  p_radius_m integer default 12000,
  p_limit    integer default 200
)
returns table (
  id                   uuid,
  type                 public.report_type,
  level                public.report_level,
  title                text,
  note                 text,
  value                numeric,
  business_id          uuid,
  place_ref            text,
  place_name           text,
  category_id          text,
  lat                  double precision,
  lon                  double precision,
  area_label           text,
  created_at           timestamptz,
  refreshed_at         timestamptz,
  expires_at           timestamptz,
  source               public.report_source,
  reporter_id          uuid,
  reporter_name        text,
  reporter_level       text,
  reporter_reputation  smallint,
  confirm_count        integer,
  dispute_count        integer,
  helpful_count        integer,
  verification         text,     -- business_confirmed | community_verified | unverified | disputed
  freshness            text,     -- live | recent
  confidence           numeric,  -- 0–1
  distance_m           double precision,
  my_vote              text,     -- 'confirm' | 'disagree' | null (always null for anonymous callers)
  my_helpful           boolean,
  is_sample            boolean
)
language sql
stable
set search_path = ''
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography as g
  ),
  cfg as (
    select coalesce((select c.min_confirmations_for_verified from public.app_config c limit 1), 3) as min_confirmations
  )
  select
    r.id,
    r.type,
    r.level,
    r.title,
    r.note,
    r.value,
    r.business_id,
    case when b.id is not null then coalesce(b.osm_ref, 'l_' || b.id::text) end,
    b.name,
    b.category_id,
    r.lat,
    r.lon,
    r.area_label,
    r.created_at,
    r.refreshed_at,
    r.expires_at,
    r.source,
    r.reporter_id,
    case when r.source = 'business' then coalesce(b.name, p.display_name, 'Business') else coalesce(p.display_name, 'Neighbour') end,
    case when r.source = 'business' then 'Business' else coalesce(p.level_name, 'Explorer') end,
    r.reporter_reputation,
    r.confirm_count,
    r.dispute_count,
    r.helpful_count,
    public.report_verification(r.source, r.confirm_count, r.dispute_count, cfg.min_confirmations),
    public.report_freshness(r.refreshed_at, r.expires_at, now()),
    public.report_confidence(r.source, r.reporter_reputation, r.confirm_count, r.dispute_count, r.refreshed_at, r.expires_at, now()),
    extensions.st_distance(r.location, o.g),
    case
      when exists (select 1 from public.report_confirmations rc where rc.report_id = r.id and rc.user_id = (select auth.uid())) then 'confirm'
      when exists (select 1 from public.report_votes rv where rv.report_id = r.id and rv.user_id = (select auth.uid()) and rv.kind = 'disagree') then 'disagree'
    end,
    exists (select 1 from public.report_votes rv where rv.report_id = r.id and rv.user_id = (select auth.uid()) and rv.kind = 'helpful'),
    r.is_sample
  from public.community_reports r
  cross join origin o
  cross join cfg
  left join public.businesses b on b.id = r.business_id
  left join public.public_profiles p on p.id = r.reporter_id
  where p_lat between -90 and 90
    and p_lon between -180 and 180
    and r.deleted_at is null
    and r.moderation = 'visible'
    and r.expires_at > now()
    and extensions.st_dwithin(r.location, o.g, least(greatest(coalesce(p_radius_m, 12000), 50), 50000))
  order by
    (r.dispute_count >= greatest(2, r.confirm_count + 1)),   -- disputed last, as in the local feed
    r.refreshed_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

-- Visible reviews of a business with the author chip, photos and the caller's own "helpful" mark.
create or replace function public.business_reviews(p_business_id uuid, p_limit integer default 30, p_offset integer default 0)
returns table (
  id              uuid,
  business_id     uuid,
  user_id         uuid,
  author_name     text,
  author_level    text,
  rating          smallint,
  aspects         jsonb,
  body            text,
  photos          text[],
  helpful_count   integer,
  owner_reply     text,
  owner_reply_at  timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  my_helpful      boolean,
  is_mine         boolean,
  is_sample       boolean
)
language sql
stable
set search_path = ''
as $$
  select
    r.id,
    r.business_id,
    r.user_id,
    coalesce(p.display_name, 'NearMe user'),
    coalesce(p.level_name, 'Explorer'),
    r.rating,
    r.aspects,
    r.body,
    array(select rp.storage_path from public.review_photos rp where rp.review_id = r.id order by rp.sort_order),
    r.helpful_count,
    r.owner_reply,
    r.owner_reply_at,
    r.created_at,
    r.updated_at,
    exists (select 1 from public.review_votes rv where rv.review_id = r.id and rv.user_id = (select auth.uid())),
    r.user_id = (select auth.uid()),
    r.is_sample
  from public.reviews r
  left join public.public_profiles p on p.id = r.user_id
  where r.business_id = p_business_id
    and r.deleted_at is null
    and r.moderation = 'visible'
  order by r.created_at desc, r.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Deals that are running right now at businesses near a point.
create or replace function public.nearby_deals(
  p_lat      double precision,
  p_lon      double precision,
  p_radius_m integer default 15000,
  p_limit    integer default 100
)
returns table (
  id           uuid,
  business_id  uuid,
  place_ref    text,
  place_name   text,
  category_id  text,
  group_id     text,
  lat          double precision,
  lon          double precision,
  title        text,
  description  text,
  kind         public.deal_kind,
  badge        text,
  code         text,
  terms        text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  promoted     boolean,
  distance_m   double precision,
  is_saved     boolean,
  is_sample    boolean
)
language sql
stable
set search_path = ''
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography as g
  )
  select
    d.id,
    d.business_id,
    coalesce(b.osm_ref, 'l_' || b.id::text),
    b.name,
    b.category_id,
    c.group_id,
    b.lat,
    b.lon,
    d.title,
    d.description,
    d.kind,
    d.badge,
    d.code,
    d.terms,
    d.starts_at,
    d.ends_at,
    d.promoted,
    extensions.st_distance(b.location, o.g),
    exists (select 1 from public.saved_deals sd where sd.deal_id = d.id and sd.user_id = (select auth.uid())),
    d.is_sample
  from public.deals d
  join public.businesses b on b.id = d.business_id
  join public.categories c on c.id = b.category_id
  cross join origin o
  where p_lat between -90 and 90
    and p_lon between -180 and 180
    and d.deleted_at is null
    and d.moderation = 'visible'
    and d.starts_at <= now()
    and d.ends_at > now()
    and b.deleted_at is null
    and b.moderation = 'visible'
    and extensions.st_dwithin(b.location, o.g, least(greatest(coalesce(p_radius_m, 15000), 50), 50000))
  order by d.promoted desc, extensions.st_distance(b.location, o.g), d.id
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
$$;

-- Approved events near a point that have not ended yet, soonest first.
create or replace function public.nearby_events(
  p_lat      double precision,
  p_lon      double precision,
  p_radius_m integer default 20000,
  p_limit    integer default 100
)
returns table (
  id                uuid,
  title             text,
  description       text,
  kind              public.event_kind,
  venue_name        text,
  business_id       uuid,
  place_ref         text,
  lat               double precision,
  lon               double precision,
  starts_at         timestamptz,
  ends_at           timestamptz,
  price             text,
  organizer_name    text,
  source            public.event_source,
  interested_count  integer,
  distance_m        double precision,
  is_interested     boolean,
  is_sample         boolean
)
language sql
stable
set search_path = ''
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography as g
  )
  select
    e.id,
    e.title,
    e.description,
    e.kind,
    e.venue_name,
    e.business_id,
    case when b.id is not null then coalesce(b.osm_ref, 'l_' || b.id::text) end,
    e.lat,
    e.lon,
    e.starts_at,
    e.ends_at,
    e.price,
    e.organizer_name,
    e.source,
    e.interested_count,
    extensions.st_distance(e.location, o.g),
    exists (select 1 from public.event_interest ei where ei.event_id = e.id and ei.user_id = (select auth.uid())),
    e.is_sample
  from public.events e
  cross join origin o
  left join public.businesses b on b.id = e.business_id
  where p_lat between -90 and 90
    and p_lon between -180 and 180
    and e.deleted_at is null
    and e.moderation = 'visible'
    and e.ends_at > now()
    and extensions.st_dwithin(e.location, o.g, least(greatest(coalesce(p_radius_m, 20000), 50), 50000))
  order by e.starts_at, e.id
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
$$;

-- ── 16. Development helper ──────────────────────────────────────────────────────────────────

-- Remove every row flagged is_sample (and the sample accounts behind them) in one call:
--     select public.purge_sample_data();
-- Returns the number of rows removed per table. Service role / SQL editor only (0004).
create or replace function public.purge_sample_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_n      integer;
begin
  delete from public.notifications where is_sample;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('notifications', v_n);

  delete from public.place_suggestions where is_sample;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('place_suggestions', v_n);

  delete from public.community_reports where is_sample;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('community_reports', v_n);

  delete from public.reviews where is_sample;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('reviews', v_n);

  delete from public.deals where is_sample;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('deals', v_n);

  delete from public.events where is_sample;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('events', v_n);

  delete from public.business_photos where is_sample;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('business_photos', v_n);

  delete from public.user_contributions where is_sample;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('user_contributions', v_n);

  delete from public.subscriptions s using public.businesses b where b.id = s.business_id and b.is_sample;
  delete from public.businesses where is_sample;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('businesses', v_n);

  -- Sample accounts: deleting the auth user cascades to the profile and everything it owns.
  delete from auth.users u using public.profiles p where p.id = u.id and p.is_sample;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('users', v_n);

  return v_result;
end
$$;
