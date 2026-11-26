import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { env } from '@/lib/env';
import { fetchJson } from '@/lib/http';

/**
 * Map provider abstraction. The style URL (and any API key) comes from configuration, so the
 * tile provider can be swapped without touching components. When `VITE_MAP_BRAND_THEME` is on,
 * the provider's light style is recoloured to NearMe's warm palette at load time; this works
 * with any OpenMapTiles-schema style and leaves other styles untouched if layers do not match.
 */

const LIGHT = {
  background: '#F3F0E8',
  water: '#C5D9D3',
  waterLine: '#B4CDC6',
  green: '#DBE6D6',
  wood: '#D2DFCC',
  residential: '#EFECE3',
  building: '#E6E1D5',
  road: '#FFFFFF',
  roadMinor: '#FBFAF6',
  roadCasing: '#E0DACB',
  motorway: '#F7E7C2',
  motorwayCasing: '#E3CD95',
  rail: '#D2CCBE',
  boundary: '#C9C2B2',
  label: '#5B6059',
  labelStrong: '#353B36',
  labelHalo: '#F5F3ED',
  waterLabel: '#6F928A',
};

type AnyLayer = LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown>; 'source-layer'?: string };

function recolour(layer: AnyLayer): AnyLayer | null {
  const id = layer.id.toLowerCase();
  const src = (layer['source-layer'] ?? '').toLowerCase();
  const paint: Record<string, unknown> = { ...(layer.paint ?? {}) };

  // NearMe draws its own place markers; the base map's POI icons would compete with them.
  if (src === 'poi' || /^poi/.test(id)) return null;

  switch (layer.type) {
    case 'background':
      paint['background-color'] = LIGHT.background;
      break;
    case 'fill':
      if (src === 'water' || /water/.test(id)) paint['fill-color'] = LIGHT.water;
      else if (/wood|forest/.test(id)) paint['fill-color'] = LIGHT.wood;
      else if (src === 'park' || /park|green|grass|landcover|pitch|garden/.test(id)) paint['fill-color'] = LIGHT.green;
      else if (src === 'building' || /building/.test(id)) {
        paint['fill-color'] = LIGHT.building;
        delete paint['fill-outline-color'];
      } else if (/residential|landuse/.test(id)) paint['fill-color'] = LIGHT.residential;
      delete paint['fill-pattern'];
      break;
    case 'line':
      if (src === 'waterway' || /water/.test(id)) paint['line-color'] = LIGHT.waterLine;
      else if (/rail|transit/.test(id)) paint['line-color'] = LIGHT.rail;
      else if (src === 'boundary' || /boundary|admin/.test(id)) paint['line-color'] = LIGHT.boundary;
      else if (src === 'transportation' || /road|highway|street|tunnel|bridge|path/.test(id)) {
        const casing = /casing|outline/.test(id);
        const major = /motorway|trunk/.test(id);
        if (casing) paint['line-color'] = major ? LIGHT.motorwayCasing : LIGHT.roadCasing;
        else paint['line-color'] = major ? LIGHT.motorway : /minor|path|service|track/.test(id) ? LIGHT.roadMinor : LIGHT.road;
      }
      break;
    case 'symbol':
      if (paint['text-color'] !== undefined || layer.layout?.['text-field']) {
        const strong = /place|city|town|capital|suburb|country|state/.test(id);
        paint['text-color'] = /water/.test(id) ? LIGHT.waterLabel : strong ? LIGHT.labelStrong : LIGHT.label;
        paint['text-halo-color'] = LIGHT.labelHalo;
        paint['text-halo-width'] = 1.4;
        delete paint['text-halo-blur'];
      }
      break;
    default:
      break;
  }
  return { ...layer, paint } as AnyLayer;
}

const cache = new Map<string, Promise<StyleSpecification>>();

export function loadMapStyle(theme: 'light' | 'dark'): Promise<StyleSpecification> {
  const url = theme === 'dark' ? env.map.styleDarkUrl : env.map.styleUrl;
  const key = `${url}|${theme}|${env.map.brandTheme}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetchJson<StyleSpecification>(url, { timeoutMs: 12000 }).then((style) => {
      const layers = style.layers as AnyLayer[];
      const themed = theme === 'light' && env.map.brandTheme ? layers.map(recolour) : layers.filter((l) => (l['source-layer'] ?? '') !== 'poi');
      return { ...style, layers: themed.filter((l): l is AnyLayer => l !== null) as LayerSpecification[] };
    });
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

/** The font stack the loaded style already uses, so our labels request glyphs the provider serves. */
export function styleFont(style: StyleSpecification, bold = false): string[] {
  const fonts: string[][] = [];
  for (const layer of style.layers as AnyLayer[]) {
    const f = layer.layout?.['text-font'];
    if (Array.isArray(f) && f.every((x) => typeof x === 'string')) fonts.push(f as string[]);
  }
  const pick = fonts.find((f) => (bold ? /bold|semi/i.test(f[0]!) : /regular|book|medium/i.test(f[0]!))) ?? fonts[0];
  return pick ?? ['Noto Sans Regular'];
}
