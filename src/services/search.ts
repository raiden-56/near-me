import { CATEGORIES, CATEGORY_BY_ID } from '@/data/categories';
import { isOpenNow } from '@/lib/openingHours';
import { dayPart } from '@/lib/time';
import { editDistance } from '@/lib/utils';
import type { Category, PlaceStats, PlaceWithDistance } from '@/types';

/* ── Intent parsing ─────────────────────────────────────────────────────── */

export interface SearchIntent {
  raw: string;
  /** Matched categories, most relevant first. */
  categoryIds: string[];
  /** Meaningful words left after modifiers are removed; used for name / cuisine matching. */
  terms: string[];
  /** Set when a typo was corrected, e.g. "restarant" → "restaurant". */
  corrected?: { from: string; to: string };
  openNow: boolean;
  nearMe: boolean;
  cheap: boolean;
  maxPrice?: number;
  topRated: boolean;
  lowQueue: boolean;
  availableNow: boolean;
  emergency: boolean;
  /** "parking near forum mall" → "forum mall" */
  landmark?: string;
  /** True when nothing matched a category: search by name instead. */
  nameOnly: boolean;
}

const MODIFIERS: { key: keyof Pick<SearchIntent, 'openNow' | 'nearMe' | 'cheap' | 'topRated' | 'lowQueue' | 'availableNow' | 'emergency'>; re: RegExp; keep?: boolean }[] = [
  { key: 'openNow', re: /\b(open\s*(right\s*)?now|open\s*today|open\s*late|24\s*(hours?|hrs?|x\s*7|\/\s*7)|currently\s*open)\b/g },
  { key: 'lowQueue', re: /\b(with\s+)?(low|no|short|less|small)\s*(queue|crowd|rush|waiting|wait)\b|\bnot\s+crowded\b/g },
  { key: 'availableNow', re: /\bavailable\s*(today|now|right\s*now|immediately)?\b|\btoday\b|\bright\s*now\b|\bimmediately\b/g },
  { key: 'cheap', re: /\b(cheap|cheapest|budget|affordable|inexpensive|low\s*cost|pocket\s*friendly)\b/g },
  { key: 'topRated', re: /\b(best|top\s*rated|top|highly\s*rated|good|popular|famous|recommended)\b/g },
  { key: 'emergency', re: /\b(emergency|urgent|urgently|asap)\b/g, keep: true },
  { key: 'nearMe', re: /\b(near\s*me|nearby|near\s*by|around\s*me|close\s*by|closest|nearest|around\s*here|in\s*my\s*area)\b/g },
];

const STOP = new Set(['a', 'an', 'the', 'for', 'with', 'and', 'or', 'in', 'at', 'to', 'of', 'me', 'my', 'i', 'need', 'want', 'find', 'looking', 'show', 'where', 'is', 'are', 'can', 'get', 'some', 'any', 'services', 'service', 'shop', 'store', 'place', 'places', 'near', 'under', 'below']);

interface KeywordEntry {
  keyword: string;
  category: Category;
}

const KEYWORDS: KeywordEntry[] = CATEGORIES.flatMap((category) =>
  [...new Set([category.label.toLowerCase(), category.singular.toLowerCase(), ...category.keywords])].map((keyword) => ({ keyword, category })),
).sort((a, b) => b.keyword.length - a.keyword.length);

const SINGLE_WORDS = KEYWORDS.filter((k) => !k.keyword.includes(' ') && k.keyword.length >= 4);

/** Categories that should surface together, e.g. a puncture also needs mechanics and roadside help. */
const RELATED: Record<string, string[]> = {
  'bike-repair': ['mechanics', 'car-repair'],
  'car-repair': ['mechanics'],
  mechanics: ['bike-repair', 'car-repair'],
  'medical-stores': [],
  hospitals: ['emergency-care', 'clinics'],
  'emergency-care': ['hospitals'],
  restaurants: ['fast-food', 'street-food'],
  'fast-food': ['street-food', 'restaurants'],
  cafes: ['bakeries'],
  gyms: ['yoga'],
  atms: ['banks'],
  supermarkets: ['grocery'],
  grocery: ['supermarkets'],
};

/** Human phrasing for "we also searched" chips. */
export const RELATED_LABELS: Record<string, string> = {
  'bike-repair': 'Bike puncture repair',
  mechanics: 'Two-wheeler mechanics',
  'car-repair': 'Roadside assistance',
  'medical-stores': 'Pharmacy · Medical store · Drugstore',
  'emergency-care': 'Emergency care',
};

export function parseIntent(query: string): SearchIntent {
  const raw = query.trim();
  let text = ` ${raw.toLowerCase().replace(/[₹,]/g, (c) => (c === '₹' ? ' rs ' : '')).replace(/[^\p{L}\p{N}\s/-]/gu, ' ')} `;

  const intent: SearchIntent = {
    raw, categoryIds: [], terms: [], openNow: false, nearMe: false, cheap: false, topRated: false, lowQueue: false, availableNow: false, emergency: false, nameOnly: false,
  };

  const price = text.match(/\b(?:under|below|less\s+than|within|upto|up\s+to)\s*(?:rs\.?|inr)?\s*(\d{2,6})\b/);
  if (price) {
    intent.maxPrice = Number(price[1]);
    intent.cheap = true;
    text = text.replace(price[0], ' ');
  }

  for (const { key, re, keep } of MODIFIERS) {
    re.lastIndex = 0;
    if (re.test(text)) {
      intent[key] = true;
      re.lastIndex = 0;
      if (!keep) text = text.replace(re, ' ');
    }
  }

  // "X near <landmark>": everything after "near" that is not "me".
  const near = text.match(/\bnear(?:\s+(?:a|an|the))?\s+([\p{L}\p{N}\s-]{3,})$/u);
  if (near) {
    intent.landmark = near[1]!.trim();
    text = text.slice(0, near.index);
  }

  text = ` ${text.replace(/\s+/g, ' ').trim()} `;

  // Phrase matches, longest keyword first so "bike repair" wins over "repair".
  const scores = new Map<string, number>();
  let remaining = text;
  for (const { keyword, category } of KEYWORDS) {
    if (remaining.includes(` ${keyword} `) || (keyword.length > 4 && remaining.includes(` ${keyword}s `))) {
      scores.set(category.id, (scores.get(category.id) ?? 0) + keyword.length * (text.trim() === keyword ? 3 : 1));
      if (keyword.includes(' ')) remaining = remaining.replace(` ${keyword} `, '  ');
    }
  }

  // Typo tolerance on single words when nothing matched outright.
  if (!scores.size) {
    for (const word of text.trim().split(' ').filter((w) => w.length >= 4 && !STOP.has(w))) {
      let best: { entry: KeywordEntry; d: number } | null = null;
      for (const entry of SINGLE_WORDS) {
        const allowed = entry.keyword.length > 7 ? 2 : 1;
        const d = editDistance(word, entry.keyword, allowed);
        if (d <= allowed && (!best || d < best.d)) best = { entry, d };
      }
      if (best && best.d > 0) {
        scores.set(best.entry.category.id, best.entry.keyword.length);
        intent.corrected ??= { from: word, to: best.entry.keyword };
      }
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const expanded = [...ranked];
  for (const id of ranked.slice(0, 2)) for (const rel of RELATED[id] ?? []) if (!expanded.includes(rel)) expanded.push(rel);
  // "hospital with emergency services" → emergency care first.
  if (intent.emergency && expanded.some((id) => id === 'hospitals' || id === 'clinics') && !expanded.includes('emergency-care')) expanded.unshift('emergency-care');
  if (intent.emergency && !expanded.length) expanded.push('emergency-care', 'hospitals', 'medical-stores');
  intent.categoryIds = expanded.slice(0, 5);

  intent.terms = text.trim().split(' ').filter((w) => w.length > 1 && !STOP.has(w) && w !== 'rs');
  intent.nameOnly = intent.categoryIds.length === 0 && intent.terms.length > 0;
  return intent;
}

/* ── Ranking & filtering ────────────────────────────────────────────────── */

export type SortKey = 'relevance' | 'distance' | 'rating' | 'price';

export interface SearchFilters {
  openNow: boolean;
  sort: SortKey;
  radius: number;
  /** Selected price levels (1–4); empty = any. */
  price: number[];
  minRating: number;
  /** Only places with a current "available / short queue" live update. */
  available: boolean;
}

export const DEFAULT_FILTERS: SearchFilters = { openNow: false, sort: 'relevance', radius: 2000, price: [], minRating: 0, available: false };

function textScore(place: PlaceWithDistance, terms: string[]): number {
  if (!terms.length) return 0;
  const name = place.name.toLowerCase();
  const extra = `${place.cuisine?.join(' ') ?? ''} ${place.brand ?? ''} ${place.tags.description ?? ''} ${place.tags.cuisine ?? ''}`.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (name === t) score += 6;
    else if (name.startsWith(t)) score += 4;
    else if (name.includes(t)) score += 3;
    else if (extra.includes(t)) score += 2.5;
    else if (t.length >= 5 && name.split(/\s+/).some((w) => editDistance(w, t, 1) <= 1)) score += 1.5;
  }
  return score;
}

/** Name search over places already on the device: every term must appear (typos tolerated). */
export function matchByName(places: PlaceWithDistance[], terms: string[]): PlaceWithDistance[] {
  if (!terms.length) return [];
  return places.filter((p) => {
    if (!p.hasName) return false;
    const name = p.name.toLowerCase();
    const words = name.split(/[\s'’.,&-]+/);
    return terms.every((t) => name.includes(t) || (t.length >= 5 && words.some((w) => editDistance(w, t, 1) <= 1)));
  });
}

export interface RankContext {
  intent: SearchIntent;
  filters: SearchFilters;
  stats: (place: PlaceWithDistance) => PlaceStats;
  /** Place ids with a positive live update right now. */
  availableIds?: Set<string>;
}

export function filterAndRank(places: PlaceWithDistance[], ctx: RankContext): { results: PlaceWithDistance[]; hiddenUnknownHours: number } {
  const { intent, filters, stats, availableIds } = ctx;
  let hiddenUnknownHours = 0;

  const kept = places.filter((p) => {
    if (p.distance > filters.radius) return false;
    const s = stats(p);
    if (filters.minRating && (s.rating ?? 0) < filters.minRating) return false;
    if (filters.price.length && (!s.priceLevel || !filters.price.includes(s.priceLevel))) return false;
    if (filters.available && !availableIds?.has(p.id)) return false;
    if (filters.openNow) {
      const open = isOpenNow(p.openingHours);
      if (open === null) {
        hiddenUnknownHours++;
        return false;
      }
      if (!open) return false;
    }
    return true;
  });

  const score = (p: PlaceWithDistance) => {
    const s = stats(p);
    const categoryRank = intent.categoryIds.findIndex((id) => p.categoryIds.includes(id));
    let v = textScore(p, intent.terms) * 1.4;
    if (categoryRank >= 0) v += 3 - Math.min(2, categoryRank) * 0.8;
    v += Math.max(0, 3 * (1 - p.distance / Math.max(filters.radius, 500)));
    if (s.rating) v += (s.rating - 3.5) * (intent.topRated ? 2.4 : 0.9);
    if (intent.cheap && s.priceLevel) v += (3 - s.priceLevel) * 1.2;
    if (isOpenNow(p.openingHours)) v += 0.6;
    if (intent.lowQueue && availableIds?.has(p.id)) v += 2.5;
    if (!p.hasName) v -= 1.5;
    return v;
  };

  const sorted = [...kept];
  switch (filters.sort) {
    case 'distance':
      sorted.sort((a, b) => a.distance - b.distance);
      break;
    case 'rating':
      sorted.sort((a, b) => (stats(b).rating ?? 0) - (stats(a).rating ?? 0) || a.distance - b.distance);
      break;
    case 'price':
      sorted.sort((a, b) => (stats(a).priceLevel ?? 9) - (stats(b).priceLevel ?? 9) || a.distance - b.distance);
      break;
    default: {
      const cache = new Map(sorted.map((p) => [p.id, score(p)]));
      sorted.sort((a, b) => cache.get(b.id)! - cache.get(a.id)!);
    }
  }
  return { results: sorted, hiddenUnknownHours };
}

/* ── Suggestions ────────────────────────────────────────────────────────── */

export interface Suggestion {
  kind: 'category' | 'query' | 'recent';
  label: string;
  detail?: string;
  icon: string;
  query: string;
  categoryId?: string;
}

/** Instant, offline suggestions from the taxonomy and the user's own history. */
export function localSuggestions(input: string, recent: string[]): Suggestion[] {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (s: Suggestion) => {
    const key = s.label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  };

  for (const r of recent) if (r.toLowerCase().startsWith(q) && r.toLowerCase() !== q) add({ kind: 'recent', label: r, icon: 'History', query: r });

  for (const c of CATEGORIES)
    if (c.label.toLowerCase().startsWith(q) || c.singular.toLowerCase().startsWith(q))
      add({ kind: 'category', label: c.label, detail: 'Category', icon: c.icon, query: c.label, categoryId: c.id });

  for (const { keyword, category } of KEYWORDS) {
    if (out.length >= 7) break;
    if (keyword.startsWith(q) || keyword.includes(` ${q}`)) {
      const label = keyword.replace(/^\p{L}/u, (ch) => ch.toUpperCase());
      add({ kind: 'query', label, detail: `in ${category.label}`, icon: category.icon, query: keyword, categoryId: category.id });
    }
  }

  if (out.length < 3 && q.length >= 4) {
    for (const entry of SINGLE_WORDS) {
      if (editDistance(q, entry.keyword, 1) === 1) {
        add({ kind: 'query', label: entry.keyword.replace(/^\p{L}/u, (ch) => ch.toUpperCase()), detail: `Did you mean · ${entry.category.label}`, icon: entry.category.icon, query: entry.keyword, categoryId: entry.category.id });
        if (out.length >= 5) break;
      }
    }
  }
  return out.slice(0, 7);
}

const POPULAR: Record<ReturnType<typeof dayPart>, string[]> = {
  morning: ['Breakfast near me', 'Filter coffee', 'ATM', 'Petrol pump with low queue', 'Gym', 'Medical store open now'],
  lunch: ['Cheap lunch', 'Dosa near me', 'Biryani', 'Cafe', 'ATM', 'Parking near a mall'],
  afternoon: ['Cafe to work from', 'Ice cream', 'Salon', 'Bike mechanic nearby', 'Supermarket', 'EV charging station'],
  evening: ['Street food', 'Dinner', 'Pubs and bars', 'Medical store open now', 'Park', 'Electrician available today'],
  night: ['Medical store open now', 'Petrol pump', 'ATM', 'Hospital with emergency services', 'Food open now', 'Bike puncture'],
};

/** Curated suggestions for the time of day. (Real trending needs the backend's search_history.) */
export const popularSearches = () => POPULAR[dayPart()];

export const describeIntent = (intent: SearchIntent): string => {
  const cats = intent.categoryIds.slice(0, 2).map((id) => CATEGORY_BY_ID[id]?.label).filter(Boolean);
  const bits = [cats.join(' and ') || (intent.terms.length ? `"${intent.terms.join(' ')}"` : 'Places')];
  if (intent.landmark) bits.push(`near ${intent.landmark}`);
  return bits.join(' ');
};
