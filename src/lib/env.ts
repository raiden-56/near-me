/**
 * Single place that reads build-time configuration. Everything has a keyless default so the
 * app runs out of the box; production deployments override providers through .env files.
 */
const e = import.meta.env;

const str = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : fallback;
};

const withKey = (url: string) => url.replace('{key}', encodeURIComponent(e.VITE_MAP_API_KEY ?? ''));

export const env = {
  map: {
    styleUrl: withKey(str(e.VITE_MAP_STYLE_URL, 'https://tiles.openfreemap.org/styles/positron')),
    styleDarkUrl: withKey(str(e.VITE_MAP_STYLE_DARK_URL, 'https://tiles.openfreemap.org/styles/dark')),
    brandTheme: str(e.VITE_MAP_BRAND_THEME, 'true') !== 'false',
    poiTileJsonUrl: withKey(str(e.VITE_POI_TILEJSON_URL, 'https://tiles.openfreemap.org/planet')),
  },
  overpassUrls: str(
    e.VITE_OVERPASS_URLS,
    'https://overpass-api.de/api/interpreter,https://overpass.openstreetmap.fr/api/interpreter,https://overpass.private.coffee/api/interpreter',
  )
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean),
  photonUrl: str(e.VITE_PHOTON_URL, 'https://photon.komoot.io').replace(/\/$/, ''),
  nominatimUrl: str(e.VITE_NOMINATIM_URL, 'https://nominatim.openstreetmap.org').replace(/\/$/, ''),
  osrmUrl: str(e.VITE_OSRM_URL, 'https://routing.openstreetmap.de/routed-{profile}').replace(/\/$/, ''),
  commonsApiUrl: str(e.VITE_COMMONS_API_URL, 'https://commons.wikimedia.org/w/api.php'),
  defaultLocation: {
    lat: num(e.VITE_DEFAULT_LAT, 12.9142),
    lon: num(e.VITE_DEFAULT_LON, 77.6095),
    area: str(e.VITE_DEFAULT_AREA, 'BTM Layout'),
    city: str(e.VITE_DEFAULT_CITY, 'Bengaluru'),
    countryCode: str(e.VITE_DEFAULT_COUNTRY_CODE, 'in').toLowerCase(),
  },
  supabase: {
    url: str(e.VITE_SUPABASE_URL, ''),
    anonKey: str(e.VITE_SUPABASE_ANON_KEY, ''),
  },
  vapidPublicKey: str(e.VITE_VAPID_PUBLIC_KEY, ''),
  isDev: Boolean(e.DEV),
} as const;

/** Path the app is served from, without a trailing slash: '' at a domain root, '/near-me' on GitHub Pages. */
export const BASE_PATH = (e.BASE_URL ?? '/').replace(/\/+$/, '');

const lead = (path: string) => (path.startsWith('/') ? path : `/${path}`);

/** Absolute URL of an in-app route, for share links and auth redirects. */
export const appUrl = (path = '/') => `${window.location.origin}${BASE_PATH}${lead(path)}`;

/** URL of a file in /public (icons, bundled photos), wherever the app is hosted. */
export const assetUrl = (path: string) => `${BASE_PATH}${lead(path)}`;

/** True when a real backend is configured. Otherwise community data stays on this device. */
export const hasBackend = Boolean(env.supabase.url && env.supabase.anonKey);
