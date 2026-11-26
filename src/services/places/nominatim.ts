import { env } from '@/lib/env';
import { createThrottle, fetchJson } from '@/lib/http';
import type { Place } from '@/types';
import { idToOsm, osmRefToId, placeFromTags } from './normalize';

/** Nominatim's usage policy allows at most one request per second from a client. */
export const nominatimThrottle = createThrottle(1100);

interface LookupResult {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
  namedetails?: Record<string, string> | null;
}

function toPlace(r: LookupResult): Place | null {
  const tags: Record<string, string> = { ...(r.extratags ?? {}) };
  if (r.category && r.type) tags[r.category] ??= r.type;
  const name = r.namedetails?.['name:en'] || r.namedetails?.name || r.name;
  if (name) tags.name = name;
  if (r.namedetails?.['name:en']) tags['name:en'] = r.namedetails['name:en'];
  const a = r.address ?? {};
  if (a.house_number) tags['addr:housenumber'] ??= a.house_number;
  if (a.road) tags['addr:street'] ??= a.road;
  const suburb = a.neighbourhood || a.quarter || a.suburb || a.residential;
  if (suburb) tags['addr:suburb'] ??= suburb;
  const city = a.city || a.town || a.village || a.county;
  if (city) tags['addr:city'] ??= city;
  if (a.postcode) tags['addr:postcode'] ??= a.postcode;
  return placeFromTags(osmRefToId(r.osm_type, r.osm_id), Number(r.lat), Number(r.lon), tags, 'nominatim', 'full');
}

/** Full details for up to 50 OSM objects in one call. */
export async function lookupPlaces(ids: string[], signal?: AbortSignal): Promise<Place[]> {
  const refs = ids
    .map(idToOsm)
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .slice(0, 50);
  if (!refs.length) return [];
  const params = new URLSearchParams({
    osm_ids: refs.map((r) => `${r.letter}${r.osmId}`).join(','),
    format: 'jsonv2',
    extratags: '1',
    addressdetails: '1',
    namedetails: '1',
    'accept-language': 'en',
  });
  const results = await nominatimThrottle(() =>
    fetchJson<LookupResult[]>(`${env.nominatimUrl}/lookup?${params.toString()}`, { timeoutMs: 12000, signal }),
  );
  return results.map(toPlace).filter((p): p is Place => Boolean(p));
}
