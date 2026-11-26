import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { snap } from '@/lib/geo';
import { communityService } from '@/services/community';
import { dealsService, eventsService } from '@/services/deals';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import type { LatLon, ReportView } from '@/types';
import { useNearbyPlaces } from './usePlaces';
import { useRequireAuth } from './useRequireAuth';

/** Re-renders on an interval so "6 min ago", expiry and freshness stay truthful without a refresh. */
export function useTick(ms = 30_000): number {
  const [tick, setTick] = useState(() => Math.floor(Date.now() / ms));
  useEffect(() => {
    const id = setInterval(() => setTick(Math.floor(Date.now() / ms)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}

interface AreaOptions {
  center?: LatLon;
  radius?: number;
}

/** Shared context for community content: where the user is and which real places are around. */
function useArea({ center, radius = 3000 }: AreaOptions = {}) {
  const here = useLocation((s) => s.coords);
  const areaLabel = useLocation((s) => s.area);
  const sample = useSettings((s) => s.sampleData);
  const c = center ?? here;
  const nearby = useNearbyPlaces({ center: c, radius });
  return { center: c, key: snap(c), areaLabel, sample, places: nearby.places, placesLoading: nearby.isLoading, placesReady: !nearby.isLoading };
}

export function useLiveFeed(options: AreaOptions & { includeExpired?: boolean } = {}) {
  const area = useArea(options);
  const tick = useTick();
  const query = useQuery({
    queryKey: ['live', area.key.lat, area.key.lon, area.sample, area.places.length, Boolean(options.includeExpired), tick],
    queryFn: () => communityService.feed({ places: area.places, center: area.center, areaLabel: area.areaLabel, sample: area.sample, includeExpired: options.includeExpired }),
    enabled: area.placesReady,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  return { ...query, reports: query.data ?? [], isLoading: area.placesLoading || query.isPending, places: area.places };
}

/** Confirm / dispute / helpful / flag, each gated behind sign-in and reflected immediately. */
export function useReportActions() {
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['live'] });
    void qc.invalidateQueries({ queryKey: ['contributions'] });
  };

  const guard = (reason: string, run: (user: NonNullable<ReturnType<typeof useAuth.getState>['user']>) => Promise<void>) =>
    requireAuth(reason, async (user) => {
      try {
        await run(user);
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'That did not work. Please try again.');
      }
    });

  return {
    confirm: (report: ReportView) =>
      guard('Sign in to confirm this update.', async (user) => {
        const had = report.confirmations.includes(user.id);
        await communityService.vote(user, report, 'confirm');
        if (!had) toast.success('Thanks for confirming', { description: 'Confirmations make updates more trustworthy for everyone.' });
      }),
    disagree: (report: ReportView) =>
      guard('Sign in to say this update is not accurate.', async (user) => {
        const had = report.disagreements.includes(user.id);
        await communityService.vote(user, report, 'disagree');
        if (!had) toast('Marked as not accurate', { description: 'If others agree, this update will be hidden.' });
      }),
    helpful: (report: ReportView) => guard('Sign in to mark this as helpful.', (user) => communityService.toggleHelpful(user, report)),
    flag: (report: ReportView, reason: string, note?: string) =>
      guard('Sign in to report this update.', async (user) => {
        const created = await communityService.flag(user, report, reason, note);
        toast.success(created ? 'Reported to moderators' : 'You already reported this', { description: created ? 'Thanks. We will take a look.' : undefined });
      }),
    remove: (report: ReportView) =>
      guard('Sign in to remove this update.', async (user) => {
        await communityService.remove(user, report.id);
        toast('Update removed');
      }),
  };
}

export function useDeals(options: AreaOptions = {}) {
  const area = useArea({ radius: 5000, ...options });
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['deals', area.key.lat, area.key.lon, area.sample, area.places.length],
    queryFn: () => dealsService.list({ places: area.places, center: area.center, sample: area.sample }),
    enabled: area.placesReady,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const toggleSave = async (dealId: string) => {
    const saved = await dealsService.toggleSave(dealId);
    void qc.invalidateQueries({ queryKey: ['deals'] });
    if (saved) toast.success('Deal saved', { description: 'Find it under Saved deals.' });
    else toast('Deal removed');
  };
  return { ...query, deals: query.data ?? [], isLoading: area.placesLoading || query.isPending, toggleSave };
}

export function useEvents(options: AreaOptions = {}) {
  const area = useArea({ radius: 5000, ...options });
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id);
  const query = useQuery({
    queryKey: ['events', area.key.lat, area.key.lon, area.sample, area.places.length, userId],
    queryFn: () => eventsService.list({ places: area.places, center: area.center, sample: area.sample, userId }),
    enabled: area.placesReady,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const toggleInterested = async (eventId: string) => {
    const going = await eventsService.toggleInterested(eventId);
    void qc.invalidateQueries({ queryKey: ['events'] });
    if (going) toast.success('Marked as interested');
  };
  return { ...query, events: query.data ?? [], isLoading: area.placesLoading || query.isPending, toggleInterested, places: area.places };
}
