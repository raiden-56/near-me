import { areaStore, placeStore } from '@/lib/db';
import { snap } from '@/lib/geo';
import type { LatLon, Place, PlacesResult } from '@/types';
import { mergePlace } from './normalize';
import { lookupPlaces } from './nominatim';
import { fetchOverpassByIds, fetchOverpassByName, fetchOverpassPlaces, overpassAvailable } from './overpass';
import { fetchTilePlaces } from './tiles';

export { overpassAvailable } from './overpass';
export { osmUrl } from './normalize';

/** Widest search for "every category at once" against Overpass; beyond this a category is required. */
export const ALL_CATEGORIES_MAX_RADIUS = 2000;

const TILE_TTL = 24 * 60 * 60_000;
const OVERPASS_TTL = 6 * 60 * 60_000;

/** Every place seen this session, so detail pages open instantly and lists share upgrades. */
const registry = new Map<string, Place>();
let version = 0;
const listeners = new Set<() => void>();

export function registerPlaces(places: Place[]) {
  let upgraded = false;
  for (const p of places) {
    const prev = registry.get(p.id);
    if (prev && prev.detail === 'basic' && p.detail === 'full') upgraded = true;
    registry.set(p.id, prev ? mergePlace(prev, p) : p);
  }
  // Lists hold their own copies; bumping the version tells them a richer record is available.
  if (upgraded) {
    version++;
    listeners.forEach((l) => l());
  }
}

export const getKnownPlace = (id: string) => registry.get(id);
export const registryVersion = () => version;
export const subscribeRegistry = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

async function cached(key: string, ttl: number, load: () => Promise<PlacesResult>): Promise<PlacesResult> {
  const hit = await areaStore.get(key);
  if (hit && Date.now() - hit.storedAt < ttl) {
    registerPlaces(hit.result.places);
    return { ...hit.result, source: 'cache' };
  }
  try {
    const result = await load();
    registerPlaces(result.places);
    void areaStore.put(key, result);
    return result;
  } catch (error) {
    // Offline or provider down: an older answer, clearly dated, beats an empty screen.
    if (hit) {
      registerPlaces(hit.result.places);
      return { ...hit.result, source: 'cache' };
    }
    throw error;
  }
}

/** Bump when the way places are classified or normalised changes, so stale cached areas are refetched. */
const CACHE_VERSION = 'v2';

const areaKey = (kind: string, c: LatLon, radius: number, extra = '') => {
  const s = snap(c);
  return `${CACHE_VERSION}:${kind}:${s.lat},${s.lon}:${radius}:${extra}`;
};

export const placesService = {
  /** Fast baseline: every place in range, with name, type and position. */
  async fromTiles(center: LatLon, radius: number, signal?: AbortSignal): Promise<PlacesResult> {
    return cached(areaKey('tiles', center, radius), TILE_TTL, async () => {
      const { places, coveredRadius } = await fetchTilePlaces(center, radius, signal);
      return { places, source: 'tiles', fetchedAt: Date.now(), truncated: coveredRadius < radius, coveredRadius };
    });
  },

  /** Rich data with full tags. Throws when no Overpass mirror answers. */
  async fromOverpass(center: LatLon, radius: number, categoryIds?: readonly string[], signal?: AbortSignal): Promise<PlacesResult> {
    const extra = categoryIds?.length ? [...categoryIds].sort().join(',') : 'all';
    return cached(areaKey('overpass', center, radius, extra), OVERPASS_TTL, async () => {
      const { places, truncated } = await fetchOverpassPlaces(center, radius, categoryIds, signal);
      return { places, source: 'overpass', fetchedAt: Date.now(), truncated, coveredRadius: radius };
    });
  },

  async byName(term: string, center: LatLon, radius: number, signal?: AbortSignal): Promise<Place[]> {
    const places = await fetchOverpassByName(term, center, radius, signal);
    registerPlaces(places);
    return places;
  },

  /** Upgrade thin (tile) records to full ones. Overpass first, Nominatim as the dependable fallback. */
  async enrich(ids: string[], signal?: AbortSignal): Promise<Place[]> {
    const need = ids.filter((id) => registry.get(id)?.detail !== 'full').slice(0, 50);
    if (!need.length) return [];
    // Nominatim answers id lookups quickly and dependably, so it goes first for these small
    // batches; Overpass (which can hang when its public mirrors are busy) is the fallback.
    let places: Place[] = [];
    try {
      places = await lookupPlaces(need, signal);
    } catch (error) {
      if (!overpassAvailable()) throw error;
    }
    if (!places.length && overpassAvailable()) places = await fetchOverpassByIds(need, signal);
    registerPlaces(places);
    return places.map((p) => registry.get(p.id)!);
  },

  /** One place by id: memory, then device storage, then the network. */
  async byId(id: string, signal?: AbortSignal): Promise<Place> {
    const known = registry.get(id) ?? (await placeStore.get(id)) ?? undefined;
    if (known) registry.set(id, known);
    if (known?.detail === 'full' && Date.now() - known.fetchedAt < OVERPASS_TTL) return known;
    try {
      const [fresh] = await this.enrich([id], signal);
      if (fresh) return fresh;
    } catch (error) {
      if (!known) throw error;
    }
    if (known) return known;
    throw new Error('We could not find this place. It may have been removed from the map.');
  },

  /** Last area answer stored on the device, for the offline home screen. */
  async lastKnownArea(): Promise<PlacesResult | null> {
    const hit = await areaStore.latest();
    if (!hit) return null;
    registerPlaces(hit.result.places);
    return { ...hit.result, source: 'cache' };
  },
};
