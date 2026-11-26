import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import { CATEGORY_BY_ID } from '@/data/categories';
import { describeError } from '@/lib/http';
import { adminService, type AdminConfigInput } from '@/services/admin';
import { useLocalDb, type LocalDbState } from '@/services/backend/localDb';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import type { AdminConfig, PlanId, Role, UserProfile } from '@/types';

/* ── Change signal ──────────────────────────────────────────────────────── */

type Table = 'users' | 'reviews' | 'reports' | 'deals' | 'events' | 'listings' | 'moderation' | 'suggestions' | 'contributions' | 'analytics' | 'hiddenIds' | 'config';

const identities = new WeakMap<object, number>();
let nextIdentity = 1;
function identity(value: object): number {
  let id = identities.get(value);
  if (!id) {
    id = nextIdentity++;
    identities.set(value, id);
  }
  return id;
}

/**
 * A cheap "version" for a set of local tables. Every write replaces the table's array, so its
 * identity is enough to tell that something changed. Used in query keys: any write, from the
 * admin area or from the consumer app, refetches the screens that depend on that table.
 */
function useTablesVersion(tables: readonly Table[]): string {
  return useLocalDb((s: LocalDbState) => tables.map((t) => identity(s[t])).join('.'));
}

/** Re-renders on an interval so freshness, expiry and "x min ago" stay truthful. */
export function useTick(ms = 30_000): number {
  const [tick, setTick] = useState(() => Math.floor(Date.now() / ms));
  useEffect(() => {
    const id = setInterval(() => setTick(Math.floor(Date.now() / ms)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}

function useAdminQuery<T>(name: string, tables: readonly Table[], queryFn: () => Promise<T>, extra: readonly unknown[] = []) {
  const version = useTablesVersion(tables);
  return useQuery({
    queryKey: ['admin', name, version, ...extra],
    queryFn,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 60_000,
  });
}

/* ── Queries ────────────────────────────────────────────────────────────── */

const EVERYTHING: readonly Table[] = ['users', 'reviews', 'reports', 'deals', 'events', 'listings', 'moderation', 'suggestions', 'contributions', 'config'];

export const useOverview = () => {
  const tick = useTick(60_000);
  return useAdminQuery('overview', EVERYTHING, () => adminService.overview(), [tick]);
};

export const useAttention = () => useAdminQuery('attention', ['listings', 'moderation', 'reviews', 'reports', 'deals', 'events', 'suggestions'], () => adminService.attention());

export const useAnalytics = () => {
  const tick = useTick(60_000);
  return useAdminQuery('analytics', ['contributions', 'reports', 'listings', 'reviews', 'config'], () => adminService.analytics(), [tick]);
};

export const useListings = () => useAdminQuery('listings', ['listings'], () => adminService.listings());
export const useUsers = () => useAdminQuery('users', ['users', 'contributions', 'reviews', 'reports', 'listings'], () => adminService.users());
export const useConfig = () => useAdminQuery('config', ['config'], () => adminService.config());
export const useSuggestions = (scope: 'category' | 'place') => useAdminQuery('suggestions', ['suggestions'], () => adminService.suggestions(scope), [scope]);
export const useReviews = () => useAdminQuery('reviews', ['reviews'], () => adminService.reviews());
export const useDeals = () => useAdminQuery('deals', ['deals'], () => adminService.deals());
export const useEvents = () => useAdminQuery('events', ['events'], () => adminService.events());
export const useModerationQueue = () =>
  useAdminQuery('moderation', ['moderation', 'reviews', 'reports', 'deals', 'events', 'listings', 'users', 'hiddenIds'], () => adminService.moderationQueue());

export const useReports = () => {
  const tick = useTick();
  return useAdminQuery('reports', ['reports', 'config'], () => adminService.reports(), [tick]);
};

/* ── Mutations ──────────────────────────────────────────────────────────── */

/** Consumer-side caches that show the content admins moderate. */
const CONSUMER_KEYS = ['live', 'deals', 'events', 'contributions', 'reviews', 'notifications'];

function useAdminMutation<V = void, R = void>(mutationFn: (vars: V) => Promise<R>, success?: string | ((vars: V, result: R) => string | undefined)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      for (const key of CONSUMER_KEYS) void qc.invalidateQueries({ queryKey: [key] });
      const message = typeof success === 'function' ? success(vars, result) : success;
      if (message) toast.success(message);
    },
    onError: (error) => {
      toast.error(describeError(error));
    },
  });
}

const requireActor = (): UserProfile => {
  const user = useAuth.getState().user;
  if (!user) throw new Error('Sign in again to continue.');
  return user;
};

export function useListingMutations() {
  return {
    review: useAdminMutation(
      (v: { id: string; decision: 'in_review' | 'verified' | 'rejected'; note?: string; suspend?: boolean }) => adminService.reviewListing(v.id, v.decision, v.note),
      (v, listing) =>
        v.decision === 'verified'
          ? `${listing.name} is now verified`
          : v.decision === 'in_review'
            ? `${listing.name} marked as in review`
            : v.suspend
              ? `${listing.name} suspended`
              : `${listing.name} rejected`,
    ),
    setPlan: useAdminMutation((v: { id: string; plan: PlanId }) => adminService.setListingPlan(v.id, v.plan), 'Plan updated'),
    remove: useAdminMutation((id: string) => adminService.deleteListing(id), 'Listing deleted'),
  };
}

export function useUserMutations() {
  return {
    setRole: useAdminMutation((v: { id: string; role: Role }) => adminService.setUserRole(requireActor().id, v.id, v.role), 'Role updated'),
    setStatus: useAdminMutation(
      (v: { id: string; status: 'active' | 'suspended' }) => adminService.setUserStatus(requireActor().id, v.id, v.status),
      (v) => (v.status === 'suspended' ? 'Account suspended' : 'Account reactivated'),
    ),
    remove: useAdminMutation((id: string) => adminService.deleteUser(requireActor().id, id), 'Account deleted'),
  };
}

export function useConfigMutations() {
  return {
    update: useAdminMutation((patch: Partial<AdminConfig> | AdminConfigInput) => adminService.updateConfig(patch)),
    reset: useAdminMutation(() => adminService.resetConfig(), 'Configuration reset to defaults'),
  };
}

export function useCategoryMutations() {
  return {
    setEnabled: useAdminMutation(
      (v: { id: string; enabled: boolean }) => adminService.setCategoryEnabled(v.id, v.enabled),
      (v) => `${CATEGORY_BY_ID[v.id]?.label ?? 'Category'} ${v.enabled ? 'switched on' : 'switched off. It no longer appears in discovery.'}`,
    ),
    setFeatured: useAdminMutation(
      (v: { id: string; featured: boolean }) => adminService.setCategoryFeatured(v.id, v.featured),
      (v) => `${CATEGORY_BY_ID[v.id]?.label ?? 'Category'} ${v.featured ? 'is now featured' : 'is no longer featured'}`,
    ),
    resetFeatured: useAdminMutation(() => adminService.resetFeaturedCategories(), 'Featured categories reset to the defaults'),
  };
}

export function useSuggestionMutations() {
  return {
    resolve: useAdminMutation(
      (v: { id: string; decision: 'approved' | 'rejected' }) => adminService.resolveSuggestion(v.id, v.decision),
      (v) => (v.decision === 'approved' ? 'Suggestion approved. The contributor has been credited.' : 'Suggestion rejected'),
    ),
  };
}

type Visibility = { id: string; state: 'visible' | 'hidden' };
const visibilityMessage = (what: string) => (v: Visibility) => (v.state === 'hidden' ? `${what} hidden` : `${what} is visible again`);

export function useReportMutations() {
  return {
    setModeration: useAdminMutation((v: Visibility) => adminService.setReportModeration(v.id, v.state), visibilityMessage('Update')),
    remove: useAdminMutation((id: string) => adminService.deleteReport(id), 'Update deleted'),
  };
}

export function useReviewMutations() {
  return {
    setModeration: useAdminMutation((v: Visibility) => adminService.setReviewModeration(v.id, v.state), visibilityMessage('Review')),
    remove: useAdminMutation((id: string) => adminService.deleteReview(id), 'Review deleted'),
  };
}

export function useDealMutations() {
  return {
    setModeration: useAdminMutation(
      (v: Visibility & { approve?: boolean }) => adminService.setDealModeration(v.id, v.state),
      (v) => (v.approve ? 'Deal approved' : visibilityMessage('Deal')(v)),
    ),
    setPromoted: useAdminMutation(
      (v: { id: string; promoted: boolean }) => adminService.setDealPromoted(v.id, v.promoted),
      (v) => (v.promoted ? 'Deal promoted' : 'Promotion removed'),
    ),
    remove: useAdminMutation((id: string) => adminService.deleteDeal(id), 'Deal deleted'),
  };
}

export function useEventMutations() {
  return {
    setModeration: useAdminMutation(
      (v: Visibility & { approve?: boolean }) => adminService.setEventModeration(v.id, v.state),
      (v) => (v.approve ? 'Event approved. It is now listed.' : visibilityMessage('Event')(v)),
    ),
    remove: useAdminMutation((id: string) => adminService.deleteEvent(id), 'Event deleted'),
  };
}

export function useModerationMutations() {
  return {
    resolve: useAdminMutation(
      (v: { id: string; decision: 'act' | 'dismiss'; note: string }) => adminService.resolveModeration(requireActor().id, v.id, v.decision, v.note),
      (v) => (v.decision === 'dismiss' ? 'Flag dismissed' : 'Decision recorded'),
    ),
    restore: useAdminMutation((id: string) => adminService.restoreModeratedContent(id), 'Content restored'),
  };
}

export function useResetLocalData() {
  return useAdminMutation(() => adminService.resetLocalData(useAuth.getState().user), 'Local data cleared');
}

/* ── View state ─────────────────────────────────────────────────────────── */

interface AdminViewState {
  /** Layer the labelled sample baseline over real figures on the dashboard and analytics. */
  baseline: boolean;
  setBaseline: (on: boolean) => void;
}

const useAdminView = create<AdminViewState>()((set) => ({ baseline: true, setBaseline: (baseline) => set({ baseline }) }));

/**
 * Whether charts should include the sample baseline. It is only ever available when the
 * app-wide "sample data" setting is on, and an admin can switch to real figures at any time.
 */
export function useSampleBaseline() {
  const available = useSettings((s) => s.sampleData);
  const baseline = useAdminView((s) => s.baseline);
  const setBaseline = useAdminView((s) => s.setBaseline);
  return { available, on: available && baseline, setOn: setBaseline };
}

/** Keeps the last non-null value so a dialog can finish its exit animation with its content intact. */
export function useLatest<T>(value: T | null): T | null {
  const ref = useRef<T | null>(value);
  if (value !== null) ref.current = value;
  return ref.current;
}
