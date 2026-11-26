import { sampleReports } from '@/data/sample/reports';
import { deriveReport } from '@/lib/community';
import { approximate, distanceMeters } from '@/lib/geo';
import { reportSchema, type ReportInput } from '@/lib/schemas';
import { HOUR, MIN } from '@/lib/time';
import { uid } from '@/lib/utils';
import type { CommunityReport, LatLon, Place, PlaceWithDistance, ReportView, UserProfile } from '@/types';
import { localDb, toggle } from './backend/localDb';
import { contributionsService } from './contributions';
import { moderationService } from './moderation';

export class ReportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportLimitError';
  }
}

export interface FeedContext {
  places: PlaceWithDistance[];
  center: LatLon;
  areaLabel: string;
  sample: boolean;
  /** Keep recently expired items so the feed can show them, greyed out, under "Earlier". */
  includeExpired?: boolean;
}

function applyOverlay(report: CommunityReport): CommunityReport {
  if (!report.isSample) return report;
  const o = localDb.overlay(report.id);
  if (!o.confirmations.length && !o.disagreements.length && !o.helpful.length && !o.flagged.length) return report;
  return {
    ...report,
    confirmations: [...report.confirmations, ...o.confirmations],
    disagreements: [...report.disagreements, ...o.disagreements],
    helpful: [...report.helpful, ...o.helpful],
    flagged: o.flagged,
  };
}

const rank = (r: ReportView) => (r.freshness === 'expired' ? 2 : 0) + (r.verification === 'disputed' ? 1 : 0);

export const communityService = {
  async feed(ctx: FeedContext): Promise<ReportView[]> {
    await localDb.ready();
    const s = localDb.get();
    const now = Date.now();
    const graceMs = 45 * MIN;

    const real = s.reports.filter((r) => r.moderation === 'visible' && distanceMeters(ctx.center, r) < 12_000);
    const samples = ctx.sample
      ? sampleReports(ctx.places, { center: ctx.center, areaLabel: ctx.areaLabel, now, expiryMinutes: s.config.expiryMinutes })
          .filter((r) => !s.hiddenIds.includes(r.id))
          .map(applyOverlay)
      : [];

    return [...real, ...samples]
      .map((r) => ({ ...deriveReport(r, s.config, now), distance: distanceMeters(ctx.center, r) }))
      // Expired updates are never presented as current: dropped, or kept briefly and marked.
      .filter((r) => r.freshness !== 'expired' || (ctx.includeExpired && now - r.expiresAt < graceMs))
      .sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt);
  },

  async forPlace(place: Place, ctx: Omit<FeedContext, 'places'> & { places?: PlaceWithDistance[] }): Promise<ReportView[]> {
    const places = ctx.places?.length ? ctx.places : [{ ...place, distance: distanceMeters(ctx.center, place) }];
    const feed = await this.feed({ ...ctx, places });
    return feed.filter((r) => r.placeId === place.id);
  },

  async mine(userId: string): Promise<ReportView[]> {
    await localDb.ready();
    const s = localDb.get();
    return s.reports.filter((r) => r.reporterId === userId).map((r) => deriveReport(r, s.config)).sort((a, b) => b.createdAt - a.createdAt);
  },

  /**
   * Post a live update. Guards against spam and score farming:
   *  - a per-hour cap,
   *  - re-posting the same kind of update for the same place refreshes the existing report
   *    instead of creating a second one (and earns nothing extra).
   */
  async submit(
    user: UserProfile,
    input: ReportInput,
    where: { place?: Place; location: LatLon; areaLabel: string; asBusiness?: boolean },
  ): Promise<{ report: CommunityReport; refreshed: boolean }> {
    const data = reportSchema.parse(input);
    await localDb.ready();
    const s = localDb.get();
    const now = Date.now();
    const ttl = s.config.expiryMinutes[data.type] * MIN;

    const mineActive = s.reports.filter((r) => r.reporterId === user.id);
    const duplicate = mineActive.find(
      (r) =>
        r.type === data.type &&
        r.expiresAt > now &&
        (where.place ? r.placeId === where.place.id : !r.placeId && distanceMeters(r, where.location) < 400),
    );

    if (duplicate) {
      const report: CommunityReport = { ...duplicate, ...data, note: data.note || undefined, updatedAt: now, expiresAt: now + ttl };
      localDb.set((st) => ({ reports: st.reports.map((r) => (r.id === duplicate.id ? report : r)) }));
      return { report, refreshed: true };
    }

    if (!where.asBusiness && mineActive.filter((r) => now - r.createdAt < HOUR).length >= s.config.maxReportsPerHour) {
      throw new ReportLimitError(`You can post up to ${s.config.maxReportsPerHour} updates an hour. Thanks for keeping the feed useful.`);
    }

    const summary = contributionsService.summarySync(user.id);
    // Privacy: place updates use the place's own position; everything else is coarsened to ~300 m.
    const point = where.place ? { lat: where.place.lat, lon: where.place.lon } : approximate(where.location);
    const report: CommunityReport = {
      id: uid('report'),
      ...data,
      note: data.note || undefined,
      placeId: where.place?.id,
      placeName: where.place?.name,
      categoryId: where.place?.categoryId,
      lat: point.lat,
      lon: point.lon,
      areaLabel: where.place?.name ?? where.areaLabel,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ttl,
      source: where.asBusiness ? 'business' : 'community',
      reporterId: user.id,
      reporterName: where.asBusiness ? (where.place?.name ?? user.name) : user.name,
      reporterLevel: where.asBusiness ? 'Business' : summary.level.name,
      reporterReputation: where.asBusiness ? 90 : summary.reputation,
      confirmations: [],
      disagreements: [],
      helpful: [],
      flagged: [],
      moderation: 'visible',
    };
    localDb.set((st) => ({ reports: [report, ...st.reports].slice(0, 500) }));
    // Pending until someone else confirms it: unverified updates do not earn points.
    if (!where.asBusiness) await contributionsService.record(user, 'report', data.title, { refId: report.id, placeId: where.place?.id, status: 'pending' });
    return { report, refreshed: false };
  },

  /** Confirm or dispute. One vote per person per report; choosing the other side moves the vote. */
  async vote(user: UserProfile, report: ReportView | CommunityReport, side: 'confirm' | 'disagree'): Promise<void> {
    if (report.reporterId === user.id) throw new Error('You cannot vote on your own update.');
    await localDb.ready();
    const apply = (confirmations: string[], disagreements: string[]) => {
      const had = side === 'confirm' ? confirmations.includes(user.id) : disagreements.includes(user.id);
      const c = confirmations.filter((id) => id !== user.id);
      const d = disagreements.filter((id) => id !== user.id);
      if (!had) (side === 'confirm' ? c : d).push(user.id);
      return { confirmations: c, disagreements: d, added: !had };
    };

    let added = false;
    if (report.isSample) {
      const o = localDb.overlay(report.id);
      const next = apply(o.confirmations, o.disagreements);
      added = next.added;
      localDb.setOverlay(report.id, { ...o, confirmations: next.confirmations, disagreements: next.disagreements });
    } else {
      const s = localDb.get();
      const current = s.reports.find((r) => r.id === report.id);
      if (!current) return;
      const next = apply(current.confirmations, current.disagreements);
      added = next.added;
      const hide = next.disagreements.length >= s.config.disagreementsToHide && next.disagreements.length > next.confirmations.length;
      localDb.set((st) => ({
        reports: st.reports.map((r) =>
          r.id === report.id ? { ...r, confirmations: next.confirmations, disagreements: next.disagreements, moderation: hide ? 'pending' : r.moderation } : r,
        ),
      }));
      if (hide) await moderationService.autoFlag({ type: 'report', id: report.id, label: report.title }, 'Disputed by several people');
      // The reporter earns their points once independent people confirm the update.
      if (next.confirmations.length >= 1) await contributionsService.setStatusByRef(report.id, 'verified', 'report');
    }

    if (side === 'confirm' && added)
      await contributionsService.record(user, 'confirm', `Confirmed: ${report.title}`, { refId: `confirm:${report.id}`, placeId: report.placeId, status: 'verified' });
  },

  async toggleHelpful(user: UserProfile, report: ReportView | CommunityReport): Promise<void> {
    await localDb.ready();
    if (report.isSample) {
      const o = localDb.overlay(report.id);
      localDb.setOverlay(report.id, { ...o, helpful: toggle(o.helpful, user.id) });
      return;
    }
    localDb.set((s) => ({ reports: s.reports.map((r) => (r.id === report.id ? { ...r, helpful: toggle(r.helpful, user.id) } : r)) }));
  },

  async flag(user: UserProfile, report: ReportView | CommunityReport, reason: string, note?: string): Promise<boolean> {
    await localDb.ready();
    if (report.isSample) {
      const o = localDb.overlay(report.id);
      if (!o.flagged.includes(user.id)) localDb.setOverlay(report.id, { ...o, flagged: [...o.flagged, user.id] });
    } else {
      localDb.set((s) => ({ reports: s.reports.map((r) => (r.id === report.id && !r.flagged.includes(user.id) ? { ...r, flagged: [...r.flagged, user.id] } : r)) }));
    }
    const { created } = await moderationService.flag(user, { type: 'report', id: report.id, label: `${report.title} · ${report.areaLabel}` }, reason, note);
    return created;
  },

  async remove(user: UserProfile, reportId: string): Promise<void> {
    await localDb.ready();
    const report = localDb.get().reports.find((r) => r.id === reportId);
    if (!report) return;
    if (report.reporterId !== user.id && user.role !== 'admin') throw new Error('You can only remove your own updates.');
    localDb.set((s) => ({ reports: s.reports.filter((r) => r.id !== reportId) }));
    await contributionsService.removeByRef(report.reporterId, reportId, 'report');
  },

  /** Drop long-expired reports from device storage. Called on startup. */
  async prune(): Promise<void> {
    await localDb.ready();
    const cutoff = Date.now() - 24 * HOUR;
    localDb.set((s) => ({ reports: s.reports.filter((r) => r.expiresAt > cutoff) }));
  },
};
