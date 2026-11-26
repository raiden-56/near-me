import type { LatLon } from '@/types';

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function formatDistance(m: number | undefined | null): string {
  if (m == null || !Number.isFinite(m)) return '';
  if (m < 50) return 'Right here';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1).replace(/\.0$/, '')} km`;
  return `${Math.round(m / 1000)} km`;
}

export function formatRadius(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km`;
}

/** Rough walking time at 4.8 km/h. Used only as a hint until a real route is requested. */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / 80));
}

export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function bboxAround(c: LatLon, radius: number): BBox {
  const dLat = (radius / R) * (180 / Math.PI);
  const dLon = dLat / Math.cos(rad(c.lat));
  return { south: c.lat - dLat, north: c.lat + dLat, west: c.lon - dLon, east: c.lon + dLon };
}

/** Slippy-map tile coordinates for a point. */
export function tileXY(c: LatLon, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((c.lon + 180) / 360) * n);
  const r = rad(c.lat);
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** GeoJSON polygon approximating a circle, for the search-radius overlay. */
export function circlePolygon(c: LatLon, radius: number, steps = 72): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: [number, number][] = [];
  const dLat = (radius / R) * (180 / Math.PI);
  const dLon = dLat / Math.cos(rad(c.lat));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([c.lon + dLon * Math.cos(t), c.lat + dLat * Math.sin(t)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

/** Snap to a grid so GPS jitter does not trigger refetches (3 decimals ≈ 110 m). */
export function snap(c: LatLon, decimals = 3): LatLon {
  const f = 10 ** decimals;
  return { lat: Math.round(c.lat * f) / f, lon: Math.round(c.lon * f) / f };
}

/**
 * Coarsen a coordinate before it is attached to anything other people can see.
 * ~300 m grid: enough to place a report in a neighbourhood, not at a doorstep.
 */
export function approximate(c: LatLon): LatLon {
  const step = 0.003;
  return { lat: Math.round(c.lat / step) * step, lon: Math.round(c.lon / step) * step };
}

export function bearingLabel(from: LatLon, to: LatLon): string {
  const y = Math.sin(rad(to.lon - from.lon)) * Math.cos(rad(to.lat));
  const x =
    Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) -
    Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(rad(to.lon - from.lon));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(deg / 45) % 8]!;
}

export function mapsDirectionsUrl(to: LatLon, from?: LatLon | null, mode: 'driving' | 'walking' | 'bicycling' = 'driving'): string {
  const p = new URLSearchParams({ api: '1', destination: `${to.lat},${to.lon}`, travelmode: mode });
  if (from) p.set('origin', `${from.lat},${from.lon}`);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
