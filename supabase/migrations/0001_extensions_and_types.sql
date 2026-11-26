-- ════════════════════════════════════════════════════════════════════════════════════════════
-- NearMe · 0001 · Extensions, enum types and text-search helpers
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Target: Supabase (PostgreSQL 15+). Safe to re-run: every statement is guarded.
--
-- Convention used by every migration in this folder
--   • Extensions live in the `extensions` schema (the Supabase convention). All references to
--     PostGIS / pg_trgm / unaccent objects are schema-qualified (`extensions.st_dwithin`,
--     `operator(extensions.%)` …) so that functions can run with `search_path = ''`.
--   • Application objects live in `public` and are always written as `public.<name>`.
-- ════════════════════════════════════════════════════════════════════════════════════════════

create schema if not exists extensions;

create extension if not exists postgis  with schema extensions;  -- geography(Point,4326), ST_DWithin, KNN
create extension if not exists pg_trgm  with schema extensions;  -- similarity(), %, <% : typo-tolerant search
create extension if not exists unaccent with schema extensions;  -- "Café" matches "cafe"
create extension if not exists pgcrypto with schema extensions;  -- digest()/crypt(); gen_random_uuid() itself is core since PG13

-- Fail early, with a readable message, if an extension was previously enabled into another
-- schema (e.g. `public`). Everything below assumes `extensions.<fn>`.
do $$
declare
  r record;
begin
  for r in
    select e.extname, n.nspname
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname in ('postgis', 'pg_trgm', 'unaccent')
      and n.nspname <> 'extensions'
  loop
    raise exception
      'Extension "%" is installed in schema "%", but the NearMe migrations expect it in schema "extensions".', r.extname, r.nspname
      using hint = 'On a fresh project: drop the extension and re-run this migration, which creates it in "extensions". (pg_trgm and unaccent can also be moved with ALTER EXTENSION ... SET SCHEMA extensions; postgis cannot.)';
  end loop;
end
$$;

-- ── Enum types ──────────────────────────────────────────────────────────────────────────────
-- `create type` has no IF NOT EXISTS, so each one is wrapped. The value lists mirror the string
-- unions in src/types/index.ts exactly; keep the two in sync (add values with
-- `alter type … add value if not exists '…'` in a new migration, never by editing this file).

do $$ begin create type public.user_role as enum ('user', 'business', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin create type public.account_status as enum ('active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin create type public.moderation_state as enum ('visible', 'pending', 'hidden');
exception when duplicate_object then null; end $$;

do $$ begin create type public.ui_tone as enum ('brand', 'sage', 'butter', 'clay', 'forest', 'danger', 'success', 'sand');
exception when duplicate_object then null; end $$;

do $$ begin create type public.travel_mode as enum ('car', 'bike', 'foot');
exception when duplicate_object then null; end $$;

-- Community intelligence
do $$ begin create type public.report_type as enum
  ('queue', 'wait_time', 'availability', 'parking', 'traffic', 'road', 'closure', 'event', 'price', 'outage', 'service');
exception when duplicate_object then null; end $$;

do $$ begin create type public.report_level as enum ('good', 'moderate', 'bad', 'info');
exception when duplicate_object then null; end $$;

do $$ begin create type public.report_source as enum ('community', 'business');
exception when duplicate_object then null; end $$;

-- "confirm" is its own table (report_confirmations); these are the other reactions.
do $$ begin create type public.report_vote_kind as enum ('disagree', 'helpful', 'flag');
exception when duplicate_object then null; end $$;

-- Deals & events
do $$ begin create type public.deal_kind as enum ('discount', 'offer', 'happy_hour', 'seasonal', 'event', 'limited');
exception when duplicate_object then null; end $$;

do $$ begin create type public.event_kind as enum
  ('music', 'market', 'sports', 'community', 'food', 'workshop', 'culture', 'wellness');
exception when duplicate_object then null; end $$;

do $$ begin create type public.event_source as enum ('community', 'business');
exception when duplicate_object then null; end $$;

-- Notifications
do $$ begin create type public.notification_kind as enum
  ('deal', 'saved', 'availability', 'event', 'community', 'favorite', 'system');
exception when duplicate_object then null; end $$;

do $$ begin create type public.notification_frequency as enum ('instant', 'hourly', 'daily');
exception when duplicate_object then null; end $$;

-- Contributions
do $$ begin create type public.contribution_kind as enum
  ('review', 'report', 'confirm', 'photo', 'place', 'edit', 'event', 'closed', 'category', 'missing');
exception when duplicate_object then null; end $$;

do $$ begin create type public.contribution_status as enum ('pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin create type public.suggestion_kind as enum ('add', 'edit', 'closed', 'missing', 'category', 'photo');
exception when duplicate_object then null; end $$;

do $$ begin create type public.suggestion_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- Business portal.
-- 'unclaimed' is the state of a row created lazily from OpenStreetMap that nobody owns yet; the
-- other five values are the frontend's VerificationStatus for owner-managed listings.
do $$ begin create type public.verification_status as enum
  ('unclaimed', 'draft', 'submitted', 'in_review', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin create type public.claim_status as enum ('pending', 'in_review', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin create type public.availability_status as enum ('open', 'busy', 'limited', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin create type public.plan_id as enum ('free', 'plus', 'pro');
exception when duplicate_object then null; end $$;

do $$ begin create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin create type public.analytics_kind as enum
  ('view', 'impression', 'direction', 'call', 'save', 'share', 'website');
exception when duplicate_object then null; end $$;

-- Moderation
do $$ begin create type public.moderation_target as enum
  ('review', 'report', 'deal', 'event', 'business', 'user', 'place');
exception when duplicate_object then null; end $$;

do $$ begin create type public.moderation_status as enum ('open', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- ── Text-search helpers (needed by the trigram indexes in 0002) ─────────────────────────────

-- unaccent() is only STABLE (its dictionary could change), so it cannot be used in an index
-- expression directly. Pinning the dictionary by name makes an IMMUTABLE wrapper legitimate.
create or replace function public.immutable_unaccent(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_text)
$$;

comment on function public.immutable_unaccent(text) is
  'IMMUTABLE wrapper around unaccent() with a pinned dictionary, so it can be used in index expressions.';

-- Canonical form used for every name comparison: accents folded, lower-cased, punctuation
-- collapsed to single spaces. Only letters, digits and spaces survive, which also means the
-- result never contains LIKE wildcards (% _ \) and can be embedded in a LIKE pattern safely.
-- [[:alnum:]] is Unicode-aware, so Kannada / Devanagari / Tamil names are preserved.
create or replace function public.normalize_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(lower(public.immutable_unaccent(coalesce(p_text, ''))), '[^[:alnum:]]+', ' ', 'g'))
$$;

comment on function public.normalize_text(text) is
  'Search normal form: unaccent + lower + non-alphanumerics collapsed to one space. Indexed with gin_trgm_ops.';
