import { illustrativePhotos } from '@/data/imagery';
import { env } from '@/lib/env';
import { distanceMeters, snap } from '@/lib/geo';
import { fetchJson } from '@/lib/http';
import type { LatLon, Place, PlacePhoto } from '@/types';

/**
 * Real photography, in order of trust:
 *   exact         – tagged on the place itself (OSM image / Wikimedia Commons / Wikidata / Wikipedia)
 *   nearby        – geotagged Wikimedia Commons photos taken within a short walk
 *   illustrative  – curated category imagery, always labelled as such in the UI
 */

interface CommonsPage {
  title: string;
  coordinates?: { lat: number; lon: number }[];
  imageinfo?: {
    url: string;
    thumburl?: string;
    thumbwidth?: number;
    width?: number;
    mime?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value: string }>;
  }[];
}

export interface AreaPhoto extends PlacePhoto {
  lat: number;
  lon: number;
}

const stripHtml = (v: string | undefined) => v?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function credit(meta: Record<string, { value: string }> | undefined): string {
  const artist = stripHtml(meta?.Artist?.value);
  const license = stripHtml(meta?.LicenseShortName?.value);
  return [artist && artist.length < 60 ? artist : undefined, license, 'Wikimedia Commons'].filter(Boolean).join(' · ');
}

function fromPage(page: CommonsPage, kind: PlacePhoto['kind']): PlacePhoto | null {
  const info = page.imageinfo?.[0];
  if (!info?.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime ?? '')) return null;
  // Wikimedia serves a fixed set of thumbnail widths; 500 and 960 are both on it.
  const large = info.thumbwidth === 500 && (info.width ?? 0) >= 960 ? info.thumburl.replace('/500px-', '/960px-') : info.thumburl;
  return {
    url: large,
    thumbUrl: info.thumburl,
    kind,
    credit: credit(info.extmetadata),
    sourceUrl: info.descriptionurl,
    title: page.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
  };
}

const commons = (params: Record<string, string>, signal?: AbortSignal) =>
  fetchJson<{ query?: { pages?: Record<string, CommonsPage> } }>(
    `${env.commonsApiUrl}?${new URLSearchParams({ action: 'query', format: 'json', origin: '*', ...params }).toString()}`,
    { timeoutMs: 10000, signal },
  );

const IMAGE_PROPS = { prop: 'imageinfo|coordinates', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '500', iiextmetadatafilter: 'Artist|LicenseShortName' };

async function byFileTitles(titles: string[], signal?: AbortSignal): Promise<PlacePhoto[]> {
  if (!titles.length) return [];
  const json = await commons({ ...IMAGE_PROPS, titles: titles.slice(0, 10).join('|') }, signal);
  return Object.values(json.query?.pages ?? {})
    .map((p) => fromPage(p, 'exact'))
    .filter((p): p is PlacePhoto => Boolean(p));
}

async function byCommonsCategory(category: string, signal?: AbortSignal): Promise<PlacePhoto[]> {
  const json = await commons({ ...IMAGE_PROPS, generator: 'categorymembers', gcmtitle: category, gcmtype: 'file', gcmlimit: '8' }, signal);
  return Object.values(json.query?.pages ?? {})
    .map((p) => fromPage(p, 'exact'))
    .filter((p): p is PlacePhoto => Boolean(p));
}

async function wikidataImage(qid: string, signal?: AbortSignal): Promise<string | null> {
  const json = await fetchJson<{ claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] } }>(
    `https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetclaims', entity: qid, property: 'P18', format: 'json', origin: '*' }).toString()}`,
    { timeoutMs: 9000, signal },
  );
  const file = json.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return file ? `File:${file}` : null;
}

async function wikipediaImage(ref: string, signal?: AbortSignal): Promise<PlacePhoto | null> {
  const [lang, ...rest] = ref.split(':');
  const title = rest.join(':');
  if (!lang || !title || !/^[a-z-]{2,10}$/.test(lang)) return null;
  const json = await fetchJson<{ query?: { pages?: Record<string, { thumbnail?: { source: string }; fullurl?: string }> } }>(
    `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'query', titles: title, prop: 'pageimages|info', inprop: 'url', pithumbsize: '960', format: 'json', origin: '*' }).toString()}`,
    { timeoutMs: 9000, signal },
  );
  const page = Object.values(json.query?.pages ?? {})[0];
  if (!page?.thumbnail?.source) return null;
  return { url: page.thumbnail.source, thumbUrl: page.thumbnail.source, kind: 'exact', credit: 'Wikipedia', sourceUrl: page.fullurl, title };
}

const isImageUrl = (url: string) => /^https:\/\/.+\.(jpe?g|png|webp)(\?.*)?$/i.test(url);

export const hasExactPhotoTags = (place: Place) =>
  Boolean(place.tags.image || place.tags.wikimedia_commons || place.tags.wikidata || place.tags.wikipedia);

export const photosService = {
  /** Photos tagged on the place itself. Most everyday businesses have none. */
  async exact(place: Place, signal?: AbortSignal): Promise<PlacePhoto[]> {
    const t = place.tags;
    const out: PlacePhoto[] = [];
    const tasks: Promise<void>[] = [];

    if (t.image && isImageUrl(t.image)) out.push({ url: t.image, thumbUrl: t.image, kind: 'exact', credit: 'OpenStreetMap contributor' });
    if (t.wikimedia_commons?.startsWith('File:')) tasks.push(byFileTitles([t.wikimedia_commons], signal).then((p) => void out.push(...p)));
    else if (t.wikimedia_commons?.startsWith('Category:')) tasks.push(byCommonsCategory(t.wikimedia_commons, signal).then((p) => void out.push(...p)));
    if (t.wikidata && /^Q\d+$/.test(t.wikidata))
      tasks.push(
        wikidataImage(t.wikidata, signal)
          .then((file) => (file ? byFileTitles([file], signal) : []))
          .then((p) => void out.push(...p)),
      );
    if (t.wikipedia) tasks.push(wikipediaImage(t.wikipedia, signal).then((p) => void (p && out.push(p))));

    await Promise.allSettled(tasks);
    const seen = new Set<string>();
    return out.filter((p) => (seen.has(p.thumbUrl) ? false : (seen.add(p.thumbUrl), true)));
  },

  /** One request returns every geotagged Commons photo around a point; cards match against it locally. */
  async area(center: LatLon, radius = 2000, signal?: AbortSignal): Promise<AreaPhoto[]> {
    const c = snap(center, 2);
    const json = await commons(
      { ...IMAGE_PROPS, generator: 'geosearch', ggscoord: `${c.lat}|${c.lon}`, ggsradius: String(Math.min(10000, radius)), ggslimit: '80', ggsnamespace: '6' },
      signal,
    );
    const out: AreaPhoto[] = [];
    for (const page of Object.values(json.query?.pages ?? {})) {
      const coord = page.coordinates?.[0];
      const photo = fromPage(page, 'nearby');
      if (coord && photo) out.push({ ...photo, lat: coord.lat, lon: coord.lon });
    }
    return out;
  },

  /** Full gallery for a place page: exact first, then nearby, then labelled illustrative imagery. */
  async gallery(place: Place, areaPhotos: AreaPhoto[] = [], signal?: AbortSignal): Promise<PlacePhoto[]> {
    const exact = hasExactPhotoTags(place) ? await this.exact(place, signal).catch(() => []) : [];
    const nearby = nearbyPhotos(place, areaPhotos, 150).slice(0, 6);
    const combined = [...exact, ...nearby];
    if (combined.length >= 3) return combined;
    return [...combined, ...illustrativePhotos(place, 3 - combined.length)];
  },
};

export function nearbyPhotos(place: LatLon, pool: AreaPhoto[], withinMeters = 120): AreaPhoto[] {
  return pool
    .map((p) => ({ p, d: distanceMeters(place, p) }))
    .filter((x) => x.d <= withinMeters)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.p);
}
