import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { tagsFromTilePoi } from '@/data/categories';
import { env } from '@/lib/env';
import { bboxAround, distanceMeters, tileXY } from '@/lib/geo';
import { fetchJson, fetchWithTimeout } from '@/lib/http';
import type { LatLon, Place } from '@/types';
import { placeFromTags } from './normalize';

/**
 * Baseline place source: the `poi` layer of the same OpenMapTiles vector tiles the map renders.
 * It is served from a CDN, so it is fast and dependable, but each POI only carries its name,
 * type and position. Richer tags (hours, phone, cuisine) come from Overpass / Nominatim.
 */

const POI_ZOOM = 14;
const MAX_TILES = 25;
const TILE_CACHE_LIMIT = 60;

let templatePromise: Promise<string> | null = null;
const tileCache = new Map<string, Promise<Place[]>>();

async function tileTemplate(): Promise<string> {
  templatePromise ??= fetchJson<{ tiles?: string[] }>(env.map.poiTileJsonUrl, { timeoutMs: 10000 })
    .then((tj) => {
      const t = tj.tiles?.[0];
      if (!t) throw new Error('Tile source has no tile URL');
      return t;
    })
    .catch((error) => {
      templatePromise = null;
      throw error;
    });
  return templatePromise;
}

const ELEMENT = ['', 'n', 'w', 'r'];

async function loadTile(x: number, y: number, signal?: AbortSignal): Promise<Place[]> {
  const key = `${x}/${y}`;
  const hit = tileCache.get(key);
  if (hit) return hit;

  const task = (async () => {
    const template = await tileTemplate();
    const url = template.replace('{z}', String(POI_ZOOM)).replace('{x}', String(x)).replace('{y}', String(y));
    const res = await fetchWithTimeout(url, { timeoutMs: 15000, signal });
    const tile = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())));
    const layer = tile.layers.poi;
    if (!layer) return [];

    const n = 2 ** POI_ZOOM;
    const places: Place[] = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const props = f.properties as Record<string, string | number | undefined>;
      const tags = tagsFromTilePoi(String(props.class ?? ''), props.subclass == null ? undefined : String(props.subclass));
      if (!tags) continue;

      // Planetiler encodes the OSM id as id * 10 + element type (1 node, 2 way, 3 relation).
      const fid = Number(f.id);
      const letter = ELEMENT[fid % 10];
      if (!letter || !Number.isFinite(fid)) continue;

      const pt = f.loadGeometry()[0]?.[0];
      if (!pt) continue;
      const lon = ((x + pt.x / layer.extent) / n) * 360 - 180;
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + pt.y / layer.extent)) / n))) * 180) / Math.PI;

      const name = props['name:latin'] || props.name_en || props.name;
      if (name) tags.name = String(name);
      const place = placeFromTags(`${letter}${Math.floor(fid / 10)}`, lat, lon, tags, 'tiles', 'basic');
      if (place) places.push(place);
    }
    return places;
  })();

  tileCache.set(key, task);
  task.catch(() => tileCache.delete(key));
  if (tileCache.size > TILE_CACHE_LIMIT) tileCache.delete(tileCache.keys().next().value!);
  return task;
}

export interface TileResult {
  places: Place[];
  coveredRadius: number;
}

export async function fetchTilePlaces(center: LatLon, radius: number, signal?: AbortSignal): Promise<TileResult> {
  // Shrink very wide searches until the tile count is reasonable for a phone.
  let covered = radius;
  let range = tileRange(center, covered);
  while (range.count > MAX_TILES && covered > 1000) {
    covered = Math.round(covered * 0.8);
    range = tileRange(center, covered);
  }

  const jobs: Promise<Place[]>[] = [];
  for (let x = range.x0; x <= range.x1; x++) for (let y = range.y0; y <= range.y1; y++) jobs.push(loadTile(x, y, signal));
  const settled = await Promise.allSettled(jobs);
  const ok = settled.filter((s): s is PromiseFulfilledResult<Place[]> => s.status === 'fulfilled');
  if (!ok.length) throw (settled[0] as PromiseRejectedResult).reason;

  const seen = new Set<string>();
  const places: Place[] = [];
  for (const { value } of ok)
    for (const p of value) {
      if (seen.has(p.id) || distanceMeters(center, p) > covered) continue;
      seen.add(p.id);
      places.push(p);
    }
  return { places, coveredRadius: covered };
}

function tileRange(center: LatLon, radius: number) {
  const b = bboxAround(center, radius);
  const a = tileXY({ lat: b.north, lon: b.west }, POI_ZOOM);
  const z = tileXY({ lat: b.south, lon: b.east }, POI_ZOOM);
  return { x0: a.x, x1: z.x, y0: a.y, y1: z.y, count: (z.x - a.x + 1) * (z.y - a.y + 1) };
}
