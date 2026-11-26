import { hash, seeded } from '@/lib/utils';
import type { Place, PlaceStats } from '@/types';

/**
 * Sample ratings. OpenStreetMap carries no ratings, so until real reviews exist NearMe can show
 * clearly-labelled sample figures. They are deterministic per place and stay in a positive band:
 * they exist to exercise the interface, not to say anything about a real business.
 */

const PRICE_BANDS: Record<string, [min: number, max: number]> = {
  restaurants: [1, 4],
  cafes: [2, 3],
  bakeries: [1, 2],
  desserts: [1, 3],
  'street-food': [1, 1],
  'fast-food': [1, 2],
  bars: [2, 4],
  gyms: [2, 4],
  yoga: [2, 3],
  salons: [1, 4],
  hotels: [2, 4],
  coworking: [2, 4],
  'car-wash': [1, 3],
  laundry: [1, 2],
  clothing: [1, 4],
  supermarkets: [1, 3],
};

/**
 * Categories that never get a sample rating: utilities where stars mean little, and health and
 * safety services, where an invented score next to a real hospital could influence a decision
 * that matters. Real reviews still work for all of them.
 */
const UNRATED = new Set([
  'atms', 'parking', 'courier', 'police', 'fire-stations', 'public-toilets', 'banks', 'sports', 'swimming',
  'hospitals', 'clinics', 'emergency-care', 'diagnostic-labs', 'medical-stores',
]);

export function sampleStats(place: Pick<Place, 'id' | 'categoryId' | 'brand' | 'hasName'>): PlaceStats {
  const rand = seeded(hash(place.id) ^ 0x51ed);
  const band = PRICE_BANDS[place.categoryId];
  const priceLevel = band ? Math.min(band[1], band[0] + Math.floor(rand() * rand() * (band[1] - band[0] + 1))) : null;

  if (UNRATED.has(place.categoryId) || !place.hasName) return { rating: null, reviewCount: 0, priceLevel, isSample: true };

  // Centre around 4.2 with a gentle spread, clamped to 3.6–4.8.
  const spread = (rand() + rand() + rand()) / 3;
  const rating = Math.round((3.6 + spread * 1.2) * 10) / 10;
  const popularity = rand() ** 2.2;
  const reviewCount = Math.round(6 + popularity * (place.brand ? 900 : 420));
  return { rating, reviewCount, priceLevel, isSample: true };
}

/** A 0–1 "buzz" score used to order Trending / Popular sections in sample mode. */
export function sampleBuzz(place: Pick<Place, 'id'>, salt = ''): number {
  return seeded(`${place.id}:${salt}:${new Date().toDateString()}`)();
}
