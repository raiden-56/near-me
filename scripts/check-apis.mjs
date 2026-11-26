// Verifies that the public data providers NearMe depends on are reachable from this network.
// Usage: npm run check:apis   (optionally: node scripts/check-apis.mjs <lat> <lon>)
import { PbfReader as Pbf } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

const lat = Number(process.argv[2] ?? 12.9166);
const lon = Number(process.argv[3] ?? 77.6101);
const UA = { 'User-Agent': 'nearme-api-check/0.1' };

const timed = async (label, fn) => {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(`ok    ${label.padEnd(34)} ${String(Date.now() - t).padStart(5)} ms  ${out ?? ''}`);
    return true;
  } catch (e) {
    console.log(`FAIL  ${label.padEnd(34)} ${String(Date.now() - t).padStart(5)} ms  ${e.message}`);
    return false;
  }
};

const get = async (url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
};

const tileXY = (la, lo, z) => {
  const n = 2 ** z;
  const x = Math.floor(((lo + 180) / 360) * n);
  const r = (la * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x, y };
};

console.log(`\nNearMe provider check around ${lat}, ${lon}\n`);

await timed('Map style (OpenFreeMap)', async () => {
  const j = await (await get('https://tiles.openfreemap.org/styles/positron')).json();
  return `${j.layers.length} layers`;
});

await timed('Vector tiles + POI layer', async () => {
  const tj = await (await get('https://tiles.openfreemap.org/planet')).json();
  const { x, y } = tileXY(lat, lon, 14);
  const url = tj.tiles[0].replace('{z}', 14).replace('{x}', x).replace('{y}', y);
  const buf = new Uint8Array(await (await get(url)).arrayBuffer());
  const tile = new VectorTile(new Pbf(buf));
  const poi = tile.layers.poi;
  if (!poi) throw new Error('no poi layer');
  const sample = [];
  for (let i = 0; i < Math.min(poi.length, 4); i++) {
    const f = poi.feature(i);
    sample.push(`${f.id}:${f.properties.class}/${f.properties.subclass}:${f.properties.name ?? '-'}`);
  }
  return `${poi.length} POIs  e.g. ${sample.join(' | ')}`;
});

const q = `[out:json][timeout:20];nwr(around:500,${lat},${lon})[amenity~"^(restaurant|cafe|pharmacy|fuel)$"];out center tags 8;`;
for (const base of [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]) {
  await timed(`Overpass ${new URL(base).host}`, async () => {
    const res = await get(base, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(q),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const j = await res.json();
    return `${j.elements.length} elements, CORS=${res.headers.get('access-control-allow-origin')}`;
  });
}

await timed('Geocoding (Photon)', async () => {
  const j = await (await get(`https://photon.komoot.io/api/?q=indiranagar&lat=${lat}&lon=${lon}&limit=3`)).json();
  return j.features.map((f) => f.properties.name).join(', ');
});

await timed('Reverse geocoding (Nominatim)', async () => {
  const res = await get(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=16`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  const j = await res.json();
  return `${j.display_name?.slice(0, 60)}…  CORS=${res.headers.get('access-control-allow-origin')}`;
});

await timed('Place lookup (Nominatim)', async () => {
  const j = await (await get('https://nominatim.openstreetmap.org/lookup?osm_ids=N1&format=jsonv2&extratags=1')).json();
  return `${Array.isArray(j) ? j.length : 0} result(s)`;
});

await timed('Routing (OSRM, foot)', async () => {
  const j = await (
    await get(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${lon},${lat};${lon + 0.01},${lat + 0.004}?overview=false`)
  ).json();
  return `${Math.round(j.routes[0].distance)} m, ${Math.round(j.routes[0].duration / 60)} min`;
});

await timed('Photos (Wikimedia Commons)', async () => {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}%7C${lon}&ggsradius=2000&ggsnamespace=6&ggslimit=5&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json&origin=*`;
  const j = await (await get(u)).json();
  return `${Object.keys(j.query?.pages ?? {}).length} photos within 2 km`;
});

console.log('');
