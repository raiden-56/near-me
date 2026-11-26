import { describe, expect, it } from 'vitest';
import type { PlaceStats, PlaceWithDistance } from '@/types';
import { DEFAULT_FILTERS, filterAndRank, localSuggestions, matchByName, parseIntent } from './search';

describe('parseIntent', () => {
  it('maps everyday words to categories', () => {
    expect(parseIntent('dosa near me')).toMatchObject({ nearMe: true, nameOnly: false });
    expect(parseIntent('dosa near me').categoryIds[0]).toBe('restaurants');
    expect(parseIntent('ATM').categoryIds[0]).toBe('atms');
    expect(parseIntent('EV charging station').categoryIds[0]).toBe('ev-charging');
  });

  it('treats synonyms as the same category', () => {
    for (const q of ['medical shop', 'pharmacy', 'drugstore', 'chemist']) expect(parseIntent(q).categoryIds[0]).toBe('medical-stores');
  });

  it('expands a puncture search to mechanics and roadside help', () => {
    expect(parseIntent('bike puncture').categoryIds).toEqual(expect.arrayContaining(['bike-repair', 'mechanics', 'car-repair']));
    expect(parseIntent('bike puncture').categoryIds[0]).toBe('bike-repair');
  });

  it('reads modifiers out of the sentence', () => {
    expect(parseIntent('medical store open now')).toMatchObject({ openNow: true });
    expect(parseIntent('petrol pump with low queue')).toMatchObject({ lowQueue: true });
    expect(parseIntent('petrol pump with low queue').categoryIds[0]).toBe('petrol-pumps');
    expect(parseIntent('electrician available today')).toMatchObject({ availableNow: true });
    expect(parseIntent('cheap lunch')).toMatchObject({ cheap: true });
    expect(parseIntent('best cafe')).toMatchObject({ topRated: true });
  });

  it('extracts a budget', () => {
    const intent = parseIntent('gym under ₹2000');
    expect(intent.maxPrice).toBe(2000);
    expect(intent.categoryIds[0]).toBe('gyms');
  });

  it('separates the landmark from what is being looked for', () => {
    const intent = parseIntent('parking near a mall');
    expect(intent.landmark).toBe('mall');
    expect(intent.categoryIds[0]).toBe('parking');
    expect(intent.nearMe).toBe(false);
  });

  it('puts emergency care first for emergency searches', () => {
    expect(parseIntent('hospital with emergency services').categoryIds[0]).toBe('emergency-care');
  });

  it('tolerates typos and says what it corrected', () => {
    const intent = parseIntent('restarant');
    expect(intent.categoryIds[0]).toBe('restaurants');
    expect(intent.corrected).toEqual({ from: 'restarant', to: 'restaurant' });
  });

  it('falls back to a name search when nothing matches a category', () => {
    const intent = parseIntent('Adyar Ananda Bhavan');
    expect(intent.nameOnly).toBe(true);
    expect(intent.terms).toEqual(['adyar', 'ananda', 'bhavan']);
  });
});

const place = (over: Partial<PlaceWithDistance>): PlaceWithDistance => ({
  id: 'n1', name: 'Place', hasName: true, categoryId: 'restaurants', categoryIds: ['restaurants'], groupId: 'food', lat: 0, lon: 0, tags: {},
  detail: 'full', source: 'overpass', fetchedAt: 0, distance: 100, ...over,
});
const noStats = (): PlaceStats => ({ rating: null, reviewCount: 0, priceLevel: null, isSample: false });

describe('filterAndRank', () => {
  const near = place({ id: 'n1', name: 'Udupi Grand', distance: 80 });
  const dosa = place({ id: 'n2', name: '99 Varieties Dosa', distance: 300 });
  const far = place({ id: 'n3', name: 'Far Diner', distance: 5000 });

  it('ranks a name match above a nearer place that only matches the category', () => {
    const { results } = filterAndRank([near, dosa], { intent: parseIntent('dosa'), filters: DEFAULT_FILTERS, stats: noStats });
    expect(results[0]!.id).toBe('n2');
  });

  it('applies the radius', () => {
    const { results } = filterAndRank([near, far], { intent: parseIntent('restaurant'), filters: { ...DEFAULT_FILTERS, radius: 2000 }, stats: noStats });
    expect(results.map((p) => p.id)).toEqual(['n1']);
  });

  it('hides places without listed hours under "open now" and counts them', () => {
    const always = place({ id: 'n4', openingHours: '24/7' });
    const { results, hiddenUnknownHours } = filterAndRank([near, always], { intent: parseIntent(''), filters: { ...DEFAULT_FILTERS, openNow: true }, stats: noStats });
    expect(results.map((p) => p.id)).toEqual(['n4']);
    expect(hiddenUnknownHours).toBe(1);
  });

  it('keeps only places with a positive live update when "available" is on', () => {
    const { results } = filterAndRank([near, dosa], { intent: parseIntent(''), filters: { ...DEFAULT_FILTERS, available: true }, stats: noStats, availableIds: new Set(['n2']) });
    expect(results.map((p) => p.id)).toEqual(['n2']);
  });

  it('sorts by rating when asked', () => {
    const stats = (p: PlaceWithDistance): PlaceStats => ({ ...noStats(), rating: p.id === 'n2' ? 4.8 : 4.1 });
    const { results } = filterAndRank([near, dosa], { intent: parseIntent(''), filters: { ...DEFAULT_FILTERS, sort: 'rating' }, stats });
    expect(results[0]!.id).toBe('n2');
  });
});

describe('matchByName and suggestions', () => {
  it('matches names with small typos', () => {
    const list = [place({ id: 'n1', name: 'Adyar Ananda Bhavan' }), place({ id: 'n2', name: 'Star Biryani' })];
    expect(matchByName(list, ['adyar']).map((p) => p.id)).toEqual(['n1']);
    expect(matchByName(list, ['biriyani']).map((p) => p.id)).toEqual(['n2']);
  });

  it('suggests categories and recent searches as you type', () => {
    const out = localSuggestions('caf', ['Cafe to work from']);
    expect(out[0]).toMatchObject({ kind: 'recent', label: 'Cafe to work from' });
    expect(out.some((s) => s.categoryId === 'cafes')).toBe(true);
  });
});
