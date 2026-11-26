import { overpassFilters } from '@/data/categories';
import { env } from '@/lib/env';
import { fetchWithTimeout, HttpError, OfflineError } from '@/lib/http';
import type { LatLon, Place } from '@/types';
import { idToOsm, osmRefToId, placeFromTags } from './normalize';

/**
 * Rich place source: the Overpass API returns complete OpenStreetMap tags (opening hours,
 * phone, cuisine, fuel types …). Public instances are best-effort, so requests are hedged
 * across the configured mirrors and a circuit breaker stops the app from waiting on them
 * when they are all down. The tile source keeps the app usable in the meantime.
 */

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const HEDGE_DELAY_MS = 2500;
const BREAKER_MS = 3 * 60_000;
const MAX_ELEMENTS = 3000;

let preferred = 0;
let brokenUntil = 0;

export const overpassAvailable = () => Date.now() >= brokenUntil;

async function run(query: string, signal?: AbortSignal, timeoutMs = 20000): Promise<OverpassElement[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError();
  if (!overpassAvailable()) throw new Error('Place details service is temporarily unavailable');

  const urls = env.overpassUrls;
  const order = urls.map((_, i) => urls[(preferred + i) % urls.length]!);
  const controllers: AbortController[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];

  const attempt = (url: string, delay: number) =>
    new Promise<{ url: string; elements: OverpassElement[] }>((resolve, reject) => {
      const ctrl = new AbortController();
      controllers.push(ctrl);
      timers.push(
        setTimeout(async () => {
          try {
            const res = await fetchWithTimeout(url, {
              method: 'POST',
              body: 'data=' + encodeURIComponent(query),
              headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
              timeoutMs,
              signal: ctrl.signal,
            });
            const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
            if (!json.elements) throw new Error(json.remark ?? 'Unexpected response');
            resolve({ url, elements: json.elements });
          } catch (error) {
            reject(error);
          }
        }, delay),
      );
    });

  const abortAll = () => {
    timers.forEach(clearTimeout);
    controllers.forEach((c) => c.abort());
  };
  signal?.addEventListener('abort', abortAll, { once: true });

  try {
    const winner = await Promise.any(order.map((url, i) => attempt(url, i * HEDGE_DELAY_MS)));
    preferred = urls.indexOf(winner.url);
    return winner.elements;
  } catch (error) {
    if (!signal?.aborted) {
      // Being rate limited means "back off properly", not "try again in a moment".
      const limited = error instanceof AggregateError && error.errors.some((e) => e instanceof HttpError && e.status === 429);
      brokenUntil = Date.now() + (limited ? 4 : 1) * BREAKER_MS;
    }
    throw error instanceof AggregateError ? (error.errors[0] ?? error) : error;
  } finally {
    abortAll();
    signal?.removeEventListener('abort', abortAll);
  }
}

function toPlaces(elements: OverpassElement[]): Place[] {
  const out: Place[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null || !el.tags) continue;
    const place = placeFromTags(osmRefToId(el.type, el.id), lat, lon, el.tags, 'overpass', 'full');
    if (place) out.push(place);
  }
  return out;
}

const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');

export async function fetchOverpassPlaces(
  center: LatLon,
  radius: number,
  categoryIds?: readonly string[],
  signal?: AbortSignal,
): Promise<{ places: Place[]; truncated: boolean }> {
  const around = `(around:${Math.round(radius)},${center.lat.toFixed(5)},${center.lon.toFixed(5)})`;
  const clauses = overpassFilters(categoryIds)
    .map(({ key, values }) => (values === '*' ? `nwr${around}["${key}"];` : `nwr${around}["${key}"~"^(${values.map(esc).join('|')})$"];`))
    .join('');
  const query = `[out:json][timeout:25];(${clauses});out center tags qt ${MAX_ELEMENTS};`;
  const elements = await run(query, signal, 25000);
  return { places: toPlaces(elements), truncated: elements.length >= MAX_ELEMENTS };
}

export async function fetchOverpassByName(term: string, center: LatLon, radius: number, signal?: AbortSignal): Promise<Place[]> {
  const around = `(around:${Math.round(radius)},${center.lat.toFixed(5)},${center.lon.toFixed(5)})`;
  const pattern = esc(term.trim()).replace(/\s+/g, '.*');
  const query = `[out:json][timeout:15];nwr${around}["name"~"${pattern}",i];out center tags qt 80;`;
  return toPlaces(await run(query, signal, 15000));
}

export async function fetchOverpassByIds(ids: string[], signal?: AbortSignal): Promise<Place[]> {
  const groups: Record<string, number[]> = { node: [], way: [], relation: [] };
  for (const id of ids) {
    const ref = idToOsm(id);
    if (ref) groups[ref.type]!.push(ref.osmId);
  }
  const parts = Object.entries(groups)
    .filter(([, list]) => list.length)
    .map(([type, list]) => `${type}(id:${list.join(',')});`)
    .join('');
  if (!parts) return [];
  return toPlaces(await run(`[out:json][timeout:15];(${parts});out center tags;`, signal, 15000));
}
