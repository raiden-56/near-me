import { approximate } from '@/lib/geo';
import { MIN } from '@/lib/time';
import { hash, pick, seeded } from '@/lib/utils';
import type { CommunityReport, LatLon, PlaceWithDistance, ReportType } from '@/types';
import { samplePerson, sampleVoters } from './people';

/**
 * Sample live updates attached to real nearby places. They rotate on the same expiry clock as
 * real reports so the feed behaves realistically, and every one carries `isSample: true`, which
 * the UI turns into a visible "Sample" label. They are never stored.
 */

interface Draft {
  type: ReportType;
  title: string;
  level: CommunityReport['level'];
  value?: number;
  note?: string;
}

type Maker = (rand: () => number) => Draft;

const MAKERS: Record<string, Maker> = {
  'petrol-pumps': (r) => {
    const n = 1 + Math.floor(r() * 14);
    return { type: 'queue', title: `Queue: ${n} vehicle${n === 1 ? '' : 's'}`, value: n, level: n <= 4 ? 'good' : n <= 9 ? 'moderate' : 'bad', note: n > 9 ? 'Two-wheeler lane is moving faster.' : undefined };
  },
  'ev-charging': (r) => {
    const total = 2 + Math.floor(r() * 4);
    const free = Math.floor(r() * (total + 1));
    return { type: 'availability', title: free ? `${free} of ${total} chargers free` : 'All chargers in use', value: free, level: free >= 2 ? 'good' : free === 1 ? 'moderate' : 'bad' };
  },
  parking: (r) => pick(r, [
    { type: 'parking', title: 'Parking available', level: 'good' },
    { type: 'parking', title: 'Parking is filling up', level: 'moderate' },
    { type: 'parking', title: 'Parking is full', level: 'bad', note: 'Attendant is turning cars away.' },
  ] as Draft[]),
  restaurants: (r) => {
    const n = 5 * (1 + Math.floor(r() * 8));
    return { type: 'wait_time', title: n <= 5 ? 'Tables available, no wait' : `Waiting time: ${n} minutes`, value: n <= 5 ? 0 : n, level: n <= 10 ? 'good' : n <= 25 ? 'moderate' : 'bad' };
  },
  cafes: (r) => pick(r, [
    { type: 'wait_time', title: 'Seats available', level: 'good', value: 0 },
    { type: 'wait_time', title: 'Waiting time: 10 minutes', level: 'good', value: 10 },
    { type: 'wait_time', title: 'Packed, 20 minute wait', level: 'moderate', value: 20 },
  ] as Draft[]),
  'bike-repair': (r) => pick(r, [
    { type: 'availability', title: 'Bike mechanic available now', level: 'good' },
    { type: 'wait_time', title: 'Two bikes ahead, about 30 min', level: 'moderate', value: 30 },
    { type: 'availability', title: 'Puncture repair available', level: 'good' },
  ] as Draft[]),
  'car-repair': (r) => pick(r, [
    { type: 'availability', title: 'Taking walk-in jobs today', level: 'good' },
    { type: 'availability', title: 'Fully booked until evening', level: 'bad' },
  ] as Draft[]),
  atms: (r) => pick(r, [
    { type: 'service', title: 'Cash available', level: 'good' },
    { type: 'service', title: 'Cash available', level: 'good' },
    { type: 'service', title: 'ATM out of cash', level: 'bad' },
    { type: 'queue', title: 'Queue: 5 people', level: 'moderate', value: 5 },
  ] as Draft[]),
  supermarkets: (r) => pick(r, [
    { type: 'queue', title: 'Billing counters are quick', level: 'good', value: 2 },
    { type: 'queue', title: 'Long billing queue', level: 'bad', value: 12 },
  ] as Draft[]),
  salons: (r) => pick(r, [
    { type: 'wait_time', title: 'Walk-ins welcome, no wait', level: 'good', value: 0 },
    { type: 'wait_time', title: 'Waiting time: 25 minutes', level: 'moderate', value: 25 },
  ] as Draft[]),
  'medical-stores': () => ({ type: 'availability', title: 'Open and serving', level: 'good' }),
  'public-toilets': (r) => pick(r, [
    { type: 'service', title: 'Open and recently cleaned', level: 'good' },
    { type: 'service', title: 'Water not available', level: 'bad' },
  ] as Draft[]),
  'car-wash': (r) => pick(r, [
    { type: 'queue', title: 'No queue, bay is free', level: 'good', value: 0 },
    { type: 'queue', title: 'Queue: 3 cars', level: 'moderate', value: 3 },
  ] as Draft[]),
};
MAKERS['fast-food'] = MAKERS.restaurants!;
MAKERS['street-food'] = MAKERS.cafes!;
MAKERS.mechanics = MAKERS['bike-repair']!;

const AREA_DRAFTS: ((landmark: string, area: string) => Draft)[] = [
  (l) => ({ type: 'traffic', title: `Slow-moving traffic near ${l}`, level: 'moderate', note: 'Signal cycle is long. Side roads are clearer.' }),
  (l) => ({ type: 'traffic', title: `Heavy congestion near ${l}`, level: 'bad' }),
  (l) => ({ type: 'road', title: `Road work near ${l}`, level: 'moderate', note: 'One lane closed. Two-wheelers can pass.' }),
  (_, a) => ({ type: 'outage', title: `Power cut reported in parts of ${a}`, level: 'bad' }),
  (_, a) => ({ type: 'outage', title: `Low water pressure in ${a}`, level: 'moderate' }),
  (l) => ({ type: 'event', title: `Street market setting up near ${l}`, level: 'info' }),
  (l) => ({ type: 'parking', title: `Street parking free near ${l}`, level: 'good' }),
];

export interface SampleReportContext {
  center: LatLon;
  areaLabel: string;
  now: number;
  expiryMinutes: Record<ReportType, number>;
}

function build(
  id: string,
  draft: Draft,
  at: { lat: number; lon: number; placeId?: string; placeName?: string; categoryId?: string },
  createdAt: number,
  ctx: SampleReportContext,
  rand: () => number,
): CommunityReport {
  const business = Boolean(at.placeId) && rand() < 0.16;
  const person = samplePerson(id);
  const confirmations = business ? Math.floor(rand() * 3) : Math.floor(rand() * rand() * 9);
  const disagreements = rand() < 0.12 ? 1 + Math.floor(rand() * 2) : 0;
  return {
    id,
    ...draft,
    placeId: at.placeId,
    placeName: at.placeName,
    categoryId: at.categoryId,
    lat: at.lat,
    lon: at.lon,
    areaLabel: at.placeName ?? ctx.areaLabel,
    createdAt,
    updatedAt: createdAt,
    expiresAt: createdAt + ctx.expiryMinutes[draft.type] * MIN,
    source: business ? 'business' : 'community',
    reporterId: person.id,
    reporterName: business ? (at.placeName ?? 'Business') : person.name,
    reporterLevel: business ? 'Business' : person.level,
    reporterReputation: business ? 90 : person.reputation,
    confirmations: sampleVoters(`${id}_c`, confirmations),
    disagreements: sampleVoters(`${id}_d`, disagreements),
    helpful: sampleVoters(`${id}_h`, Math.floor(rand() * 6)),
    flagged: [],
    moderation: 'visible',
    isSample: true,
  };
}

export function sampleReports(places: PlaceWithDistance[], ctx: SampleReportContext): CommunityReport[] {
  const out: CommunityReport[] = [];
  const nowMin = Math.floor(ctx.now / MIN);

  const candidates = places.filter((p) => MAKERS[p.categoryId] && (p.hasName || p.categoryId === 'atms' || p.categoryId === 'parking')).slice(0, 140);
  for (const place of candidates) {
    const probe = MAKERS[place.categoryId]!(seeded(place.id));
    const ttl = ctx.expiryMinutes[probe.type];
    // Each place cycles: a report appears, stays for its lifetime, lingers as expired, then clears.
    const period = ttl * 4;
    const phase = hash(place.id) % period;
    const cycle = Math.floor((nowMin - phase) / period);
    const created = cycle * period + phase;
    const age = nowMin - created;
    const rand = seeded(`${place.id}:${cycle}`);
    if (rand() > 0.42 || age > ttl * 1.5) continue;
    const draft = MAKERS[place.categoryId]!(rand);
    out.push(build(`sample_report_${place.id}_${cycle}`, draft, { lat: place.lat, lon: place.lon, placeId: place.id, placeName: place.name, categoryId: place.categoryId }, created * MIN, { ...ctx, expiryMinutes: { ...ctx.expiryMinutes } }, rand));
  }

  // Area-level updates anchored to an approximate point near a real landmark, never to a doorstep.
  const landmarks = places.filter((p) => p.hasName && ['malls', 'parks', 'hospitals', 'supermarkets', 'attractions', 'events', 'banks'].includes(p.categoryId)).slice(0, 24);
  AREA_DRAFTS.forEach((make, i) => {
    const anchor = landmarks.length ? landmarks[(hash(`${ctx.areaLabel}:${i}`) + i) % landmarks.length]! : null;
    const draft = make(anchor?.name ?? ctx.areaLabel, ctx.areaLabel);
    const ttl = ctx.expiryMinutes[draft.type];
    const period = ttl * 3;
    const phase = hash(`area:${ctx.areaLabel}:${i}`) % period;
    const cycle = Math.floor((nowMin - phase) / period);
    const created = cycle * period + phase;
    const rand = seeded(`area:${ctx.areaLabel}:${i}:${cycle}`);
    if (rand() > 0.6 || nowMin - created > ttl * 1.4) return;
    const point = approximate(anchor ?? ctx.center);
    out.push(build(`sample_report_area_${i}_${cycle}`, draft, { lat: point.lat, lon: point.lon }, created * MIN, ctx, rand));
  });

  return out;
}
