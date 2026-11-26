import { z } from 'zod';
import { CATEGORIES, CATEGORY_BY_ID } from '@/data/categories';
import { deriveReport, REPORT_TYPES } from '@/lib/community';
import { hasBackend } from '@/lib/env';
import { DAY } from '@/lib/time';
import type {
  AdminConfig, BusinessListing, ContributionKind, Deal, EventItem, ModerationItem, ModerationState, ModerationTarget, PlaceSuggestion, PlanId,
  ReportType, ReportView, Review, Role, UserProfile,
} from '@/types';
import { DEFAULT_CONFIG, localDb, type LocalDbState } from './backend/localDb';
import { contributionsService } from './contributions';
import { notificationsService } from './notifications';
import { savedService } from './saved';

/**
 * Admin data access. In local mode every function reads and writes the on-device store
 * (`localDb`), which is the same data the consumer app and the business portal use, so a
 * decision made here is visible there immediately. With a backend these become RPC calls
 * guarded by Row Level Security; the function signatures are the contract the UI relies on.
 *
 * Nothing returned from this module is sample data.
 */

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminError';
  }
}

/* ── Configuration schema ───────────────────────────────────────────────── */

const minutes = z
  .number('Enter whole minutes')
  .int('Use whole minutes')
  .min(5, 'Use at least 5 minutes')
  .max(10_080, 'Use at most 10,080 minutes (7 days)');

const count = (min: number, max: number) =>
  z.number('Enter a number').int('Use a whole number').min(min, `Use ${min} or more`).max(max, `Use ${max} or fewer`);

export const adminConfigSchema = z.object({
  expiryMinutes: z.object({
    queue: minutes,
    wait_time: minutes,
    availability: minutes,
    parking: minutes,
    traffic: minutes,
    road: minutes,
    closure: minutes,
    event: minutes,
    price: minutes,
    outage: minutes,
    service: minutes,
  }),
  minConfirmationsForVerified: count(1, 20),
  maxReportsPerHour: count(1, 60),
  disagreementsToHide: count(2, 50),
  disabledCategoryIds: z.array(z.string()),
  featuredCategoryIds: z.array(z.string()),
  dealsRequireApproval: z.boolean(),
  eventsRequireApproval: z.boolean(),
});

export type AdminConfigInput = z.infer<typeof adminConfigSchema>;

/** The configuration a fresh install starts with, exposed so screens can show each default. */
export const DEFAULT_ADMIN_CONFIG: Readonly<AdminConfig> = DEFAULT_CONFIG;

/* ── View models ────────────────────────────────────────────────────────── */

export interface DailyPoint {
  /** Local calendar day, yyyy-mm-dd. */
  date: string;
  label: string;
  users: number;
  contributions: number;
}

export interface AttentionCounts {
  pendingVerification: number;
  openModeration: number;
  flaggedReviews: number;
  pendingReports: number;
  pendingDeals: number;
  pendingEvents: number;
  pendingSuggestions: number;
  categorySuggestions: number;
}

export interface AdminOverview {
  generatedAt: number;
  totals: {
    users: number;
    activeUsers7d: number;
    newUsers7d: number;
    businesses: number;
    verifiedBusinesses: number;
    categories: number;
    disabledCategories: number;
    liveReports: number;
    pendingVerification: number;
    openModeration: number;
    activeDeals: number;
    contributions: number;
  };
  daily: DailyPoint[];
  reportsByType: { type: ReportType; count: number }[];
  contentByState: Record<ModerationState, number>;
  attention: AttentionCounts;
}

export type ReportOutcome = 'verified' | 'awaiting' | 'disputed' | 'expired';

export interface AdminAnalytics {
  contributionsByKind: { kind: ContributionKind; count: number }[];
  reportsByOutcome: ({ type: ReportType; total: number } & Record<ReportOutcome, number>)[];
  topCategories: { categoryId: string; count: number }[];
  /** Index 0 = 1 star … index 4 = 5 stars. */
  ratingHistogram: number[];
  reviewCount: number;
  averageRating: number | null;
}

export interface AdminUserRow extends UserProfile {
  points: number;
  level: string;
  contributions: number;
  reviews: number;
  reports: number;
  listings: number;
  lastActiveAt: number;
}

export type TargetState = ModerationState | 'missing' | 'external';
export type ModerationAction = 'hide' | 'suspend_listing' | 'suspend_user' | 'none';

export interface ModerationRow extends ModerationItem {
  targetState: TargetState;
  isSampleTarget: boolean;
  /** What "take action" means for this kind of target. */
  action: ModerationAction;
  /** Where the content can be seen in context, when that can be worked out. */
  href?: string;
  /** The flagged text itself, for real content stored on this device. */
  excerpt?: string;
}

/* ── Internals ──────────────────────────────────────────────────────────── */

const SAMPLE_PREFIX = 'sample_';
const isSampleId = (id: string) => id.startsWith(SAMPLE_PREFIX);
const CRED_KEY = 'nearme-local-credentials';

/**
 * Local accounts keep their sign-in credential in localStorage, keyed by email (see auth.ts).
 * When an admin removes an account the credential has to go too, otherwise that email could
 * neither sign in nor register again on this device.
 */
function dropLocalCredentials(userIds: readonly string[]) {
  if (!userIds.length) return;
  try {
    const creds = JSON.parse(localStorage.getItem(CRED_KEY) ?? '{}') as Record<string, { userId?: string }>;
    let changed = false;
    for (const [email, cred] of Object.entries(creds)) {
      if (cred?.userId && userIds.includes(cred.userId)) {
        delete creds[email];
        changed = true;
      }
    }
    if (changed) localStorage.setItem(CRED_KEY, JSON.stringify(creds));
  } catch {
    /* storage blocked or malformed: nothing to clean up */
  }
}

const listingPlaceIds = (l: BusinessListing) => (l.placeId ? [l.placeId, `l_${l.id}`] : [`l_${l.id}`]);

const findListing = (s: LocalDbState, targetId: string) =>
  s.listings.find((l) => l.id === targetId || `l_${l.id}` === targetId || (l.placeId !== undefined && l.placeId === targetId));

function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function attentionCounts(s: LocalDbState): AttentionCounts {
  return {
    pendingVerification: s.listings.filter((l) => l.verification === 'submitted' || l.verification === 'in_review').length,
    openModeration: s.moderation.filter((m) => m.status === 'open').length,
    flaggedReviews: s.reviews.filter((r) => r.flagged.length > 0 && r.moderation !== 'hidden').length,
    pendingReports: s.reports.filter((r) => r.moderation === 'pending').length,
    pendingDeals: s.deals.filter((d) => d.moderation === 'pending').length,
    pendingEvents: s.events.filter((e) => e.moderation === 'pending').length,
    pendingSuggestions: s.suggestions.filter((x) => x.status === 'pending' && x.kind !== 'category').length,
    categorySuggestions: s.suggestions.filter((x) => x.status === 'pending' && x.kind === 'category').length,
  };
}

function targetState(s: LocalDbState, item: ModerationItem): TargetState {
  const id = item.targetId;
  if (isSampleId(id)) return s.hiddenIds.includes(id) ? 'hidden' : 'visible';
  switch (item.targetType) {
    case 'review':
      return s.reviews.find((r) => r.id === id)?.moderation ?? 'missing';
    case 'report':
      return s.reports.find((r) => r.id === id)?.moderation ?? 'missing';
    case 'deal':
      return s.deals.find((d) => d.id === id)?.moderation ?? 'missing';
    case 'event':
      return s.events.find((e) => e.id === id)?.moderation ?? 'missing';
    case 'business': {
      const listing = findListing(s, id);
      return listing ? (listing.verification === 'rejected' ? 'hidden' : 'visible') : 'missing';
    }
    case 'user': {
      const user = s.users.find((u) => u.id === id);
      return user ? (user.status === 'suspended' ? 'hidden' : 'visible') : 'missing';
    }
    default:
      return 'external';
  }
}

function targetContext(s: LocalDbState, item: ModerationItem): Pick<ModerationRow, 'href' | 'excerpt'> {
  const id = item.targetId;
  if (isSampleId(id)) {
    // Sample ids embed the OSM place they were generated for: sample_review_n123_0.
    const place = /^sample_(?:review|report|deal|event)_([nwr]\d+)_/.exec(id)?.[1];
    return { href: place ? `/place/${place}` : undefined };
  }
  switch (item.targetType) {
    case 'review': {
      const r = s.reviews.find((x) => x.id === id);
      return r ? { href: `/place/${r.placeId}`, excerpt: r.text } : {};
    }
    case 'report': {
      const r = s.reports.find((x) => x.id === id);
      return r ? { href: r.placeId ? `/place/${r.placeId}` : undefined, excerpt: r.note ? `${r.title}. ${r.note}` : r.title } : {};
    }
    case 'deal': {
      const d = s.deals.find((x) => x.id === id);
      return d ? { href: `/place/${d.placeId}`, excerpt: `${d.title}. ${d.description}` } : {};
    }
    case 'event': {
      const e = s.events.find((x) => x.id === id);
      return e ? { href: e.placeId ? `/place/${e.placeId}` : undefined, excerpt: `${e.title}. ${e.description}` } : {};
    }
    case 'business':
      return findListing(s, id) ? { href: '/admin/businesses' } : {};
    case 'user':
      return s.users.some((u) => u.id === id) ? { href: '/admin/users' } : {};
    case 'place':
      return { href: `/place/${id}` };
    default:
      return {};
  }
}

function actionFor(item: ModerationItem, state: TargetState): ModerationAction {
  // Nothing left to do to the target itself: it is gone, not ours to change, or already hidden / suspended.
  if (state === 'missing' || state === 'external' || state === 'hidden') return 'none';
  if (isSampleId(item.targetId)) return 'hide';
  switch (item.targetType) {
    case 'review':
    case 'report':
    case 'deal':
    case 'event':
      return 'hide';
    case 'business':
      return 'suspend_listing';
    case 'user':
      return 'suspend_user';
    default:
      return 'none';
  }
}

/** Hide or restore one piece of content. Sample items are immutable, so they go through `hiddenIds`. */
function setContentModeration(type: ModerationTarget, id: string, state: 'hidden' | 'visible') {
  if (isSampleId(id)) {
    localDb.set((s) => ({
      hiddenIds: state === 'hidden' ? (s.hiddenIds.includes(id) ? s.hiddenIds : [...s.hiddenIds, id]) : s.hiddenIds.filter((x) => x !== id),
    }));
    return;
  }
  switch (type) {
    case 'review':
      localDb.set((s) => ({ reviews: s.reviews.map((r) => (r.id === id ? { ...r, moderation: state } : r)) }));
      break;
    case 'report':
      localDb.set((s) => ({ reports: s.reports.map((r) => (r.id === id ? { ...r, moderation: state } : r)) }));
      break;
    case 'deal':
      localDb.set((s) => ({ deals: s.deals.map((d) => (d.id === id ? { ...d, moderation: state } : d)) }));
      break;
    case 'event':
      localDb.set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, moderation: state } : e)) }));
      break;
    default:
      break;
  }
}

/** Close every open flag on a target once an admin has acted on the content itself. */
function closeFlags(targetId: string, resolution: string) {
  const now = Date.now();
  localDb.set((s) => ({
    moderation: s.moderation.map((m) => (m.targetId === targetId && m.status === 'open' ? { ...m, status: 'resolved', resolution, resolvedAt: now } : m)),
  }));
}

function requireNote(note: string | undefined, what: string, min = 5): string {
  const text = (note ?? '').trim();
  if (text.length < min) throw new AdminError(`${what} needs at least ${min} characters.`);
  return text.slice(0, 500);
}

function assertNotSelf(actorId: string, userId: string, verb: string) {
  if (actorId === userId) throw new AdminError(`You cannot ${verb} your own account.`);
}

/* ── Service ────────────────────────────────────────────────────────────── */

export const adminService = {
  mode: hasBackend ? ('supabase' as const) : ('local' as const),

  /* Overview and analytics */

  async overview(now = Date.now()): Promise<AdminOverview> {
    await localDb.ready();
    const s = localDb.get();
    const weekAgo = now - 7 * DAY;

    const known = new Set(s.users.map((u) => u.id));
    const active = new Set<string>();
    for (const u of s.users) if (u.createdAt >= weekAgo) active.add(u.id);
    for (const c of s.contributions) if (c.createdAt >= weekAgo && known.has(c.userId)) active.add(c.userId);
    for (const r of s.reviews) if ((r.updatedAt ?? r.createdAt) >= weekAgo && known.has(r.userId)) active.add(r.userId);
    for (const r of s.reports) if (r.updatedAt >= weekAgo && known.has(r.reporterId)) active.add(r.reporterId);

    const days = 14;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const first = start.getTime() - (days - 1) * DAY;
    const daily: DailyPoint[] = Array.from({ length: days }, (_, i) => {
      const d = new Date(first + i * DAY);
      return { date: isoDay(d), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), users: 0, contributions: 0 };
    });
    const bucket = (at: number) => (at >= first ? daily[Math.floor((at - first) / DAY)] : undefined);
    for (const u of s.users) {
      const p = bucket(u.createdAt);
      if (p) p.users++;
    }
    for (const c of s.contributions) {
      const p = bucket(c.createdAt);
      if (p) p.contributions++;
    }

    const byType = new Map<ReportType, number>();
    for (const r of s.reports) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);

    const contentByState: Record<ModerationState, number> = { visible: 0, pending: 0, hidden: 0 };
    for (const r of s.reviews) contentByState[r.moderation]++;
    for (const r of s.reports) contentByState[r.moderation]++;
    for (const d of s.deals) contentByState[d.moderation]++;
    for (const e of s.events) contentByState[e.moderation]++;

    const attention = attentionCounts(s);
    return {
      generatedAt: now,
      totals: {
        users: s.users.length,
        activeUsers7d: active.size,
        newUsers7d: s.users.filter((u) => u.createdAt >= weekAgo).length,
        businesses: s.listings.length,
        verifiedBusinesses: s.listings.filter((l) => l.verification === 'verified').length,
        categories: CATEGORIES.length,
        disabledCategories: s.config.disabledCategoryIds.filter((id) => CATEGORY_BY_ID[id]).length,
        liveReports: s.reports.filter((r) => r.moderation === 'visible' && r.expiresAt > now).length,
        pendingVerification: attention.pendingVerification,
        openModeration: attention.openModeration,
        activeDeals: s.deals.filter((d) => d.moderation === 'visible' && d.startsAt <= now && d.endsAt > now).length,
        contributions: s.contributions.length,
      },
      daily,
      reportsByType: REPORT_TYPES.map((t) => ({ type: t.type, count: byType.get(t.type) ?? 0 })),
      contentByState,
      attention,
    };
  },

  async attention(): Promise<AttentionCounts> {
    await localDb.ready();
    return attentionCounts(localDb.get());
  },

  async analytics(now = Date.now()): Promise<AdminAnalytics> {
    await localDb.ready();
    const s = localDb.get();

    const kinds = new Map<ContributionKind, number>();
    for (const c of s.contributions) kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1);

    const outcomes = new Map<ReportType, Record<ReportOutcome, number>>();
    for (const raw of s.reports) {
      const r = deriveReport(raw, s.config, now);
      const row = outcomes.get(r.type) ?? { verified: 0, awaiting: 0, disputed: 0, expired: 0 };
      const outcome: ReportOutcome =
        r.verification === 'disputed'
          ? 'disputed'
          : r.verification === 'unverified'
            ? r.freshness === 'expired'
              ? 'expired'
              : 'awaiting'
            : 'verified';
      row[outcome]++;
      outcomes.set(r.type, row);
    }

    const perCategory = new Map<string, number>();
    for (const l of s.listings) perCategory.set(l.categoryId, (perCategory.get(l.categoryId) ?? 0) + 1);

    const ratingHistogram = [0, 0, 0, 0, 0];
    let sum = 0;
    for (const r of s.reviews) {
      ratingHistogram[Math.max(1, Math.min(5, Math.round(r.rating))) - 1]!++;
      sum += r.rating;
    }

    return {
      contributionsByKind: (['review', 'report', 'confirm', 'photo', 'place', 'edit', 'event', 'closed', 'category', 'missing'] as const).map((kind) => ({
        kind,
        count: kinds.get(kind) ?? 0,
      })),
      reportsByOutcome: REPORT_TYPES.map((t) => {
        const row = outcomes.get(t.type) ?? { verified: 0, awaiting: 0, disputed: 0, expired: 0 };
        return { type: t.type, ...row, total: row.verified + row.awaiting + row.disputed + row.expired };
      }),
      topCategories: [...perCategory.entries()].map(([categoryId, n]) => ({ categoryId, count: n })).sort((a, b) => b.count - a.count),
      ratingHistogram,
      reviewCount: s.reviews.length,
      averageRating: s.reviews.length ? Math.round((sum / s.reviews.length) * 10) / 10 : null,
    };
  },

  /* Business listings */

  async listings(): Promise<BusinessListing[]> {
    await localDb.ready();
    return [...localDb.get().listings].sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /** Move a listing through verification. Rejecting (or suspending a verified listing) needs a reason. */
  async reviewListing(id: string, decision: 'in_review' | 'verified' | 'rejected', note?: string): Promise<BusinessListing> {
    await localDb.ready();
    const listing = localDb.get().listings.find((l) => l.id === id);
    if (!listing) throw new AdminError('That listing no longer exists.');
    const reason = decision === 'rejected' ? requireNote(note, 'The reason') : undefined;
    const next: BusinessListing = {
      ...listing,
      verification: decision,
      // The note is what the owner reads in the business portal, so it is cleared on approval.
      verificationNote: decision === 'rejected' ? reason : decision === 'verified' ? undefined : listing.verificationNote,
      updatedAt: Date.now(),
    };
    localDb.set((s) => ({ listings: s.listings.map((l) => (l.id === id ? next : l)) }));

    if (decision === 'verified') {
      await notificationsService.push('system', 'Business verified', `${listing.name} is now a verified business on NearMe. The verified badge shows on its page.`, '/business');
    } else if (decision === 'rejected') {
      await notificationsService.push('system', listing.verification === 'verified' ? 'Listing suspended' : 'Verification was not approved', `${listing.name}: ${reason}`, '/business');
    }
    return next;
  },

  async setListingPlan(id: string, plan: PlanId): Promise<void> {
    await localDb.ready();
    if (!localDb.get().listings.some((l) => l.id === id)) throw new AdminError('That listing no longer exists.');
    localDb.set((s) => ({ listings: s.listings.map((l) => (l.id === id ? { ...l, plan, updatedAt: Date.now() } : l)) }));
  },

  /** Removes the listing together with the deals and analytics that only exist because of it. */
  async deleteListing(id: string): Promise<void> {
    await localDb.ready();
    const listing = localDb.get().listings.find((l) => l.id === id);
    if (!listing) return;
    const placeIds = listingPlaceIds(listing);
    localDb.set((s) => ({
      listings: s.listings.filter((l) => l.id !== id),
      deals: s.deals.filter((d) => !(d.ownerId === listing.ownerId && placeIds.includes(d.placeId))),
      analytics: s.analytics.filter((e) => !placeIds.includes(e.placeId)),
    }));
    closeFlags(id, 'Listing deleted by an administrator.');
  },

  /* Users */

  async users(): Promise<AdminUserRow[]> {
    await localDb.ready();
    const s = localDb.get();
    return s.users
      .map((u) => {
        const summary = contributionsService.summarySync(u.id);
        const mine = s.contributions.filter((c) => c.userId === u.id);
        return {
          ...u,
          status: u.status ?? 'active',
          points: summary.points,
          level: summary.level.name,
          contributions: mine.length,
          reviews: s.reviews.filter((r) => r.userId === u.id).length,
          reports: s.reports.filter((r) => r.reporterId === u.id).length,
          listings: s.listings.filter((l) => l.ownerId === u.id).length,
          lastActiveAt: mine.reduce((latest, c) => Math.max(latest, c.createdAt), u.createdAt),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async setUserRole(actorId: string, userId: string, role: Role): Promise<void> {
    await localDb.ready();
    assertNotSelf(actorId, userId, 'change the role of');
    if (!localDb.get().users.some((u) => u.id === userId)) throw new AdminError('That account no longer exists.');
    localDb.set((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, role } : u)) }));
  },

  async setUserStatus(actorId: string, userId: string, status: NonNullable<UserProfile['status']>): Promise<void> {
    await localDb.ready();
    assertNotSelf(actorId, userId, status === 'suspended' ? 'suspend' : 'change the status of');
    if (!localDb.get().users.some((u) => u.id === userId)) throw new AdminError('That account no longer exists.');
    localDb.set((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, status } : u)) }));
  },

  /** Removes the account and what it wrote. Listings it owns are kept so they can be reassigned or removed on purpose. */
  async deleteUser(actorId: string, userId: string): Promise<void> {
    await localDb.ready();
    assertNotSelf(actorId, userId, 'delete');
    localDb.set((s) => ({
      users: s.users.filter((u) => u.id !== userId),
      reviews: s.reviews.filter((r) => r.userId !== userId),
      reports: s.reports.filter((r) => r.reporterId !== userId),
      contributions: s.contributions.filter((c) => c.userId !== userId),
      suggestions: s.suggestions.filter((x) => x.userId !== userId),
    }));
    dropLocalCredentials([userId]);
    closeFlags(userId, 'Account deleted by an administrator.');
  },

  /* Configuration and categories */

  async config(): Promise<AdminConfig> {
    await localDb.ready();
    return localDb.get().config;
  },

  async updateConfig(patch: Partial<AdminConfig>): Promise<AdminConfig> {
    await localDb.ready();
    const current = localDb.get().config;
    const parsed = adminConfigSchema.safeParse({ ...current, ...patch, expiryMinutes: { ...current.expiryMinutes, ...patch.expiryMinutes } });
    if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? 'That configuration is not valid.');
    const known = (ids: string[]) => [...new Set(ids)].filter((id) => CATEGORY_BY_ID[id]);
    const next: AdminConfig = { ...parsed.data, disabledCategoryIds: known(parsed.data.disabledCategoryIds), featuredCategoryIds: known(parsed.data.featuredCategoryIds) };
    localDb.set({ config: next });
    return next;
  },

  async resetConfig(): Promise<AdminConfig> {
    await localDb.ready();
    const next: AdminConfig = { ...DEFAULT_CONFIG, expiryMinutes: { ...DEFAULT_CONFIG.expiryMinutes }, disabledCategoryIds: [], featuredCategoryIds: [] };
    localDb.set({ config: next });
    return next;
  },

  async setCategoryEnabled(categoryId: string, enabled: boolean): Promise<void> {
    await localDb.ready();
    if (!CATEGORY_BY_ID[categoryId]) throw new AdminError('Unknown category.');
    localDb.set((s) => {
      const rest = s.config.disabledCategoryIds.filter((id) => id !== categoryId);
      return { config: { ...s.config, disabledCategoryIds: enabled ? rest : [...rest, categoryId] } };
    });
  },

  /**
   * Featured categories default to the taxonomy's own picks. The first change copies those
   * defaults into the configuration, after which the configured list is authoritative.
   */
  async setCategoryFeatured(categoryId: string, featured: boolean): Promise<void> {
    await localDb.ready();
    if (!CATEGORY_BY_ID[categoryId]) throw new AdminError('Unknown category.');
    localDb.set((s) => {
      const rest = effectiveFeaturedIds(s.config).filter((id) => id !== categoryId);
      const next = featured ? [...rest, categoryId] : rest;
      return { config: { ...s.config, featuredCategoryIds: next } };
    });
  },

  async resetFeaturedCategories(): Promise<void> {
    await localDb.ready();
    localDb.set((s) => ({ config: { ...s.config, featuredCategoryIds: [] } }));
  },

  /* Suggestions (new places, edits, closures, categories) */

  async suggestions(scope: 'category' | 'place'): Promise<PlaceSuggestion[]> {
    await localDb.ready();
    return localDb
      .get()
      .suggestions.filter((x) => (scope === 'category' ? x.kind === 'category' : x.kind !== 'category'))
      .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.createdAt - a.createdAt);
  },

  /** Approving credits the contributor; rejecting marks their contribution as rejected. */
  async resolveSuggestion(id: string, decision: 'approved' | 'rejected'): Promise<void> {
    await localDb.ready();
    if (!localDb.get().suggestions.some((x) => x.id === id)) throw new AdminError('That suggestion no longer exists.');
    localDb.set((s) => ({ suggestions: s.suggestions.map((x) => (x.id === id ? { ...x, status: decision } : x)) }));
    await contributionsService.setStatusByRef(id, decision === 'approved' ? 'verified' : 'rejected');
  },

  /* Community reports (live updates) */

  async reports(now = Date.now()): Promise<ReportView[]> {
    await localDb.ready();
    const s = localDb.get();
    return s.reports.map((r) => deriveReport(r, s.config, now)).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async setReportModeration(id: string, state: 'visible' | 'hidden'): Promise<void> {
    await localDb.ready();
    setContentModeration('report', id, state);
    if (state === 'hidden') closeFlags(id, 'Hidden by an administrator.');
  },

  async deleteReport(id: string): Promise<void> {
    await localDb.ready();
    const report = localDb.get().reports.find((r) => r.id === id);
    if (!report) return;
    localDb.set((s) => ({ reports: s.reports.filter((r) => r.id !== id) }));
    await contributionsService.removeByRef(report.reporterId, id, 'report');
    closeFlags(id, 'Deleted by an administrator.');
  },

  /* Reviews */

  async reviews(): Promise<Review[]> {
    await localDb.ready();
    return [...localDb.get().reviews].sort((a, b) => Number(b.flagged.length > 0) - Number(a.flagged.length > 0) || b.createdAt - a.createdAt);
  },

  async setReviewModeration(id: string, state: 'visible' | 'hidden'): Promise<void> {
    await localDb.ready();
    setContentModeration('review', id, state);
    if (state === 'hidden') closeFlags(id, 'Hidden by an administrator.');
  },

  async deleteReview(id: string): Promise<void> {
    await localDb.ready();
    const review = localDb.get().reviews.find((r) => r.id === id);
    if (!review) return;
    localDb.set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) }));
    await contributionsService.removeByRef(review.userId, id, 'review');
    await contributionsService.removeByRef(review.userId, `${id}:photos`, 'photo');
    closeFlags(id, 'Deleted by an administrator.');
  },

  /* Deals */

  async deals(): Promise<Deal[]> {
    await localDb.ready();
    return [...localDb.get().deals].sort((a, b) => Number(b.moderation === 'pending') - Number(a.moderation === 'pending') || b.startsAt - a.startsAt);
  },

  async setDealModeration(id: string, state: 'visible' | 'hidden'): Promise<void> {
    await localDb.ready();
    setContentModeration('deal', id, state);
    if (state === 'hidden') closeFlags(id, 'Hidden by an administrator.');
  },

  async setDealPromoted(id: string, promoted: boolean): Promise<void> {
    await localDb.ready();
    localDb.set((s) => ({ deals: s.deals.map((d) => (d.id === id ? { ...d, promoted } : d)) }));
  },

  async deleteDeal(id: string): Promise<void> {
    await localDb.ready();
    localDb.set((s) => ({ deals: s.deals.filter((d) => d.id !== id), savedDealIds: s.savedDealIds.filter((x) => x !== id) }));
    closeFlags(id, 'Deleted by an administrator.');
  },

  /* Events */

  async events(): Promise<EventItem[]> {
    await localDb.ready();
    return [...localDb.get().events].sort((a, b) => Number(b.moderation === 'pending') - Number(a.moderation === 'pending') || b.startsAt - a.startsAt);
  },

  /** Showing an event credits whoever submitted it; hiding it withdraws that credit. */
  async setEventModeration(id: string, state: 'visible' | 'hidden'): Promise<void> {
    await localDb.ready();
    setContentModeration('event', id, state);
    await contributionsService.setStatusByRef(id, state === 'visible' ? 'verified' : 'rejected', 'event');
    if (state === 'hidden') closeFlags(id, 'Hidden by an administrator.');
  },

  async deleteEvent(id: string): Promise<void> {
    await localDb.ready();
    const event = localDb.get().events.find((e) => e.id === id);
    if (!event) return;
    localDb.set((s) => ({ events: s.events.filter((e) => e.id !== id), eventInterest: s.eventInterest.filter((x) => x !== id) }));
    if (event.submittedBy) await contributionsService.removeByRef(event.submittedBy, id, 'event');
    closeFlags(id, 'Deleted by an administrator.');
  },

  /* Moderation queue */

  async moderationQueue(): Promise<ModerationRow[]> {
    await localDb.ready();
    const s = localDb.get();
    return s.moderation
      .map((item) => {
        const state = targetState(s, item);
        return { ...item, targetState: state, isSampleTarget: isSampleId(item.targetId), action: actionFor(item, state), ...targetContext(s, item) };
      })
      .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt));
  },

  /**
   * Decide a flag.
   *  - `act`: hide the content (or suspend the listing / account) and close every open flag on it.
   *  - `dismiss`: the content is fine. A live update that was held back automatically becomes visible again.
   */
  async resolveModeration(actorId: string, id: string, decision: 'act' | 'dismiss', note: string): Promise<void> {
    await localDb.ready();
    const s = localDb.get();
    const item = s.moderation.find((m) => m.id === id);
    if (!item) throw new AdminError('That item is no longer in the queue.');
    if (item.status !== 'open') throw new AdminError('That item has already been decided.');
    const resolution = requireNote(note, 'The resolution note', 3);
    const now = Date.now();
    const state = targetState(s, item);

    if (decision === 'dismiss') {
      localDb.set((st) => ({ moderation: st.moderation.map((m) => (m.id === id ? { ...m, status: 'dismissed', resolution, resolvedAt: now } : m)) }));
      const othersOpen = s.moderation.some((m) => m.id !== id && m.targetId === item.targetId && m.status === 'open');
      if (item.targetType === 'report' && state === 'pending' && !othersOpen) setContentModeration('report', item.targetId, 'visible');
      return;
    }

    switch (actionFor(item, state)) {
      case 'hide':
        setContentModeration(item.targetType, item.targetId, 'hidden');
        if (item.targetType === 'event' && !isSampleId(item.targetId)) await contributionsService.setStatusByRef(item.targetId, 'rejected', 'event');
        break;
      case 'suspend_listing': {
        const listing = findListing(s, item.targetId);
        if (listing) await this.reviewListing(listing.id, 'rejected', resolution);
        break;
      }
      case 'suspend_user':
        await this.setUserStatus(actorId, item.targetId, 'suspended');
        break;
      default:
        break;
    }
    closeFlags(item.targetId, resolution);
  },

  /** Undo a "hide" decision from the history: the content becomes visible again. */
  async restoreModeratedContent(id: string): Promise<void> {
    await localDb.ready();
    const item = localDb.get().moderation.find((m) => m.id === id);
    if (!item) throw new AdminError('That item no longer exists.');
    setContentModeration(item.targetType, item.targetId, 'visible');
    if (item.targetType === 'event' && !isSampleId(item.targetId)) await contributionsService.setStatusByRef(item.targetId, 'verified', 'event');
    const stamp = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    localDb.set((s) => ({
      moderation: s.moderation.map((m) => (m.id === id ? { ...m, resolution: `${m.resolution ?? 'Hidden'} Restored on ${stamp}.` } : m)),
    }));
  },

  /* Danger zone */

  /**
   * Clears everything stored by the local backend. The signed-in administrator's own account is
   * kept so the session that asked for the reset still works afterwards.
   */
  async resetLocalData(keep?: UserProfile | null): Promise<void> {
    await localDb.ready();
    const removed = localDb.get().users.filter((u) => u.id !== keep?.id).map((u) => u.id);
    localDb.reset();
    if (keep && keep.provider === 'local') localDb.set({ users: [keep] });
    dropLocalCredentials(removed);
    // The consumer app expects the starter collections to exist.
    await savedService.ensureStarters();
  },
};

/** The featured list in effect: the configured one, or the taxonomy defaults until an admin changes it. */
export function effectiveFeaturedIds(config: Pick<AdminConfig, 'featuredCategoryIds'>): string[] {
  return config.featuredCategoryIds.length ? config.featuredCategoryIds : CATEGORIES.filter((c) => c.featured).map((c) => c.id);
}
