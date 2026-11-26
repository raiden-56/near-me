import { env } from '@/lib/env';
import { fetchJson } from '@/lib/http';
import { titleCase } from '@/lib/utils';
import type { AreaInfo, GeocodeResult, LatLon } from '@/types';
import { nominatimThrottle } from './places/nominatim';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    postcode?: string;
  };
}

const uniq = (parts: (string | undefined)[]) => [...new Set(parts.filter((p): p is string => Boolean(p && p.trim())))];

function fromPhoton(f: PhotonFeature): GeocodeResult | null {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || p.locality || p.district || p.city;
  if (!name) return null;
  const detail = uniq([p.street && p.street !== name ? p.street : undefined, p.locality, p.district, p.city, p.state]).filter((s) => s !== name);
  return {
    id: `${p.osm_type ?? 'X'}${p.osm_id ?? `${lat},${lon}`}`,
    name,
    detail: detail.slice(0, 3).join(', '),
    lat,
    lon,
    kind: titleCase(p.osm_value && p.osm_value !== 'yes' ? p.osm_value : (p.type ?? 'place')),
    osmKey: p.osm_key,
    osmValue: p.osm_value,
    osmRef: p.osm_type && p.osm_id ? `${p.osm_type.toLowerCase()}${p.osm_id}` : undefined,
    countryCode: p.countrycode?.toLowerCase(),
    city: p.city || p.county,
  };
}

interface NominatimReverse {
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
  error?: string;
}

export const geocodingService = {
  /** Forward geocoding with autocomplete semantics, biased towards the user's surroundings. */
  async search(query: string, bias?: LatLon | null, limit = 6, signal?: AbortSignal): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const params = new URLSearchParams({ q, limit: String(limit + 2), lang: 'en' });
    if (bias) {
      params.set('lat', bias.lat.toFixed(4));
      params.set('lon', bias.lon.toFixed(4));
      params.set('location_bias_scale', '0.4');
    }
    const json = await fetchJson<{ features: PhotonFeature[] }>(`${env.photonUrl}/api/?${params.toString()}`, { timeoutMs: 9000, signal });
    const seen = new Set<string>();
    const out: GeocodeResult[] = [];
    for (const f of json.features ?? []) {
      const r = fromPhoton(f);
      if (!r) continue;
      const key = `${r.name}|${r.detail}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  },

  /** Neighbourhood and city for a coordinate. Never throws: falls back to a generic label. */
  async reverse(point: LatLon, signal?: AbortSignal): Promise<AreaInfo> {
    try {
      const params = new URLSearchParams({
        lat: point.lat.toFixed(5),
        lon: point.lon.toFixed(5),
        format: 'jsonv2',
        zoom: '16',
        addressdetails: '1',
        'accept-language': 'en',
      });
      const r = await nominatimThrottle(() =>
        fetchJson<NominatimReverse>(`${env.nominatimUrl}/reverse?${params.toString()}`, { timeoutMs: 9000, signal }),
      );
      const a = r.address;
      if (a) {
        const city = a.city || a.town || a.village || a.municipality || a.county || a.state_district || '';
        const area = a.neighbourhood || a.quarter || a.suburb || a.residential || a.city_district || a.road || city;
        return {
          area: area || 'Your area',
          city,
          state: a.state,
          country: a.country,
          countryCode: a.country_code?.toLowerCase(),
          postcode: a.postcode,
          road: a.road,
        };
      }
    } catch {
      /* fall through to Photon */
    }
    try {
      const json = await fetchJson<{ features: PhotonFeature[] }>(
        `${env.photonUrl}/reverse?lat=${point.lat.toFixed(5)}&lon=${point.lon.toFixed(5)}&lang=en`,
        { timeoutMs: 8000, signal },
      );
      const p = json.features?.[0]?.properties;
      if (p) {
        return {
          area: p.locality || p.district || p.street || p.city || 'Your area',
          city: p.city || p.county || '',
          state: p.state,
          country: p.country,
          countryCode: p.countrycode?.toLowerCase(),
          postcode: p.postcode,
          road: p.street,
        };
      }
    } catch {
      /* fall through */
    }
    return { area: 'Your area', city: '' };
  },
};
