import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { CATEGORY_BY_ID } from '@/data/categories';
import { illustrativePhoto } from '@/data/imagery';
import { placeStore } from '@/lib/db';
import { distanceMeters, snap } from '@/lib/geo';
import { toOpeningHoursString } from '@/lib/openingHours';
import { hash } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { hasExactPhotoTags, nearbyPhotos, photosService, type AreaPhoto } from '@/services/photos';
import {
  ALL_CATEGORIES_MAX_RADIUS, getKnownPlace, overpassAvailable, placesService, registryVersion, subscribeRegistry,
} from '@/services/places';
import { computeStats } from '@/services/reviews';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import type { BusinessListing, LatLon, Place, PlacePhoto, PlaceStats, PlaceWithDistance } from '@/types';

const HALF_HOUR = 30 * 60_000;

/** A listing created in the business portal that is not tied to an OpenStreetMap place. */
export function listingToPlace(l: BusinessListing): Place {
  const cat = CATEGORY_BY_ID[l.categoryId];
  return {
    id: `l_${l.id}`,
    name: l.name,
    hasName: true,
    categoryId: l.categoryId,
    categoryIds: [l.categoryId],
    groupId: cat?.groupId ?? 'daily',
    lat: l.lat,
    lon: l.lon,
    tags: { description: l.description },
    detail: 'full',
    source: 'listing',
    fetchedAt: l.updatedAt,
    address: l.address,
    phone: l.phone,
    website: l.website,
    openingHours: toOpeningHoursString(l.hours),
  };
}

export interface NearbyParams {
  center?: LatLon;
  radius?: number;
  categoryIds?: readonly string[];
  enabled?: boolean;
}

export function useNearbyPlaces(params: NearbyParams = {}) {
  const here = useLocation((s) => s.coords);
  const preferredRadius = useLocation((s) => s.radius);
  const center = params.center ?? here;
  const radius = params.radius ?? preferredRadius;
  const enabled = params.enabled ?? true;
  const key = snap(center);
  const catsKey = params.categoryIds?.length ? [...params.categoryIds].sort().join(',') : '';
  const disabled = useLocalDb((s) => s.config.disabledCategoryIds);
  const listings = useLocalDb((s) => s.listings);
  const version = useSyncExternalStore(subscribeRegistry, registryVersion);

  // Fetch a little wider than asked so snapping the centre never clips the edge.
  const fetchRadius = radius + 150;

  const tiles = useQuery({
    queryKey: ['places', 'tiles', key.lat, key.lon, radius],
    queryFn: ({ signal }) => placesService.fromTiles(key, fetchRadius, signal),
    staleTime: HALF_HOUR,
    gcTime: 2 * HALF_HOUR,
    enabled,
    retry: 1,
  });

  const wantRich = Boolean(catsKey) || radius <= ALL_CATEGORIES_MAX_RADIUS;
  const rich = useQuery({
    queryKey: ['places', 'overpass', key.lat, key.lon, radius, catsKey],
    queryFn: ({ signal }) => placesService.fromOverpass(key, fetchRadius, params.categoryIds, signal),
    staleTime: HALF_HOUR,
    gcTime: 2 * HALF_HOUR,
    enabled: enabled && wantRich && overpassAvailable(),
    retry: false,
  });

  const places = useMemo<PlaceWithDistance[]>(() => {
    void version;
    const full = rich.data?.places ?? [];
    const basic = tiles.data?.places ?? [];
    const seen = new Set<string>();
    const out: PlaceWithDistance[] = [];
    const cats = params.categoryIds;

    const consider = (raw: Place) => {
      if (seen.has(raw.id)) return;
      seen.add(raw.id);
      const p = getKnownPlace(raw.id) ?? raw;
      if (disabled.includes(p.categoryId)) return;
      if (cats?.length && !p.categoryIds.some((id) => cats.includes(id))) return;
      const distance = distanceMeters(center, p);
      if (distance <= radius) out.push({ ...p, distance });
    };

    full.forEach(consider);
    basic.forEach(consider);
    // Verified listings that exist only in NearMe.
    for (const l of listings) if (!l.placeId && l.verification === 'verified') consider(listingToPlace(l));

    return out.sort((a, b) => a.distance - b.distance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rich.data, tiles.data, center.lat, center.lon, radius, catsKey, disabled, listings, version]);

  const base = rich.data ?? tiles.data;
  return {
    places,
    isLoading: enabled && !base && (tiles.isPending || (rich.isPending && rich.fetchStatus !== 'idle')),
    isError: tiles.isError && !rich.data,
    error: tiles.error,
    /** Rich details are still on their way (or unavailable): hours and phone may be missing. */
    isEnriching: rich.isFetching,
    hasRichData: Boolean(rich.data),
    fetchedAt: base?.fetchedAt ?? 0,
    fromCache: base?.source === 'cache',
    truncated: Boolean(base?.truncated),
    coveredRadius: tiles.data?.coveredRadius ?? radius,
    refetch: () => Promise.all([tiles.refetch(), wantRich ? rich.refetch() : Promise.resolve()]),
  };
}

/**
 * Upgrade the first few thin records in a list to full details (hours, phone …) in one batched
 * request. Lists re-render automatically through the registry version.
 */
export function useEnrichPlaces(places: Place[], limit = 40, enabled = true) {
  const online = useUi((s) => s.online);
  const ids = useMemo(
    () => places.filter((p) => p.detail === 'basic' && /^[nwr]\d+$/.test(p.id)).slice(0, limit).map((p) => p.id),
    [places, limit],
  );
  const key = ids.join(',');
  return useQuery({
    queryKey: ['places', 'enrich', key],
    queryFn: ({ signal }) => placesService.enrich(ids, signal),
    enabled: enabled && online && ids.length > 0,
    staleTime: Infinity,
    retry: false,
  });
}

export function usePlace(id: string | undefined) {
  const listing = useLocalDb((s) => (id?.startsWith('l_') ? s.listings.find((l) => `l_${l.id}` === id) : undefined));
  const query = useQuery({
    queryKey: ['place', id],
    queryFn: ({ signal }) => placesService.byId(id!, signal),
    enabled: Boolean(id) && !id!.startsWith('l_'),
    placeholderData: () => (id ? getKnownPlace(id) : undefined),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const listingPlace = useMemo(() => (listing ? listingToPlace(listing) : undefined), [listing]);

  // Remember what the user opened so it is available offline and in "Recently viewed".
  const place = listingPlace ?? query.data;
  useEffect(() => {
    if (place && !query.isPlaceholderData) void placeStore.put(place, true);
  }, [place, query.isPlaceholderData]);

  return {
    place,
    isLoading: !place && query.isPending && !listingPlace,
    isError: !place && query.isError,
    error: query.error,
    isUpgrading: Boolean(place) && place!.detail === 'basic' && query.isFetching,
    refetch: query.refetch,
  };
}

export function useRecentlyViewed(limit = 10) {
  return useQuery({ queryKey: ['recently-viewed', limit], queryFn: () => placeStore.recent(limit), staleTime: 0 });
}

/* ── Ratings ────────────────────────────────────────────────────────────── */

export function useStatsGetter(): (place: Place) => PlaceStats {
  const sample = useSettings((s) => s.sampleData);
  const reviews = useLocalDb((s) => s.reviews);
  return useCallback((place: Place) => computeStats(place, reviews, sample), [reviews, sample]);
}

export function usePlaceStats(place: Place): PlaceStats {
  const get = useStatsGetter();
  return useMemo(() => get(place), [get, place]);
}

export function useVerifiedListing(placeId: string | undefined): BusinessListing | undefined {
  return useLocalDb((s) => (placeId ? s.listings.find((l) => l.verification === 'verified' && (l.placeId === placeId || `l_${l.id}` === placeId)) : undefined));
}

/* ── Photos ─────────────────────────────────────────────────────────────── */

export function useAreaPhotos(center?: LatLon) {
  const here = useLocation((s) => s.coords);
  const c = snap(center ?? here, 2);
  return useQuery({
    queryKey: ['area-photos', c.lat, c.lon],
    queryFn: ({ signal }) => photosService.area(c, 2500, signal),
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: false,
  });
}

/** Best single image for a card: a photo taken at the place if one exists, otherwise labelled category imagery. */
export function pickCover(place: Place, pool: AreaPhoto[] | undefined): PlacePhoto | null {
  const near = pool?.length ? nearbyPhotos(place, pool, 110) : [];
  if (near.length) return near[hash(place.id) % Math.min(near.length, 3)]!;
  return illustrativePhoto(place);
}

export function usePlaceCover(place: Place): PlacePhoto | null {
  const { data: pool } = useAreaPhotos();
  const exact = useQuery({
    queryKey: ['place-photo-exact', place.id],
    queryFn: ({ signal }) => photosService.exact(place, signal),
    enabled: hasExactPhotoTags(place),
    staleTime: Infinity,
    retry: false,
  });
  return useMemo(() => exact.data?.[0] ?? pickCover(place, pool), [exact.data, place, pool]);
}

export function usePlaceGallery(place: Place | undefined) {
  const { data: pool } = useAreaPhotos(place);
  return useQuery({
    queryKey: ['place-gallery', place?.id, place?.detail, pool?.length ?? 0],
    queryFn: ({ signal }) => photosService.gallery(place!, pool ?? [], signal),
    enabled: Boolean(place),
    staleTime: 60 * 60_000,
    retry: false,
  });
}
