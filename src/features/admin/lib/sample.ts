import { CATEGORIES } from '@/data/categories';
import { REPORT_TYPES } from '@/lib/community';
import { seeded } from '@/lib/utils';
import type { AdminAnalytics, AdminOverview, DailyPoint, ReportOutcome } from '@/services/admin';
import type { ContributionKind, ModerationState, ReportType } from '@/types';

/**
 * Deterministic sample baseline for the admin charts. Local mode starts with almost no data,
 * so when the "sample data" setting is on these figures are layered on top of the real counts
 * to show what a busy neighbourhood looks like. Every screen that uses them shows a Sample tag
 * and keeps the real count readable. Queues (verification, moderation) never get a baseline:
 * they only ever list things an administrator can actually act on.
 */

const between = (rand: () => number, min: number, max: number) => Math.round(min + rand() * (max - min));

export interface SampleOverview {
  totals: {
    users: number;
    activeUsers7d: number;
    newUsers7d: number;
    businesses: number;
    verifiedBusinesses: number;
    liveReports: number;
    activeDeals: number;
    contributions: number;
  };
  daily: Pick<DailyPoint, 'date' | 'users' | 'contributions'>[];
  reportsByType: { type: ReportType; count: number }[];
  contentByState: Record<ModerationState, number>;
}

const KIND_WEIGHT: Record<ContributionKind, [number, number]> = {
  review: [1900, 2300],
  report: [2600, 3100],
  confirm: [3400, 4100],
  photo: [700, 900],
  place: [130, 190],
  edit: [240, 320],
  event: [90, 140],
  closed: [60, 110],
  category: [20, 40],
  missing: [80, 130],
};

const TYPE_WEIGHT: Record<ReportType, [number, number]> = {
  queue: [420, 520],
  wait_time: [360, 440],
  availability: [300, 380],
  parking: [330, 410],
  traffic: [380, 470],
  road: [150, 210],
  closure: [110, 160],
  event: [70, 120],
  price: [180, 240],
  outage: [90, 140],
  service: [140, 200],
};

function sampleKinds(): { kind: ContributionKind; count: number }[] {
  const rand = seeded('nearme-admin:kinds');
  return (Object.keys(KIND_WEIGHT) as ContributionKind[]).map((kind) => ({ kind, count: between(rand, ...KIND_WEIGHT[kind]) }));
}

function sampleReportTypes(): { type: ReportType; count: number }[] {
  const rand = seeded('nearme-admin:report-types');
  return REPORT_TYPES.map((t) => ({ type: t.type, count: between(rand, ...TYPE_WEIGHT[t.type]) }));
}

/** One day's sample activity depends only on its date, so the series is stable as days roll over. */
function sampleDay(date: string): { users: number; contributions: number } {
  const rand = seeded(`nearme-admin:day:${date}`);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const weekend = weekday === 0 || weekday === 6 ? 1.3 : 1;
  return { users: Math.round(between(rand, 7, 18) * weekend), contributions: Math.round(between(rand, 240, 420) * weekend) };
}

export function sampleOverview(real: AdminOverview): SampleOverview {
  const rand = seeded('nearme-admin:overview');
  const daily = real.daily.map((p) => ({ date: p.date, ...sampleDay(p.date) }));
  const users = between(rand, 1700, 2100);
  const businesses = between(rand, 190, 240);
  return {
    totals: {
      users,
      activeUsers7d: Math.round(users * (0.3 + rand() * 0.06)),
      newUsers7d: daily.slice(-7).reduce((n, p) => n + p.users, 0),
      businesses,
      verifiedBusinesses: Math.round(businesses * (0.58 + rand() * 0.08)),
      liveReports: between(rand, 38, 62),
      activeDeals: between(rand, 28, 46),
      contributions: sampleKinds().reduce((n, k) => n + k.count, 0),
    },
    daily,
    reportsByType: sampleReportTypes(),
    contentByState: { visible: between(rand, 5200, 5800), pending: between(rand, 40, 70), hidden: between(rand, 90, 140) },
  };
}

export function sampleAnalytics(): AdminAnalytics {
  const rand = seeded('nearme-admin:analytics');
  const reportsByOutcome = sampleReportTypes().map(({ type, count }) => {
    const verified = Math.round(count * (0.52 + rand() * 0.12));
    const disputed = Math.round(count * (0.04 + rand() * 0.04));
    const awaiting = Math.round(count * (0.03 + rand() * 0.03));
    const row: Record<ReportOutcome, number> = { verified, disputed, awaiting, expired: Math.max(0, count - verified - disputed - awaiting) };
    return { type, ...row, total: count };
  });

  const topCategories = ['restaurants', 'cafes', 'salons', 'medical-stores', 'grocery', 'gyms', 'bakeries', 'clinics', 'car-repair', 'clothing']
    .filter((id) => CATEGORIES.some((c) => c.id === id))
    .map((categoryId, i) => ({ categoryId, count: between(rand, 34 - i * 3, 44 - i * 3) }))
    .sort((a, b) => b.count - a.count);

  const ratingHistogram = [between(rand, 60, 90), between(rand, 110, 150), between(rand, 290, 350), between(rand, 640, 720), between(rand, 820, 900)];
  const reviewCount = ratingHistogram.reduce((n, v) => n + v, 0);
  const weighted = ratingHistogram.reduce((n, v, i) => n + v * (i + 1), 0);

  return {
    contributionsByKind: sampleKinds(),
    reportsByOutcome,
    topCategories,
    ratingHistogram,
    reviewCount,
    averageRating: Math.round((weighted / reviewCount) * 10) / 10,
  };
}
