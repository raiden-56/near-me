import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ZodError } from 'zod';
import { snap } from '@/lib/geo';
import { describeError } from '@/lib/http';
import { useLocalDb } from '@/services/backend/localDb';
import {
  businessPortalService as portal,
  type AvailabilityInput, type BasicsInput, type Insights, type ListingChange, type OfferInput, type OwnerInput, type PortalListing, type VerificationInput,
} from '@/services/businessPortal';
import { geocodingService } from '@/services/geocoding';
import { overpassAvailable, placesService } from '@/services/places';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import type { LatLon, Place, PlanId, Review } from '@/types';
import { sampleInsights } from './lib/insights';

/** Every portal query lives under this key, so one invalidation refreshes the whole portal. */
const PORTAL = ['business-portal'] as const;

export function portalErrorMessage(error: unknown): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Please check what you entered.';
  return describeError(error);
}

/** The saved session loads from device storage asynchronously. Never wait on it forever. */
export function useAuthReady(): boolean {
  const ready = useAuth((s) => s.ready);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setTimedOut(true), 2000);
    return () => clearTimeout(t);
  }, [ready]);
  return ready || timedOut;
}

/**
 * Keeps portal queries in step with the local backend. Anything that changes the tables the portal
 * reads (an admin verifying the listing, a customer leaving a review, a tracked view) refreshes
 * the screen without a reload. Mounted once, by the layout.
 */
export function usePortalSync(): void {
  const qc = useQueryClient();
  const listings = useLocalDb((s) => s.listings);
  const deals = useLocalDb((s) => s.deals);
  const reviews = useLocalDb((s) => s.reviews);
  const reports = useLocalDb((s) => s.reports);
  const analytics = useLocalDb((s) => s.analytics);
  const userId = useAuth((s) => s.user?.id);
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: PORTAL });
  }, [qc, listings, deals, reviews, reports, analytics, userId]);
}

/* ── Queries ────────────────────────────────────────────────────────────── */

export function useMyListings() {
  const userId = useAuth((s) => s.user?.id);
  return useQuery({
    queryKey: [...PORTAL, 'listings', userId],
    queryFn: () => portal.listMine(),
    enabled: Boolean(userId),
  });
}

/** One listing by id, for screens that are addressed by URL rather than by the active listing. */
export function useListingById(listingId: string | null | undefined) {
  const userId = useAuth((s) => s.user?.id);
  return useQuery({
    queryKey: [...PORTAL, 'listing', userId, listingId],
    queryFn: () => portal.get(listingId!),
    enabled: Boolean(userId && listingId),
    retry: false,
  });
}

export function useListingDeals(listingId: string) {
  return useQuery({ queryKey: [...PORTAL, 'deals', listingId], queryFn: () => portal.listDeals(listingId) });
}

export function useListingReviews(listingId: string) {
  const sample = useSettings((s) => s.sampleData);
  return useQuery({
    queryKey: [...PORTAL, 'reviews', listingId, sample],
    queryFn: () => portal.listReviews(listingId, sample),
    placeholderData: keepPreviousData,
  });
}

/**
 * Insights for a listing. Real tracked events only; when there are none and sample data is switched
 * on, a deterministic example series is returned instead and `isSample` is true so screens label it.
 */
export function useInsights(listingId: string, days: number) {
  const sample = useSettings((s) => s.sampleData);
  const query = useQuery({
    queryKey: [...PORTAL, 'insights', listingId, days],
    queryFn: () => portal.insights(listingId, days),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const real = query.data;
  const isSample = Boolean(real && !real.hasData && sample);
  const insights: Insights | undefined = real && isSample ? sampleInsights(listingId, real.days) : real;
  return { insights, isSample, isLoading: query.isPending, isFetching: query.isFetching, isError: query.isError, error: query.error, refetch: query.refetch };
}

export function useAvailabilityHistory(listingId: string) {
  return useQuery({
    queryKey: [...PORTAL, 'availability', listingId],
    queryFn: () => portal.availabilityHistory(listingId),
    // Freshness and expiry are derived when the list is read, so re-read while the screen is open.
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useClaimedPlaces() {
  const userId = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: [...PORTAL, 'claimed', userId], queryFn: () => portal.claimedPlaces(), enabled: Boolean(userId) });
}

/** Name search across the wider area, for places that are not in the nearby list. */
export function usePlaceNameSearch(term: string, radius = 5000) {
  const online = useUi((s) => s.online);
  const coords = useLocation((s) => s.coords);
  const center = snap(coords);
  const q = term.trim();
  return useQuery({
    queryKey: [...PORTAL, 'place-search', q.toLowerCase(), center.lat, center.lon, radius],
    queryFn: ({ signal }) => placesService.byName(q, center, radius, signal),
    enabled: q.length >= 3 && online && overpassAvailable(),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useAddressSearch(term: string, bias: LatLon | null) {
  const online = useUi((s) => s.online);
  const q = term.trim();
  return useQuery({
    queryKey: [...PORTAL, 'address-search', q.toLowerCase(), bias ? snap(bias, 2).lat : null, bias ? snap(bias, 2).lon : null],
    queryFn: ({ signal }) => geocodingService.search(q, bias, 6, signal),
    enabled: q.length >= 3 && online,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/* ── Mutations ──────────────────────────────────────────────────────────── */

interface ActionOptions<TData, TVars> {
  /** Toast shown on success. Return nothing to stay quiet. */
  success?: string | ((data: TData, vars: TVars) => string | null | undefined);
  /** Query keys outside the portal that show the same data (the consumer app's deals, live feed …). */
  also?: readonly QueryKey[];
  /** The listing the write returned, if any. Put straight into the cache so the next screen never sees the old one. */
  listing?: (data: TData) => PortalListing;
}

/** A portal write: refreshes portal queries, reports failures, optionally confirms success. */
function useAction<TVars, TData>(mutationFn: (vars: TVars) => Promise<TData>, options: ActionOptions<TData, TVars> = {}) {
  const qc = useQueryClient();
  return useMutation<TData, Error, TVars>({
    mutationFn,
    onSuccess: (data, vars) => {
      const fresh = options.listing?.(data);
      if (fresh) {
        qc.setQueryData([...PORTAL, 'listing', fresh.ownerId, fresh.id], fresh);
        qc.setQueryData<PortalListing[]>([...PORTAL, 'listings', fresh.ownerId], (old) =>
          old ? (old.some((l) => l.id === fresh.id) ? old.map((l) => (l.id === fresh.id ? fresh : l)) : [fresh, ...old]) : old,
        );
      }
      void qc.invalidateQueries({ queryKey: PORTAL });
      options.also?.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
      const message = typeof options.success === 'function' ? options.success(data, vars) : options.success;
      if (message) toast.success(message);
    },
    onError: (error) => {
      toast.error(portalErrorMessage(error));
    },
  });
}

const self = (listing: PortalListing) => listing;

export const useCreateDraft = () => useAction((input: OwnerInput & BasicsInput) => portal.createDraft(input), { listing: self });

export const useClaimPlace = () => useAction((place: Place) => portal.claimPlace(place), { listing: self });

export const useSaveListing = (success?: string) =>
  useAction(({ id, change, step }: { id: string; change: ListingChange; step?: number }) => portal.save(id, change, step), { success, listing: self });

export const useMarkStep = () => useAction(({ id, step }: { id: string; step: number }) => portal.markStep(id, step), { listing: self });

export const useDeleteListing = () => useAction((id: string) => portal.deleteListing(id), { success: 'Listing deleted', also: [['deals'], ['live']] });

export const useAddPhotos = () =>
  useAction(({ id, photos }: { id: string; photos: string[] }) => portal.addPhotos(id, photos), {
    success: ({ added, skipped }) =>
      skipped > 0 ? `${added} photo${added === 1 ? '' : 's'} added. ${skipped} did not fit within your plan's limit.` : `${added} photo${added === 1 ? '' : 's'} added`,
    listing: (result) => result.listing,
  });

export const useRemovePhoto = () => useAction(({ id, index }: { id: string; index: number }) => portal.removePhoto(id, index), { success: 'Photo removed', listing: self });

export const useReorderPhotos = () => useAction(({ id, order }: { id: string; order: number[] }) => portal.reorderPhotos(id, order), { listing: self });

export const useSubmitVerification = () =>
  useAction(({ id, input }: { id: string; input: VerificationInput }) => portal.submitVerification(id, input), { success: 'Sent for verification', listing: self });

export const useChoosePlan = () => useAction(({ id, plan }: { id: string; plan: PlanId }) => portal.setPlan(id, plan), { listing: self });

export const useSaveDeal = () =>
  useAction(({ id, input, dealId }: { id: string; input: OfferInput; dealId?: string }) => portal.saveDeal(id, input, dealId), { also: [['deals']] });

export const useDeleteDeal = () =>
  useAction(({ id, dealId }: { id: string; dealId: string }) => portal.deleteDeal(id, dealId), { success: 'Offer deleted', also: [['deals']] });

export const useReplyToReview = () =>
  useAction(({ id, reviewId, text }: { id: string; reviewId: string; text: string }) => portal.replyToReview(id, reviewId, text), {
    success: 'Reply posted',
    also: [['reviews']],
  });

export const useFlagReview = () =>
  useAction(({ id, review, reason, note }: { id: string; review: Review; reason: string; note?: string }) => portal.flagReview(id, review, reason, note), {
    success: (created) => (created ? 'Reported to moderators' : 'You have already reported this review'),
  });

export const useSetAvailability = () =>
  useAction(({ id, input }: { id: string; input: AvailabilityInput }) => portal.setAvailability(id, input), { also: [['live']], listing: (result) => result.listing });

export const useClearAvailability = () => useAction((id: string) => portal.clearAvailability(id), { success: 'Status cleared', also: [['live']], listing: self });
