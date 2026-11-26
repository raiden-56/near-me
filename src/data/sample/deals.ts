import { DAY } from '@/lib/time';
import { pick, seeded } from '@/lib/utils';
import type { Deal, DealKind, EventItem, EventKind, PlaceWithDistance } from '@/types';
import { sampleVoters } from './people';

interface DealDraft {
  title: string;
  description: string;
  kind: DealKind;
  badge: string;
  code?: string;
  terms?: string;
}

const FOOD: DealDraft[] = [
  { title: '20% off your total bill', description: 'On weekday lunches between 12 and 3 pm. Dine-in only.', kind: 'discount', badge: '20% off', terms: 'Not valid on public holidays.' },
  { title: 'Buy one, get one on beverages', description: 'Any two drinks from the cold or hot menu, the second is on the house.', kind: 'offer', badge: 'BOGO' },
  { title: 'Family meal for four at ₹899', description: 'Starter, two mains, breads or rice and a dessert to share.', kind: 'offer', badge: '₹899 combo' },
  { title: 'Complimentary dessert with dinner', description: 'For tables of two or more ordering mains after 7 pm.', kind: 'limited', badge: 'Free dessert' },
];

const DRAFTS: Record<string, DealDraft[]> = {
  restaurants: FOOD,
  'fast-food': FOOD.slice(0, 3),
  cafes: [
    { title: 'Morning coffee and croissant for ₹179', description: 'Any regular hot coffee with a butter croissant, until 11 am.', kind: 'offer', badge: '₹179 combo' },
    { title: 'Work-from-cafe pass', description: 'Unlimited filter coffee refills with any meal on weekdays.', kind: 'limited', badge: 'Free refills' },
    { title: '15% off for first-time visitors', description: 'Show this offer at the counter before billing.', kind: 'discount', badge: '15% off', code: 'HELLO15' },
  ],
  bakeries: [{ title: 'Fresh bakes at 30% off after 8 pm', description: 'Breads, puffs and pastries baked today, while stock lasts.', kind: 'limited', badge: '30% off' }],
  desserts: [{ title: 'Two scoops for the price of one', description: 'Every Wednesday on all regular flavours.', kind: 'offer', badge: 'BOGO' }],
  bars: [{ title: 'Happy hours, 4 to 7 pm', description: 'Selected drinks at half price, Monday to Thursday.', kind: 'happy_hour', badge: 'Happy hour' }],
  salons: [
    { title: 'Haircut and beard trim for ₹299', description: 'Walk-in or call ahead to book a slot.', kind: 'offer', badge: '₹299 combo' },
    { title: '25% off hair spa', description: 'Valid on weekdays before 4 pm.', kind: 'discount', badge: '25% off' },
  ],
  gyms: [
    { title: 'Free three-day trial pass', description: 'Full access to the floor and group classes. Carry a photo ID.', kind: 'limited', badge: 'Free trial' },
    { title: '15% off quarterly membership', description: 'Join before the end of the month.', kind: 'seasonal', badge: '15% off', code: 'FIT15' },
  ],
  yoga: [{ title: 'First class free', description: 'Try any morning batch before you enrol.', kind: 'limited', badge: 'Free class' }],
  supermarkets: [{ title: 'Weekend savers: up to 25% off staples', description: 'Rice, atta, pulses and cooking oil, Saturday and Sunday.', kind: 'seasonal', badge: 'Up to 25% off' }],
  grocery: [{ title: 'Free home delivery above ₹500', description: 'Within 2 km of the store, same day.', kind: 'offer', badge: 'Free delivery' }],
  clothing: [{ title: 'End of season sale', description: 'Up to 40% off on selected styles.', kind: 'seasonal', badge: 'Up to 40% off' }],
  electronics: [{ title: 'Exchange bonus on old phones', description: 'Extra ₹1,500 off when you trade in a working smartphone.', kind: 'offer', badge: '₹1,500 bonus' }],
  'car-wash': [{ title: 'Foam wash and vacuum for ₹349', description: 'Hatchbacks and sedans. SUVs at ₹449.', kind: 'offer', badge: '₹349' }],
  'bike-repair': [{ title: 'General service at ₹399', description: 'Oil top-up, chain clean and lube, brake check. Parts extra.', kind: 'offer', badge: '₹399 service' }],
  laundry: [{ title: '20% off your first order', description: 'Wash and fold or dry cleaning, minimum 3 kg.', kind: 'discount', badge: '20% off', code: 'FRESH20' }],
  hotels: [{ title: 'Stay two nights, save 15%', description: 'Direct bookings only. Breakfast included.', kind: 'seasonal', badge: '15% off' }],
  coworking: [{ title: 'Day pass at ₹299 this week', description: 'High-speed wifi, a hot desk and unlimited tea and coffee.', kind: 'limited', badge: '₹299 day pass' }],
  'medical-stores': [{ title: '10% off prescription medicines', description: 'On bills above ₹500. Carry a valid prescription.', kind: 'discount', badge: '10% off' }],
};

/** Labelled sample deals for a share of nearby businesses. Rotates weekly. */
export function sampleDeals(places: PlaceWithDistance[], now = Date.now()): Deal[] {
  const week = Math.floor(now / (7 * DAY));
  const out: Deal[] = [];
  for (const place of places) {
    const drafts = DRAFTS[place.categoryId];
    if (!drafts || !place.hasName) continue;
    const rand = seeded(`${place.id}:deal:${week}`);
    if (rand() > 0.16) continue;
    const draft = pick(rand, drafts);
    const endsAt = new Date(now + (1 + Math.floor(rand() * 9)) * DAY);
    endsAt.setHours(23, 0, 0, 0);
    out.push({
      id: `sample_deal_${place.id}_${week}`,
      placeId: place.id,
      placeName: place.name,
      categoryId: place.categoryId,
      groupId: place.groupId,
      lat: place.lat,
      lon: place.lon,
      ...draft,
      startsAt: now - Math.floor((1 + rand() * 4) * DAY),
      endsAt: endsAt.getTime(),
      promoted: rand() < 0.14,
      source: 'sample',
      moderation: 'visible',
      isSample: true,
    });
    if (out.length >= 40) break;
  }
  return out;
}

interface EventDraft {
  title: string;
  description: string;
  kind: EventKind;
  hour: number;
  hours: number;
  price: string;
  weekend?: boolean;
}

const EVENT_DRAFTS: Record<string, EventDraft[]> = {
  parks: [
    { title: "Sunday farmers' market", description: 'Local growers bring seasonal vegetables, millets, honey and home-made pickles. Carry your own bag.', kind: 'market', hour: 7, hours: 4, price: 'Free entry', weekend: true },
    { title: 'Morning yoga in the park', description: 'An open, beginner-friendly session led by volunteers. Bring a mat and water.', kind: 'wellness', hour: 6, hours: 1, price: 'Free' },
    { title: 'Neighbourhood clean-up drive', description: 'Gloves and bags are provided. Stay for an hour or the whole morning.', kind: 'community', hour: 7, hours: 2, price: 'Free', weekend: true },
  ],
  cafes: [
    { title: 'Open mic night', description: 'Poetry, music and stand-up from first-timers and regulars. Sign up at the counter.', kind: 'music', hour: 19, hours: 3, price: '₹199 cover' },
    { title: 'Board games evening', description: 'Over forty games on the shelf and a host to teach the rules.', kind: 'community', hour: 18, hours: 3, price: 'Free with any order' },
  ],
  events: [
    { title: 'Weekend theatre showcase', description: 'Three short plays by local theatre groups, in Kannada and English.', kind: 'culture', hour: 18, hours: 3, price: '₹300', weekend: true },
    { title: 'Indie film screening and talk', description: 'A regional feature followed by a conversation with the director.', kind: 'culture', hour: 19, hours: 2, price: '₹250' },
  ],
  sports: [
    { title: 'Five-a-side football tournament', description: 'Open registrations for neighbourhood teams. Knock-out format under lights.', kind: 'sports', hour: 17, hours: 4, price: '₹1,500 per team', weekend: true },
    { title: 'Weekend badminton social', description: 'Mixed doubles round robin for all levels. Shuttles provided.', kind: 'sports', hour: 8, hours: 2, price: '₹150', weekend: true },
  ],
  bars: [{ title: 'Live acoustic set', description: 'A two-hour set of indie and retro covers.', kind: 'music', hour: 20, hours: 2, price: 'No cover' }],
  coworking: [
    { title: "Founders' breakfast meetup", description: 'An informal morning for people building things. Come with a problem you are stuck on.', kind: 'community', hour: 9, hours: 2, price: 'Free' },
    { title: 'Intro to product design workshop', description: 'A hands-on session covering research, wireframes and feedback.', kind: 'workshop', hour: 11, hours: 3, price: '₹499', weekend: true },
  ],
  attractions: [{ title: 'Guided heritage walk', description: 'A two-hour walk through the stories behind the landmarks you pass every day.', kind: 'culture', hour: 7, hours: 2, price: '₹350', weekend: true }],
  restaurants: [{ title: 'Regional food festival', description: 'A special menu of home-style dishes from across Karnataka, this week only.', kind: 'food', hour: 12, hours: 10, price: 'À la carte' }],
  bakeries: [{ title: 'Sourdough basics class', description: 'Learn to feed a starter, shape a loaf and bake it at home.', kind: 'workshop', hour: 10, hours: 3, price: '₹899', weekend: true }],
  gyms: [{ title: 'Open house and fitness assessment', description: 'A free body composition check and a trial group class.', kind: 'wellness', hour: 8, hours: 3, price: 'Free', weekend: true }],
};

/** Labelled sample events at real nearby venues over the coming ten days. */
export function sampleEvents(places: PlaceWithDistance[], now = Date.now()): EventItem[] {
  const week = Math.floor(now / (7 * DAY));
  const out: EventItem[] = [];
  const perCategory: Record<string, number> = {};

  for (const place of places) {
    const drafts = EVENT_DRAFTS[place.categoryId];
    if (!drafts || !place.hasName) continue;
    if ((perCategory[place.categoryId] ?? 0) >= 2) continue;
    const rand = seeded(`${place.id}:event:${week}`);
    if (rand() > (place.categoryId === 'parks' || place.categoryId === 'events' ? 0.45 : 0.12)) continue;
    const draft = pick(rand, drafts);

    const start = new Date(now);
    start.setHours(draft.hour, 0, 0, 0);
    let offset = Math.floor(rand() * 9);
    for (let guard = 0; guard < 8; guard++) {
      const d = new Date(start.getTime() + offset * DAY);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if ((!draft.weekend || isWeekend) && d.getTime() + draft.hours * 3_600_000 > now) break;
      offset++;
    }
    const startsAt = start.getTime() + offset * DAY;

    perCategory[place.categoryId] = (perCategory[place.categoryId] ?? 0) + 1;
    out.push({
      id: `sample_event_${place.id}_${week}`,
      title: draft.title,
      description: draft.description,
      kind: draft.kind,
      venueName: place.name,
      placeId: place.id,
      lat: place.lat,
      lon: place.lon,
      startsAt,
      endsAt: startsAt + draft.hours * 3_600_000,
      price: draft.price,
      organizer: place.name,
      interested: sampleVoters(`${place.id}_ev`, 4 + Math.floor(rand() * 120)),
      source: 'sample',
      moderation: 'visible',
      isSample: true,
    });
    if (out.length >= 14) break;
  }
  return out.sort((a, b) => a.startsAt - b.startsAt);
}
