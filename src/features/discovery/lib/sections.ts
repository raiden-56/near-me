import { ESSENTIAL_CATEGORY_IDS } from '@/data/categories';
import { sampleBuzz } from '@/data/sample/stats';
import { isOpenNow } from '@/lib/openingHours';
import { isWeekend } from '@/lib/time';
import type { PlaceStats, PlaceWithDistance } from '@/types';

export interface DiscoverSections {
  popular: PlaceWithDistance[];
  openNow: PlaceWithDistance[];
  essentials: PlaceWithDistance[];
  favorites: PlaceWithDistance[];
  trending: PlaceWithDistance[];
  topRated: PlaceWithDistance[];
  newPlaces: PlaceWithDistance[];
  weekend: PlaceWithDistance[];
  /** How many nearby places have opening hours we can evaluate. */
  withHours: number;
}

const SOCIAL = new Set(['food', 'travel', 'fitness', 'shopping']);
const WEEKEND_CATEGORIES = ['parks', 'attractions', 'events', 'cafes', 'bars', 'sports', 'malls', 'desserts', 'swimming'];

/** Signals that exist in OpenStreetMap itself, used when there are no ratings to go on. */
const notability = (p: PlaceWithDistance) =>
  (p.tags.wikidata || p.tags.wikipedia ? 3 : 0) + (p.brand ? 1 : 0) + (p.website ? 1 : 0) + (p.phone ? 0.5 : 0) + (p.openingHours ? 0.5 : 0);

/**
 * Split the places around the user into the home-screen sections. A place appears in at most
 * one of the headline sections so the page never feels like the same list repeated.
 */
export function buildSections(places: PlaceWithDistance[], stats: (p: PlaceWithDistance) => PlaceStats, sample: boolean): DiscoverSections {
  const named = places.filter((p) => p.hasName);
  const used = new Set<string>();
  const take = (list: PlaceWithDistance[], n: number, reserve = true) => {
    const out: PlaceWithDistance[] = [];
    for (const p of list) {
      if (used.has(p.id)) continue;
      out.push(p);
      if (reserve) used.add(p.id);
      if (out.length >= n) break;
    }
    return out;
  };

  const rated = named.map((p) => ({ p, s: stats(p) })).filter((x) => x.s.rating != null);
  const proximity = (p: PlaceWithDistance) => Math.max(0, 1 - p.distance / 2500);

  const popular = take(
    [...(rated.length ? rated.map((x) => x.p) : named)]
      .filter((p) => SOCIAL.has(p.groupId))
      .sort((a, b) => {
        const score = (p: PlaceWithDistance) => {
          const s = stats(p);
          return (s.rating ? (s.rating - 3.5) * Math.log10(10 + s.reviewCount) * 1.6 : 0) + notability(p) * 0.6 + proximity(p) * 1.5;
        };
        return score(b) - score(a);
      }),
    6,
  );

  const withHours = places.filter((p) => isOpenNow(p.openingHours) !== null).length;
  const openNow = take(
    // "Open right now" is about places you would go out to, not utilities that never close.
    named.filter((p) => isOpenNow(p.openingHours) === true && p.groupId !== 'safety' && !['public-toilets', 'atms', 'parking', 'courier', 'ev-charging'].includes(p.categoryId)),
    12,
    false,
  );

  // Nearest of each essential type, whether or not it has a name.
  const essentials: PlaceWithDistance[] = [];
  for (const id of ESSENTIAL_CATEGORY_IDS) {
    const hit = places.find((p) => p.categoryIds.includes(id) && !essentials.includes(p));
    if (hit) essentials.push(hit);
  }

  const topRated = take(
    rated
      .filter((x) => x.s.reviewCount >= (sample ? 30 : 1))
      .sort((a, b) => b.s.rating! - a.s.rating! || b.s.reviewCount - a.s.reviewCount)
      .map((x) => x.p),
    5,
  );

  const favorites = take(
    rated
      .filter((x) => !x.p.brand && x.s.rating! >= 4.3 && x.p.groupId !== 'safety')
      .sort((a, b) => b.s.rating! * 2 + proximity(b.p) - (a.s.rating! * 2 + proximity(a.p)))
      .map((x) => x.p),
    6,
  );

  // Trending needs activity data. In sample mode it rotates daily; otherwise the section is omitted.
  const trending = sample
    ? take(
        named.filter((p) => SOCIAL.has(p.groupId)).sort((a, b) => sampleBuzz(b, 'trend') - sampleBuzz(a, 'trend')),
        8,
      )
    : [];

  // Higher node ids were added to OpenStreetMap more recently: a real "new on the map" signal.
  const newPlaces = take(
    named
      .filter((p) => p.id.startsWith('n') && p.groupId !== 'safety' && p.categoryId !== 'atms')
      .sort((a, b) => Number(b.id.slice(1)) - Number(a.id.slice(1))),
    10,
    false,
  );

  const weekendPool = named.filter((p) => WEEKEND_CATEGORIES.includes(p.categoryId));
  const weekend: PlaceWithDistance[] = [];
  const perCategory: Record<string, number> = {};
  for (const p of weekendPool.sort((a, b) => notability(b) + proximity(b) - (notability(a) + proximity(a)))) {
    if ((perCategory[p.categoryId] ?? 0) >= 3) continue;
    perCategory[p.categoryId] = (perCategory[p.categoryId] ?? 0) + 1;
    weekend.push(p);
    if (weekend.length >= 9) break;
  }

  return { popular, openNow, essentials, favorites, trending, topRated, newPlaces, weekend, withHours };
}

export const weekendHeading = () => (isWeekend() ? { title: 'Explore this weekend', subtitle: 'Easy outings close to you' } : { title: 'Explore this weekend', subtitle: 'Plan ahead: parks, sights and places to unwind' });
