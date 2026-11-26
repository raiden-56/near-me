import { CATEGORY_BY_ID } from '@/data/categories';
import { assetUrl } from '@/lib/env';
import { hash } from '@/lib/utils';
import type { Place, PlacePhoto } from '@/types';
import { IMAGERY, type ImageryEntry } from './imagery.generated';

/**
 * Illustrative category imagery. These are real photographs from Wikimedia Commons chosen to
 * represent a *type* of place; they are not photos of the specific business and the UI always
 * labels them "Illustrative". They are bundled in public/imagery (credits in CREDITS.md there)
 * and the pool is produced by `npm run imagery` (see scripts/).
 */

const cache = new Map<ImageryEntry, PlacePhoto>();

function toPhoto(entry: ImageryEntry): PlacePhoto {
  let photo = cache.get(entry);
  if (!photo) {
    // Bundled photos are stored as root-relative paths; hot-linked ones are already absolute.
    const resolve = (u: string) => (u.startsWith('/') ? assetUrl(u) : u);
    photo = { thumbUrl: resolve(entry.thumbUrl), url: resolve(entry.url), kind: 'illustrative', title: entry.title, credit: entry.credit, sourceUrl: entry.sourceUrl };
    cache.set(entry, photo);
  }
  return photo;
}

function pool(place: Pick<Place, 'categoryId'>): ImageryEntry[] {
  const byCategory = IMAGERY[place.categoryId];
  if (byCategory?.length) return byCategory;
  const group = CATEGORY_BY_ID[place.categoryId]?.groupId;
  return (group && IMAGERY[`group:${group}`]) || [];
}

/** Deterministic pick so a place always shows the same image, while neighbours differ. */
export function illustrativePhoto(place: Pick<Place, 'id' | 'categoryId'>): PlacePhoto | null {
  const list = pool(place);
  return list.length ? toPhoto(list[hash(place.id) % list.length]!) : null;
}

export function illustrativePhotos(place: Pick<Place, 'id' | 'categoryId'>, count: number): PlacePhoto[] {
  const list = pool(place);
  if (!list.length || count <= 0) return [];
  const start = hash(place.id) % list.length;
  return Array.from({ length: Math.min(count, list.length) }, (_, i) => toPhoto(list[(start + i) % list.length]!));
}

export function categoryPhoto(categoryId: string, variant = 0): PlacePhoto | null {
  const list = pool({ categoryId });
  return list.length ? toPhoto(list[variant % list.length]!) : null;
}
