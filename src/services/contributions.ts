import { levelFor, POINTS } from '@/lib/community';
import { uid } from '@/lib/utils';
import type { Contribution, ContributionKind, UserProfile } from '@/types';
import { localDb } from './backend/localDb';

export interface ContributionSummary {
  points: number;
  pendingPoints: number;
  level: ReturnType<typeof levelFor>;
  counts: Record<ContributionKind, number>;
  verified: number;
  pending: number;
  rejected: number;
  reputation: number;
  badges: { id: string; name: string; description: string; icon: string; earned: boolean; progress: string }[];
}

const emptyCounts = (): Record<ContributionKind, number> => ({
  review: 0, report: 0, confirm: 0, photo: 0, place: 0, edit: 0, event: 0, closed: 0, category: 0, missing: 0,
});

function summarise(list: Contribution[]): ContributionSummary {
  const counts = emptyCounts();
  let points = 0;
  let pendingPoints = 0;
  let verified = 0;
  let pending = 0;
  let rejected = 0;
  for (const c of list) {
    if (c.status === 'rejected') {
      rejected++;
      continue;
    }
    counts[c.kind]++;
    if (c.status === 'verified') {
      verified++;
      points += c.points;
    } else {
      pending++;
      pendingPoints += c.points;
    }
  }
  const level = levelFor(points);
  const badge = (id: string, name: string, description: string, icon: string, have: number, need: number) => ({
    id, name, description, icon, earned: have >= need, progress: `${Math.min(have, need)} / ${need}`,
  });
  return {
    points,
    pendingPoints,
    level,
    counts,
    verified,
    pending,
    rejected,
    // Reputation rewards verified work and is pulled down hard by rejected contributions.
    reputation: Math.max(5, Math.min(100, 40 + verified * 3 - rejected * 12)),
    badges: [
      badge('first-review', 'First word', 'Wrote a first review', 'PenLine', counts.review, 1),
      badge('critic', 'Local critic', 'Reviewed 10 places', 'Star', counts.review, 10),
      badge('reporter', 'On the ground', 'Shared 5 live updates', 'Radio', counts.report, 5),
      badge('eagle-eye', 'Eagle eye', 'Confirmed 10 updates from others', 'Eye', counts.confirm, 10),
      badge('shutterbug', 'Shutterbug', 'Added 3 photos', 'Camera', counts.photo, 3),
      badge('mapmaker', 'Mapmaker', 'Added or fixed 3 places', 'MapPinPlus', counts.place + counts.edit + counts.missing + counts.closed, 3),
      badge('trusted', 'Trusted voice', 'Reached Neighborhood Expert', 'ShieldCheck', level.index, 2),
    ],
  };
}

export const contributionsService = {
  /**
   * Record a contribution. `dedupeKey` prevents the same action from being rewarded twice
   * (re-confirming a report, re-posting the same update, editing an existing review).
   */
  async record(
    user: UserProfile,
    kind: ContributionKind,
    title: string,
    opts: { refId?: string; placeId?: string; status?: Contribution['status']; bonus?: number } = {},
  ): Promise<Contribution | null> {
    await localDb.ready();
    const existing = opts.refId ? localDb.get().contributions.find((c) => c.userId === user.id && c.kind === kind && c.refId === opts.refId) : undefined;
    if (existing) return null;
    const item: Contribution = {
      id: uid('contrib'),
      userId: user.id,
      kind,
      title,
      points: POINTS[kind] + (opts.bonus ?? 0),
      status: opts.status ?? 'pending',
      refId: opts.refId,
      placeId: opts.placeId,
      createdAt: Date.now(),
    };
    localDb.set((s) => ({ contributions: [item, ...s.contributions] }));
    return item;
  },

  async setStatusByRef(refId: string, status: Contribution['status'], kind?: ContributionKind) {
    await localDb.ready();
    localDb.set((s) => ({
      contributions: s.contributions.map((c) => (c.refId === refId && (!kind || c.kind === kind) ? { ...c, status } : c)),
    }));
  },

  async removeByRef(userId: string, refId: string, kind: ContributionKind) {
    await localDb.ready();
    localDb.set((s) => ({ contributions: s.contributions.filter((c) => !(c.userId === userId && c.refId === refId && c.kind === kind)) }));
  },

  async list(userId: string): Promise<Contribution[]> {
    await localDb.ready();
    return localDb.get().contributions.filter((c) => c.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  },

  async summary(userId: string): Promise<ContributionSummary> {
    return summarise(await this.list(userId));
  },

  /** Synchronous variant for places that already hold the list (e.g. reputation at posting time). */
  summarySync(userId: string): ContributionSummary {
    return summarise(localDb.get().contributions.filter((c) => c.userId === userId));
  },
};
