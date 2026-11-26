import { CATEGORY_BY_ID } from '@/data/categories';
import { DAY } from '@/lib/time';
import { pick, seeded } from '@/lib/utils';
import type { GroupId, Place, Review } from '@/types';
import { samplePerson, sampleVoters } from './people';
import { sampleStats } from './stats';

/** Review dimensions per kind of place. Shared by real and sample reviews. */
export const REVIEW_ASPECTS: Record<string, string[]> = {
  food: ['Food', 'Service', 'Ambience', 'Value'],
  health: ['Cleanliness', 'Staff', 'Facilities'],
  automotive: ['Service quality', 'Pricing', 'Reliability'],
  home: ['Workmanship', 'Punctuality', 'Pricing'],
  fitness: ['Equipment', 'Cleanliness', 'Trainers', 'Value'],
  shopping: ['Range', 'Pricing', 'Staff'],
  daily: ['Service', 'Wait time', 'Value'],
  travel: ['Experience', 'Cleanliness', 'Value'],
  safety: ['Responsiveness', 'Helpfulness'],
  'public-toilets': ['Cleanliness', 'Accessibility', 'Upkeep'],
  parks: ['Upkeep', 'Greenery', 'Safety'],
  hotels: ['Rooms', 'Cleanliness', 'Staff', 'Value'],
  'petrol-pumps': ['Speed', 'Accuracy', 'Facilities'],
};

export const aspectsFor = (categoryId: string): string[] =>
  REVIEW_ASPECTS[categoryId] ?? REVIEW_ASPECTS[CATEGORY_BY_ID[categoryId]?.groupId ?? 'daily'] ?? REVIEW_ASPECTS.daily!;

const TEXTS: Record<GroupId | 'default', { good: string[]; mixed: string[] }> = {
  food: {
    good: [
      'Came here on a weekday evening and got a table right away. Portions are generous and everything arrived hot.',
      'Reliable spot for a quick meal. The staff remember regulars and the filter coffee at the end is a must.',
      'Clean, quick and consistent. We ordered for four and nothing missed the mark.',
      'Good place to bring family. Service was attentive without hovering, and the bill was very reasonable.',
      'I keep coming back for the breakfast menu. Gets crowded after 9, so go early.',
    ],
    mixed: [
      'Food is good but the wait on weekends can stretch past half an hour. Worth it if you are not in a hurry.',
      'Tasty, though seating is tight and it gets loud at peak time. Takeaway is the better option.',
      'Decent overall. A couple of dishes were excellent, a couple were average. Service was polite.',
    ],
  },
  health: {
    good: [
      'Staff were patient and explained everything clearly. The waiting area was clean and well organised.',
      'Got an appointment the same day. Billing was transparent and the pharmacy is right at the entrance.',
      'Well stocked and the pharmacist checked the prescription carefully before billing.',
    ],
    mixed: [
      'Good doctors, but expect a wait in the evening slots. Carry your earlier reports to save time.',
      'Clean facility. Parking is limited, so plan to come by auto or two-wheeler.',
    ],
  },
  shopping: {
    good: [
      'Well organised shelves and fresh stock. Billing counters move quickly even on weekends.',
      'Found everything on my list. Prices are fair and the staff helped locate a couple of items.',
      'Good range for the size of the store. Digital payments accepted without fuss.',
    ],
    mixed: [
      'Decent selection but aisles are narrow and it gets cramped in the evening.',
      'Prices are slightly higher than the bigger chains, but it is convenient and open late.',
    ],
  },
  automotive: {
    good: [
      'Honest work. They showed me the worn part before replacing it and charged exactly what was quoted.',
      'Quick turnaround. Dropped the bike in the morning and it was ready by lunch.',
      'Attendants are quick and the meter is reset in front of you. Air and water were both working.',
    ],
    mixed: [
      'Work quality is good. Mornings are busy, so call ahead before you bring the vehicle in.',
      'Fair pricing, but there is little space to wait. Better to drop off and come back.',
    ],
  },
  home: {
    good: [
      'Arrived on time, finished the job in under an hour and cleaned up afterwards.',
      'Clear about the cost before starting. The repair has held up for months now.',
    ],
    mixed: ['Good work once they arrive. Scheduling took a couple of calls.'],
  },
  fitness: {
    good: [
      'Equipment is well maintained and the floor never feels overcrowded before 7 am.',
      'Trainers correct your form without being pushy. Changing rooms are kept clean.',
      'Lovely in the early morning. Walking track is even and well lit.',
    ],
    mixed: [
      'Evenings between 6 and 8 are packed. Mornings are far more comfortable.',
      'Good space overall. A few benches and lights need attention.',
    ],
  },
  daily: {
    good: [
      'In and out in ten minutes. Exactly what you want from a neighbourhood service.',
      'Friendly staff and no hidden charges. I have been a regular for a year.',
      'Dependable. Rarely a queue and it has always been working when I needed it.',
    ],
    mixed: ['Service is fine. Weekends are slower, so try a weekday if you can.', 'Does the job. Could be better maintained.'],
  },
  travel: {
    good: [
      'Comfortable, clean and close to public transport. The front desk helped with local tips.',
      'Worth an unhurried hour. Go early in the day to avoid the crowd.',
      'Good place to work from for a day. Seating is comfortable and the wifi held up on calls.',
    ],
    mixed: ['Nice enough, though it gets crowded on weekends and holidays.', 'Good location. Rooms facing the road are a little noisy.'],
  },
  safety: {
    good: ['Staff at the front desk were courteous and guided me to the right counter.'],
    mixed: ['Helpful once you reach the right person. Expect some waiting.'],
  },
  default: { good: ['Good experience overall. Would come back.'], mixed: ['It was fine. Nothing to complain about.'] },
};

/** A handful of labelled sample reviews for a place. Deterministic, never stored. */
export function sampleReviews(place: Place): Review[] {
  const stats = sampleStats(place);
  if (!stats.rating || !stats.reviewCount) return [];
  const rand = seeded(`${place.id}:reviews`);
  const count = Math.min(5, 2 + Math.floor(rand() * 4), stats.reviewCount);
  const texts = TEXTS[place.groupId] ?? TEXTS.default;
  const aspects = aspectsFor(place.categoryId);
  const used = new Set<string>();
  const out: Review[] = [];

  for (let i = 0; i < count; i++) {
    const good = rand() < 0.7;
    const list = good ? texts.good : texts.mixed;
    let text = pick(rand, list);
    for (let guard = 0; used.has(text) && guard < 4; guard++) text = pick(rand, list);
    if (used.has(text)) continue;
    used.add(text);

    const person = samplePerson(`${place.id}:reviewer:${i}`);
    const rating = good ? (rand() < 0.55 ? 5 : 4) : rand() < 0.6 ? 4 : 3;
    out.push({
      id: `sample_review_${place.id}_${i}`,
      placeId: place.id,
      placeName: place.name,
      categoryId: place.categoryId,
      userId: person.id,
      userName: person.name,
      userLevel: person.level,
      rating,
      aspects: Object.fromEntries(aspects.map((a) => [a, Math.max(3, Math.min(5, rating + (rand() < 0.3 ? -1 : rand() > 0.8 ? 1 : 0)))])),
      text,
      photos: [],
      createdAt: Date.now() - Math.floor((2 + rand() * 160) * DAY),
      helpful: sampleVoters(`${place.id}_${i}`, Math.floor(rand() * rand() * 24)),
      flagged: [],
      moderation: 'visible',
      isSample: true,
    });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
