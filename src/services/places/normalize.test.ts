import { describe, expect, it } from 'vitest';
import { classify, overpassFilters, tagsFromTilePoi } from '@/data/categories';
import { addressFromTags, idToOsm, osmRefToId, placeFromTags } from './normalize';

const make = (tags: Record<string, string>) => placeFromTags('n1', 12.9, 77.6, tags, 'overpass', 'full');

describe('classify', () => {
  it('maps OSM tags to NearMe categories', () => {
    expect(classify({ amenity: 'restaurant' })[0]).toBe('restaurants');
    expect(classify({ amenity: 'pharmacy' })[0]).toBe('medical-stores');
    expect(classify({ amenity: 'fuel' })[0]).toBe('petrol-pumps');
    expect(classify({ leisure: 'fitness_centre' })[0]).toBe('gyms');
    expect(classify({ amenity: 'school' })).toEqual([]);
  });

  it('uses extra tags to pick the more specific category first', () => {
    expect(classify({ amenity: 'hospital', emergency: 'yes' })[0]).toBe('emergency-care');
    expect(classify({ amenity: 'hospital' })[0]).toBe('hospitals');
    expect(classify({ amenity: 'fast_food', cuisine: 'chaat;indian' })[0]).toBe('street-food');
    expect(classify({ amenity: 'fast_food', cuisine: 'burger' })[0]).toBe('fast-food');
    expect(classify({ leisure: 'fitness_centre', sport: 'yoga' })[0]).toBe('yoga');
  });

  it('lists a motorcycle workshop under bike repair and mechanics', () => {
    expect(classify({ shop: 'motorcycle_repair' })).toEqual(expect.arrayContaining(['bike-repair', 'mechanics']));
  });
});

describe('map tile POIs', () => {
  it('rebuilds tags from a tile class and subclass', () => {
    expect(tagsFromTilePoi('fuel', 'charging_station')).toEqual({ amenity: 'charging_station' });
    expect(tagsFromTilePoi('hospital', 'clinic')).toEqual({ amenity: 'clinic' });
    expect(tagsFromTilePoi('lodging', 'hotel')).toEqual({ tourism: 'hotel' });
    expect(tagsFromTilePoi('office', 'coworking')).toEqual({ office: 'coworking' });
    expect(tagsFromTilePoi('pitch', 'tennis')).toEqual({ leisure: 'pitch', sport: 'tennis' });
  });

  it('ignores POI classes outside the taxonomy', () => {
    expect(tagsFromTilePoi('school', 'school')).toBeNull();
    expect(tagsFromTilePoi('bus', 'bus_stop')).toBeNull();
    expect(tagsFromTilePoi('gate', 'gate')).toBeNull();
  });
});

describe('placeFromTags', () => {
  it('builds a place with its derived fields', () => {
    const p = make({ amenity: 'restaurant', name: 'Udupi Grand', cuisine: 'south_indian;north_indian', phone: '+91 80 1234 5678; +91 99 0000 0000', website: 'udupigrand.example', opening_hours: 'Mo-Su 07:00-22:00' })!;
    expect(p).toMatchObject({ name: 'Udupi Grand', hasName: true, categoryId: 'restaurants', groupId: 'food', phone: '+91 80 1234 5678', website: 'https://udupigrand.example', openingHours: 'Mo-Su 07:00-22:00' });
    expect(p.cuisine).toEqual(['South Indian', 'North Indian']);
  });

  it('drops unnamed businesses but keeps unnamed utilities with a generated name', () => {
    expect(make({ amenity: 'restaurant' })).toBeNull();
    expect(make({ amenity: 'atm', operator: 'SBI' })).toMatchObject({ name: 'SBI ATM', hasName: false });
    expect(make({ amenity: 'toilets' })).toMatchObject({ name: 'Public toilet', hasName: false });
  });

  it('skips closed-down and private features', () => {
    expect(make({ amenity: 'cafe', name: 'Old Cafe', disused: 'yes' })).toBeNull();
    expect(make({ amenity: 'parking', access: 'private' })).toBeNull();
  });

  it('prefers the Latin-script name', () => {
    expect(make({ amenity: 'cafe', name: 'ಕಾಫಿ ಮನೆ', 'name:en': 'Coffee House' })!.name).toBe('Coffee House');
  });

  it('believes the name when a diagnostic centre is tagged as a pharmacy', () => {
    expect(make({ amenity: 'pharmacy', name: 'Prima Diagnostics' })!.categoryId).toBe('diagnostic-labs');
    expect(make({ amenity: 'pharmacy', name: 'Apollo Pharmacy' })!.categoryId).toBe('medical-stores');
    expect(make({ amenity: 'pharmacy', name: 'City Medicals and Diagnostics' })!.categoryId).toBe('medical-stores');
  });
});

describe('addresses and ids', () => {
  it('needs a street or an area: a bare house number is not an address', () => {
    expect(addressFromTags({ 'addr:housenumber': '3' })).toBeUndefined();
    expect(addressFromTags({ 'addr:housenumber': '3', 'addr:street': '16th Main Road', 'addr:city': 'Bengaluru' })).toBe('3, 16th Main Road, Bengaluru');
    expect(addressFromTags({ 'addr:suburb': 'BTM Layout', 'addr:postcode': '560076' })).toBe('BTM Layout, 560076');
    expect(addressFromTags({ 'addr:full': '12 Residency Road' })).toBe('12 Residency Road');
  });

  it('converts between OSM references and NearMe ids', () => {
    expect(osmRefToId('way', 639368292)).toBe('w639368292');
    expect(idToOsm('w639368292')).toEqual({ type: 'way', letter: 'W', osmId: 639368292 });
    expect(idToOsm('l_listing_1')).toBeNull();
  });
});

describe('overpassFilters', () => {
  it('builds one filter per OSM key for the requested categories', () => {
    const filters = overpassFilters(['medical-stores']);
    expect(filters).toEqual(expect.arrayContaining([{ key: 'amenity', values: ['pharmacy'] }, { key: 'shop', values: ['chemist'] }]));
    expect(overpassFilters(['attractions']).find((f) => f.key === 'historic')!.values).toBe('*');
  });
});
