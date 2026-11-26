import { DAY } from '@/lib/time';
import { uid } from '@/lib/utils';
import type { AnalyticsEvent, AnalyticsKind } from '@/types';
import { localDb } from './backend/localDb';

const MAX_EVENTS = 6000;
/** Impressions are throttled per place so scrolling a list does not flood the log. */
const recentImpressions = new Map<string, number>();

export interface DailyPoint {
  date: string;
  label: string;
  view: number;
  impression: number;
  direction: number;
  call: number;
  save: number;
}

export const analyticsService = {
  /** Record an interaction with a place. Stores only the place id, kind and time: no user id. */
  track(placeId: string, kind: AnalyticsKind) {
    // Local mode only has an audience for these numbers when the place is managed in the
    // business portal on this device, so nothing is logged for any other place.
    const managed = localDb.get().listings.some((l) => l.placeId === placeId || `l_${l.id}` === placeId);
    if (!managed) return;
    if (kind === 'impression') {
      const last = recentImpressions.get(placeId) ?? 0;
      if (Date.now() - last < 60_000) return;
      recentImpressions.set(placeId, Date.now());
    }
    const event: AnalyticsEvent = { id: uid('ev'), placeId, kind, at: Date.now() };
    void localDb.ready().then(() => localDb.set((s) => ({ analytics: [...s.analytics, event].slice(-MAX_EVENTS) })));
  },

  async totals(placeIds: string[], days = 30): Promise<Record<AnalyticsKind, number>> {
    await localDb.ready();
    const since = Date.now() - days * DAY;
    const totals: Record<AnalyticsKind, number> = { view: 0, impression: 0, direction: 0, call: 0, save: 0, share: 0, website: 0 };
    for (const e of localDb.get().analytics) if (e.at >= since && placeIds.includes(e.placeId)) totals[e.kind]++;
    return totals;
  },

  async daily(placeIds: string[], days = 14): Promise<DailyPoint[]> {
    await localDb.ready();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const first = start.getTime() - (days - 1) * DAY;
    const points: DailyPoint[] = Array.from({ length: days }, (_, i) => {
      const d = new Date(first + i * DAY);
      // Local calendar date: toISOString() would shift to the previous day east of UTC.
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date, label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), view: 0, impression: 0, direction: 0, call: 0, save: 0 };
    });
    for (const e of localDb.get().analytics) {
      if (e.at < first || !placeIds.includes(e.placeId)) continue;
      const p = points[Math.floor((e.at - first) / DAY)];
      if (p && e.kind in p) (p[e.kind as keyof Omit<DailyPoint, 'date' | 'label'>] as number)++;
    }
    return points;
  },
};
