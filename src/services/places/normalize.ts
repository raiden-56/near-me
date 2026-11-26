import { CATEGORY_BY_ID, classify } from '@/data/categories';
import { titleCase } from '@/lib/utils';
import type { Place, PlaceSource } from '@/types';

const LATIN = /[A-Za-z]/;

function bestName(tags: Record<string, string>): string | undefined {
  const name = tags['name:en'] || tags.name || tags['name:latin'] || tags.int_name || tags.official_name;
  if (name && LATIN.test(name)) return name.trim();
  // A name in the local script is still better than no name.
  return name?.trim() || undefined;
}

function generatedName(categoryId: string, tags: Record<string, string>): string {
  const owner = tags.brand || tags.operator || tags.network;
  switch (categoryId) {
    case 'atms':
      return owner ? `${owner} ATM` : 'ATM';
    case 'petrol-pumps':
      return owner ? `${owner} fuel station` : 'Fuel station';
    case 'ev-charging':
      return owner ? `${owner} charging` : 'EV charging point';
    case 'parking':
      if (tags.amenity === 'motorcycle_parking') return 'Two-wheeler parking';
      if (tags.parking === 'multi-storey') return 'Multi-level parking';
      if (tags.parking === 'underground') return 'Basement parking';
      if (tags.parking === 'street_side' || tags.parking === 'lane') return 'Street parking';
      return 'Parking area';
    case 'public-toilets':
      return 'Public toilet';
    case 'courier':
      if (tags.amenity === 'post_box') return 'Post box';
      if (tags.amenity === 'parcel_locker') return owner ? `${owner} parcel locker` : 'Parcel locker';
      return 'Post office';
    case 'sports':
      return tags.sport ? `${titleCase(tags.sport.split(';')[0]!)} ${tags.leisure === 'pitch' ? 'court' : 'venue'}` : 'Sports ground';
    case 'swimming':
      return 'Swimming pool';
    case 'parks':
      return tags.leisure === 'playground' ? 'Playground' : tags.leisure === 'garden' ? 'Garden' : 'Park';
    default:
      return CATEGORY_BY_ID[categoryId]?.singular ?? 'Place';
  }
}

export function addressFromTags(tags: Record<string, string>): string | undefined {
  if (tags['addr:full']) return tags['addr:full'];
  // A bare house number ("3") is not an address anyone can use: it needs a street to mean something.
  const street = tags['addr:street'] ? [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(', ') : '';
  const line1 = [tags['addr:housename'], street].filter(Boolean).join(', ');
  const area = tags['addr:place'] || tags['addr:neighbourhood'] || tags['addr:suburb'];
  if (!line1 && !area) return undefined;
  return [line1, area, tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', ');
}

const cleanUrl = (raw: string | undefined) => {
  if (!raw) return undefined;
  const url = raw.trim().split(/\s*;\s*/)[0]!;
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

const cleanPhone = (raw: string | undefined) => raw?.split(/\s*[;,/]\s*/)[0]?.trim() || undefined;

/** Turn raw OSM tags into a NearMe place. Returns null for features outside the taxonomy. */
export function placeFromTags(
  id: string,
  lat: number,
  lon: number,
  tags: Record<string, string>,
  source: PlaceSource,
  detail: Place['detail'],
): Place | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (tags.disused === 'yes' || tags.abandoned === 'yes' || tags['disused:amenity'] || tags['disused:shop']) return null;
  if (tags.access === 'private' && (tags.amenity === 'parking' || tags.leisure === 'swimming_pool' || tags.amenity === 'toilets')) return null;

  let categoryIds = classify(tags);
  if (!categoryIds.length) return null;

  const name = bestName(tags);
  // Diagnostic centres are often tagged as pharmacies on the map. When the name says otherwise,
  // believe the name: sending someone to a lab for medicines is worse than a missing result.
  if (name && categoryIds.includes('medical-stores') && /diagnos|laborator|patholog|\blabs?\b|\bscans?\b|imaging/i.test(name) && !/pharma|medical|chemist|drug/i.test(name)) {
    categoryIds = ['diagnostic-labs', ...categoryIds.filter((id) => id !== 'medical-stores' && id !== 'diagnostic-labs')];
  }
  const primary = CATEGORY_BY_ID[categoryIds[0]!]!;
  if (!name && !primary.nameless) return null;

  const cuisine = tags.cuisine
    ?.split(/\s*;\s*/)
    .map((c) => titleCase(c))
    .filter(Boolean)
    .slice(0, 4);

  return {
    id,
    name: name ?? generatedName(primary.id, tags),
    hasName: Boolean(name),
    categoryId: primary.id,
    categoryIds,
    groupId: primary.groupId,
    lat,
    lon,
    tags,
    detail,
    source,
    fetchedAt: Date.now(),
    address: addressFromTags(tags),
    locality: tags['addr:suburb'] || tags['addr:neighbourhood'] || tags['addr:place'] || undefined,
    phone: cleanPhone(tags.phone || tags['contact:phone'] || tags['contact:mobile'] || tags.mobile),
    website: cleanUrl(tags.website || tags['contact:website'] || tags.url),
    openingHours: tags.opening_hours || undefined,
    brand: tags.brand || undefined,
    cuisine: cuisine?.length ? cuisine : undefined,
  };
}

/** Merge a richer record into a thinner one, keeping whichever has more tags. */
export function mergePlace(base: Place, incoming: Place): Place {
  if (incoming.detail === 'full' || base.detail === 'basic') {
    return { ...incoming, tags: { ...base.tags, ...incoming.tags }, name: incoming.hasName ? incoming.name : base.name, hasName: incoming.hasName || base.hasName };
  }
  return base;
}

export const osmRefToId = (type: string, id: number | string) => `${type[0]!.toLowerCase()}${id}`;

export function idToOsm(id: string): { type: 'node' | 'way' | 'relation'; letter: 'N' | 'W' | 'R'; osmId: number } | null {
  const m = /^([nwr])(\d+)$/.exec(id);
  if (!m) return null;
  const type = m[1] === 'n' ? 'node' : m[1] === 'w' ? 'way' : 'relation';
  return { type, letter: m[1]!.toUpperCase() as 'N' | 'W' | 'R', osmId: Number(m[2]) };
}

export const osmUrl = (id: string) => {
  const ref = idToOsm(id);
  return ref ? `https://www.openstreetmap.org/${ref.type}/${ref.osmId}` : undefined;
};
