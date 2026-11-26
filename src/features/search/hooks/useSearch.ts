import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { CATEGORIES } from '@/data/categories';
import { useLiveFeed } from '@/hooks/useCommunity';
import { useEnrichPlaces, useNearbyPlaces, useStatsGetter } from '@/hooks/usePlaces';
import { distanceMeters } from '@/lib/geo';
import { geocodingService } from '@/services/geocoding';
import { overpassAvailable, placesService } from '@/services/places';
import { filterAndRank, matchByName, parseIntent, type SearchFilters, type SearchIntent } from '@/services/search';
import { useLocation } from '@/store/location';
import { useUi } from '@/store/ui';
import type { LatLon, PlaceWithDistance } from '@/types';

export interface PlaceResultsParams {
  /** Explicit categories (category page). Search derives these from the query instead. */
  categoryIds?: readonly string[];
  intent?: SearchIntent;
  filters: SearchFilters;
  enabled?: boolean;
  /** Search around this point instead of the user (the map's "Search this area"). */
  center?: LatLon;
}

/**
 * The single results pipeline behind search results and category listings:
 * fetch real places around the anchor, enrich the closest with opening hours, join live
 * availability, then filter and rank.
 */
export function usePlaceResults({ categoryIds, intent, filters, enabled = true, center: centerOverride }: PlaceResultsParams) {
  const here = useLocation((s) => s.coords);
  const online = useUi((s) => s.online);
  const stats = useStatsGetter();
  const cats = categoryIds?.length ? categoryIds : intent?.categoryIds.length ? intent.categoryIds : undefined;

  // "parking near forum mall": anchor the search on the landmark instead of the user.
  const landmark = intent?.landmark;
  const landmarkCategory = useMemo(
    () => (landmark ? CATEGORIES.find((c) => c.label.toLowerCase() === landmark || c.singular.toLowerCase() === landmark || c.keywords.includes(landmark)) : undefined),
    [landmark],
  );
  const around = useNearbyPlaces({ radius: 3000, enabled: enabled && Boolean(landmarkCategory) });
  const geocoded = useQuery({
    queryKey: ['landmark', landmark, Math.round(here.lat * 20), Math.round(here.lon * 20)],
    queryFn: ({ signal }) => geocodingService.search(landmark!, here, 1, signal),
    enabled: enabled && Boolean(landmark) && !landmarkCategory && online,
    staleTime: 10 * 60_000,
  });

  const anchor = useMemo<{ point: LatLon; label: string } | null>(() => {
    if (!landmark) return null;
    if (landmarkCategory) {
      const nearest = around.places.find((p) => p.categoryIds.includes(landmarkCategory.id) && p.hasName);
      return nearest ? { point: { lat: nearest.lat, lon: nearest.lon }, label: nearest.name } : null;
    }
    const hit = geocoded.data?.[0];
    return hit && distanceMeters(here, hit) < 60_000 ? { point: { lat: hit.lat, lon: hit.lon }, label: hit.name } : null;
  }, [landmark, landmarkCategory, around.places, geocoded.data, here]);

  const anchorPending = Boolean(landmark) && !anchor && (landmarkCategory ? around.isLoading : geocoded.isPending && online);
  const center = centerOverride ?? anchor?.point ?? here;
  const moved = Boolean(centerOverride) || Boolean(anchor);
  // Around a landmark people mean "a short walk from it", not the whole search radius.
  const radius = anchor && !centerOverride ? Math.min(filters.radius, 800) : filters.radius;

  const nearby = useNearbyPlaces({ center, radius, categoryIds: cats, enabled: enabled && !anchorPending });

  // Name search also asks Overpass, which knows every named feature, not only our categories.
  const terms = intent?.terms ?? [];
  const nameOnly = Boolean(intent?.nameOnly);
  const remote = useQuery({
    queryKey: ['name-search', terms.join(' '), Math.round(center.lat * 100), Math.round(center.lon * 100), radius],
    queryFn: ({ signal }) => placesService.byName(terms.join(' '), center, Math.max(radius, 3000), signal),
    enabled: enabled && nameOnly && online && terms.join(' ').length >= 3 && overpassAvailable(),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const candidates = useMemo<PlaceWithDistance[]>(() => {
    if (!nameOnly) return nearby.places;
    const local = matchByName(nearby.places, terms);
    const seen = new Set(local.map((p) => p.id));
    const extra = (remote.data ?? []).filter((p) => !seen.has(p.id)).map((p) => ({ ...p, distance: distanceMeters(here, p) }));
    return [...local, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameOnly, nearby.places, remote.data, terms.join(' '), here]);

  // Distances are always shown from the user, even when the search is anchored elsewhere.
  const fromUser = useMemo(() => (moved ? candidates.map((p) => ({ ...p, distance: distanceMeters(here, p) })) : candidates), [candidates, moved, here]);

  useEnrichPlaces(fromUser, 45, enabled && !nearby.isLoading && !nearby.isEnriching);

  const live = useLiveFeed({ center, radius: Math.max(radius, 2000) });
  const availableIds = useMemo(() => new Set(live.reports.filter((r) => r.placeId && r.freshness !== 'expired' && r.level === 'good' && r.verification !== 'disputed').map((r) => r.placeId!)), [live.reports]);

  const ranked = useMemo(
    () =>
      filterAndRank(fromUser, {
        intent: intent ?? parseIntent(''),
        // When searching around another point, the radius was already applied around that point.
        filters: moved ? { ...filters, radius: Number.MAX_SAFE_INTEGER } : filters,
        stats,
        availableIds,
      }),
    [fromUser, intent, filters, stats, availableIds, moved],
  );

  return {
    results: ranked.results,
    hiddenUnknownHours: ranked.hiddenUnknownHours,
    total: fromUser.length,
    anchor,
    center,
    isLoading: enabled && (anchorPending || nearby.isLoading || (nameOnly && remote.isPending && remote.fetchStatus !== 'idle' && !candidates.length)),
    isError: nearby.isError,
    error: nearby.error,
    isEnriching: nearby.isEnriching,
    truncated: nearby.truncated,
    coveredRadius: nearby.coveredRadius,
    fetchedAt: nearby.fetchedAt,
    refetch: nearby.refetch,
    availableIds,
  };
}
