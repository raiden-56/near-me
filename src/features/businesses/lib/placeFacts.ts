import { titleCase } from '@/lib/utils';
import type { Place } from '@/types';

/**
 * Turns raw OpenStreetMap tags into the facts shown on a place page. Each kind of place gets
 * its own fields (fuel types for a petrol pump, departments for a hospital …) and a field only
 * appears when the map data actually contains it: nothing is padded with "N/A".
 */

export interface Fact {
  icon: string;
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'neutral';
  href?: string;
}

export interface FactGroup {
  title: string;
  facts: Fact[];
  /** chips = short yes/no style amenities; rows = label + value. */
  layout: 'chips' | 'rows';
}

type Tags = Record<string, string>;

const yes = (v: string | undefined) => v === 'yes' || v === 'designated' || v === 'only';
const no = (v: string | undefined) => v === 'no';
const list = (v: string | undefined) => (v ? v.split(/\s*;\s*/).map((x) => titleCase(x)).filter(Boolean) : []);
const prefixed = (t: Tags, prefix: string, only = yes) => Object.keys(t).filter((k) => k.startsWith(prefix) && only(t[k])).map((k) => k.slice(prefix.length));

const FUEL_LABEL: Record<string, string> = {
  diesel: 'Diesel', octane_91: 'Petrol 91', octane_92: 'Petrol 92', octane_95: 'Petrol 95', octane_97: 'Premium petrol', octane_98: 'Petrol 98',
  cng: 'CNG', lpg: 'Auto LPG', e10: 'E10', e20: 'E20', e85: 'E85', adblue: 'AdBlue', electricity: 'EV charging', HGV_diesel: 'Truck diesel', biodiesel: 'Biodiesel',
};
const SOCKET_LABEL: Record<string, string> = {
  type2: 'Type 2', type2_combo: 'CCS2', chademo: 'CHAdeMO', type1: 'Type 1', type1_combo: 'CCS1', bharat_ac_001: 'Bharat AC-001', bharat_dc_001: 'Bharat DC-001',
  tesla_supercharger: 'Tesla', schuko: '3-pin socket', iec_60309: 'Industrial socket', 'tesla_destination': 'Tesla destination',
};
const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Cash', cards: 'Cards', credit_cards: 'Credit cards', debit_cards: 'Debit cards', upi: 'UPI', contactless: 'Contactless', visa: 'Visa', mastercard: 'Mastercard',
  paytm: 'Paytm', google_pay: 'Google Pay', phonepe: 'PhonePe', rupay: 'RuPay', mobile_payment: 'Mobile payments', app: 'App payment',
};
const DIET_LABEL: Record<string, string> = { vegetarian: 'Vegetarian', vegan: 'Vegan', halal: 'Halal', jain: 'Jain', gluten_free: 'Gluten-free', kosher: 'Kosher' };

const chip = (icon: string, label: string, tone: Fact['tone'] = 'good'): Fact => ({ icon, label, value: '', tone });
const row = (icon: string, label: string, value: string | undefined, href?: string): Fact | null => (value ? { icon, label, value, href } : null);
const group = (title: string, layout: FactGroup['layout'], facts: (Fact | null | false | undefined)[]): FactGroup | null => {
  const kept = facts.filter((f): f is Fact => Boolean(f));
  return kept.length ? { title, layout, facts: kept } : null;
};

function wheelchair(t: Tags): Fact | null {
  const v = t.wheelchair ?? t['toilets:wheelchair'];
  if (v === 'yes' || v === 'designated') return chip('CircleCheck', 'Wheelchair accessible');
  if (v === 'limited') return chip('CircleCheck', 'Partly wheelchair accessible', 'neutral');
  if (v === 'no') return chip('DoorClosed', 'Not wheelchair accessible', 'bad');
  return null;
}

function generalAmenities(t: Tags): (Fact | null | false)[] {
  const wifi = t.internet_access === 'wlan' || t.internet_access === 'yes' || yes(t.wifi);
  return [
    wheelchair(t),
    wifi && chip('Radio', t['internet_access:fee'] === 'no' ? 'Free Wi-Fi' : 'Wi-Fi'),
    yes(t.air_conditioning) && chip('Waves', 'Air conditioned'),
    yes(t.toilets) && chip('Toilet', 'Washroom'),
    yes(t.changing_table) && chip('CircleCheck', 'Baby changing table'),
    yes(t.drinking_water) && chip('Droplets', 'Drinking water'),
    (t.parking === 'yes' || yes(t['parking:customers'])) && chip('SquareParking', 'Customer parking'),
    yes(t.dog) && chip('CircleCheck', 'Dogs welcome'),
    no(t.smoking) && chip('CircleCheck', 'Non-smoking'),
  ];
}

function payments(t: Tags): FactGroup | null {
  const accepted = prefixed(t, 'payment:').map((k) => PAYMENT_LABEL[k] ?? titleCase(k));
  return group('Payments accepted', 'chips', [...new Set(accepted)].slice(0, 8).map((label) => chip('Banknote', label, 'neutral')));
}

function food(place: Place, t: Tags): (FactGroup | null)[] {
  const diets = Object.keys(DIET_LABEL).filter((d) => yes(t[`diet:${d}`]));
  const pureVeg = t['diet:vegetarian'] === 'only';
  const menu = t['website:menu'] || t['menu:url'] || t.menu;
  return [
    group('At a glance', 'rows', [
      row('UtensilsCrossed', 'Cuisine', place.cuisine?.join(', ')),
      row('Sandwich', 'Dietary', pureVeg ? 'Pure vegetarian' : diets.map((d) => DIET_LABEL[d]).join(', ') || undefined),
      row('Users', 'Seating', t.capacity ? `About ${t.capacity} seats` : undefined),
      row('CalendarDays', 'Reservations', t.reservation === 'required' ? 'Required' : t.reservation === 'recommended' ? 'Recommended' : yes(t.reservation) ? 'Accepted' : no(t.reservation) ? 'Walk-in only' : undefined),
      row('PenLine', 'Menu', menu && /^https?:/.test(menu) ? 'View menu' : undefined, menu && /^https?:/.test(menu) ? menu : undefined),
    ]),
    group('Services and amenities', 'chips', [
      yes(t.takeaway) && chip('Package', t.takeaway === 'only' ? 'Takeaway only' : 'Takeaway'),
      yes(t.delivery) && chip('Bike', 'Home delivery'),
      yes(t.drive_through) && chip('CarFront', 'Drive-through'),
      yes(t.outdoor_seating) && chip('Trees', 'Outdoor seating'),
      yes(t.indoor_seating) && chip('House', 'Indoor seating'),
      (yes(t.alcohol) || yes(t['drink:beer']) || yes(t['drink:wine'])) && chip('Beer', 'Serves alcohol', 'neutral'),
      yes(t.live_music) && chip('Music', 'Live music'),
      ...generalAmenities(t),
    ]),
  ];
}

function fuel(t: Tags): (FactGroup | null)[] {
  const fuels = prefixed(t, 'fuel:').map((k) => FUEL_LABEL[k] ?? titleCase(k));
  return [
    group('Fuel types', 'chips', fuels.map((f) => chip('Fuel', f, 'neutral'))),
    group('Facilities', 'chips', [
      yes(t.compressed_air) && chip('CircleCheck', 'Air filling'),
      yes(t.toilets) && chip('Toilet', 'Washroom'),
      (yes(t.car_wash) || t.amenity?.includes('car_wash')) && chip('Droplets', 'Car wash'),
      (t.shop === 'convenience' || yes(t.shop)) && chip('ShoppingBasket', 'Convenience store'),
      yes(t.self_service) && chip('CircleCheck', 'Self service', 'neutral'),
      yes(t['service:vehicle:tyres']) && chip('Cog', 'Tyre service'),
      yes(t.drinking_water) && chip('Droplets', 'Drinking water'),
      wheelchair(t),
    ]),
    group('About', 'rows', [row('Building2', 'Operated by', t.brand || t.operator)]),
  ];
}

function charging(t: Tags): (FactGroup | null)[] {
  const sockets = Object.keys(t)
    .filter((k) => /^socket:[a-z0-9_]+$/.test(k) && t[k] !== 'no')
    .map((k) => {
      const type = k.slice(7);
      const count = /^\d+$/.test(t[k]!) ? ` × ${t[k]}` : '';
      const power = t[`${k}:output`] ? ` · ${t[`${k}:output`]}` : '';
      return `${SOCKET_LABEL[type] ?? titleCase(type)}${count}${power}`;
    });
  return [
    group('Connectors', 'chips', sockets.map((s) => chip('PlugZap', s, 'neutral'))),
    group('Charging details', 'rows', [
      row('PlugZap', 'Charging points', t.capacity),
      row('Building2', 'Network', t.network || t.operator || t.brand),
      row('IndianRupee', 'Fee', yes(t.fee) ? (t.charge ?? 'Paid') : no(t.fee) ? 'Free to use' : undefined),
      row('KeyRound', 'Access', t.access === 'customers' ? 'Customers only' : t.access === 'private' ? 'Private' : t.access === 'yes' ? 'Public' : undefined),
      row('Bike', 'Vehicles', [yes(t.motorcar) && 'Cars', (yes(t.motorcycle) || yes(t.scooter)) && 'Two-wheelers', yes(t.bicycle) && 'E-bikes'].filter(Boolean).join(', ') || undefined),
    ]),
  ];
}

function parking(t: Tags): (FactGroup | null)[] {
  const type: Record<string, string> = { surface: 'Open-air lot', 'multi-storey': 'Multi-level', underground: 'Basement', street_side: 'Street-side', lane: 'On-street', rooftop: 'Rooftop' };
  return [
    group('Parking details', 'rows', [
      row('SquareParking', 'Type', type[t.parking ?? ''] ?? (t.amenity === 'motorcycle_parking' ? 'Two-wheeler parking' : undefined)),
      row('CarFront', 'Spaces', t.capacity ? `About ${t.capacity}` : undefined),
      row('IndianRupee', 'Fee', yes(t.fee) ? (t.charge ?? 'Paid parking') : no(t.fee) ? 'Free' : undefined),
      row('KeyRound', 'Access', t.access === 'customers' ? 'Customers only' : t.access === 'permit' ? 'Permit holders' : t.access === 'yes' ? 'Open to all' : undefined),
      row('Hourglass', 'Maximum stay', t.maxstay),
    ]),
    group('Features', 'chips', [
      yes(t.covered) && chip('House', 'Covered'),
      yes(t.supervised) && chip('Shield', 'Attended'),
      yes(t.lit) && chip('Sun', 'Well lit'),
      Boolean(t['capacity:disabled']) && t['capacity:disabled'] !== 'no' && chip('CircleCheck', 'Accessible bays'),
      wheelchair(t),
    ]),
  ];
}

function mechanic(place: Place, t: Tags): (FactGroup | null)[] {
  const services = prefixed(t, 'service:vehicle:').concat(prefixed(t, 'service:bicycle:')).map((s) => titleCase(s));
  const vehicles = [
    (t.shop === 'motorcycle_repair' || t.shop === 'motorcycle' || yes(t.motorcycle)) && 'Two-wheelers',
    (t.shop === 'car_repair' || t.shop === 'tyres' || t.shop === 'car_parts' || yes(t.motorcar)) && 'Cars',
    (t.shop === 'bicycle' || t.amenity === 'bicycle_repair_station') && 'Bicycles',
    yes(t.hgv) && 'Trucks',
  ].filter(Boolean) as string[];
  return [
    group('What they work on', 'rows', [row('Bike', 'Vehicle types', vehicles.join(', ') || undefined), row('Building2', 'Brands', list(t.brand ?? t['motorcycle:brand'] ?? t['car:brand']).join(', ') || place.brand)]),
    group('Services', 'chips', [...new Set(services)].slice(0, 12).map((s) => chip('Wrench', s, 'neutral'))),
    group('Good to know', 'chips', [yes(t['service:vehicle:emergency']) || yes(t.emergency) ? chip('Siren', 'Emergency repair') : null, ...generalAmenities(t)]),
  ];
}

function hospital(t: Tags): (FactGroup | null)[] {
  const specialities = list(t['healthcare:speciality']);
  const type: Record<string, string> = { government: 'Government', public: 'Public', private: 'Private', private_non_profit: 'Charitable trust', religious: 'Faith-run', ngo: 'Non-profit' };
  return [
    group('Care available', 'rows', [
      row('Siren', 'Emergency', yes(t.emergency) ? 'Emergency department available' : no(t.emergency) ? 'No emergency department listed' : undefined),
      row('BedDouble', 'Beds', t.beds),
      row('Building2', 'Run by', [t.operator, type[t['operator:type'] ?? '']].filter(Boolean).join(' · ') || undefined),
    ]),
    group('Departments', 'chips', specialities.slice(0, 14).map((s) => chip('Stethoscope', s, 'neutral'))),
    group('Facilities', 'chips', [yes(t['pharmacy']) && chip('Pill', 'In-house pharmacy'), yes(t.dispensing) && chip('Pill', 'Dispenses prescriptions'), ...generalAmenities(t)]),
  ];
}

function gym(t: Tags): (FactGroup | null)[] {
  const sports = list(t.sport);
  return [
    group('Activities', 'chips', sports.slice(0, 10).map((s) => chip('Dumbbell', s, 'neutral'))),
    group('Membership', 'rows', [row('IndianRupee', 'Fees', t.charge ?? (yes(t.fee) ? 'Paid membership' : no(t.fee) ? 'Free to use' : undefined)), row('Users', 'Open to', t.access === 'members' ? 'Members only' : t.access === 'yes' ? 'Everyone' : undefined)]),
    group('Facilities', 'chips', [
      yes(t.shower) && chip('ShowerHead', 'Showers'),
      yes(t.changing_room) && chip('CircleCheck', 'Changing rooms'),
      yes(t.sauna) && chip('Flame', 'Sauna'),
      yes(t.swimming_pool) && chip('Waves', 'Swimming pool'),
      yes(t.lockers) && chip('KeyRound', 'Lockers'),
      ...generalAmenities(t),
    ]),
  ];
}

function toilet(t: Tags): (FactGroup | null)[] {
  const who = [yes(t.male) && 'Men', yes(t.female) && 'Women', yes(t.unisex) && 'Unisex'].filter(Boolean).join(', ');
  return [
    group('Access', 'rows', [
      row('CircleCheck', 'Accessibility', t.wheelchair === 'yes' || t['toilets:wheelchair'] === 'yes' ? 'Wheelchair accessible' : t.wheelchair === 'no' ? 'Not wheelchair accessible' : undefined),
      row('IndianRupee', 'Fee', yes(t.fee) ? (t.charge ?? 'Small fee') : no(t.fee) ? 'Free' : undefined),
      row('Users', 'For', who || undefined),
      row('Toilet', 'Type', t['toilets:position'] ? list(t['toilets:position']).join(', ') : undefined),
      row('Building2', 'Maintained by', t.operator),
    ]),
    group('Facilities', 'chips', [
      yes(t.changing_table) && chip('CircleCheck', 'Baby changing table'),
      yes(t.drinking_water) && chip('Droplets', 'Drinking water'),
      (yes(t['toilets:handwashing']) || yes(t.handwashing)) && chip('Droplets', 'Handwashing'),
      yes(t.shower) && chip('ShowerHead', 'Shower'),
      yes(t.supervised) && chip('Shield', 'Attended'),
    ]),
  ];
}

function bank(t: Tags): (FactGroup | null)[] {
  return [
    group('Services', 'chips', [
      (t.amenity === 'atm' || yes(t.atm)) && chip('Banknote', 'Cash withdrawal'),
      yes(t.cash_in) && chip('Banknote', 'Cash deposit'),
      yes(t.drive_through) && chip('CarFront', 'Drive-through'),
      t.indoor === 'yes' && chip('House', 'Indoor', 'neutral'),
      wheelchair(t),
    ]),
    group('About', 'rows', [row('Landmark', 'Bank', t.brand || t.operator), row('Building2', 'Network', t.network), row('PenLine', 'Branch code', t.ref || t['ref:ifsc'])]),
  ];
}

function stay(t: Tags): (FactGroup | null)[] {
  return [
    group('About this stay', 'rows', [
      row('Star', 'Rating', t.stars ? `${t.stars}-star` : undefined),
      row('BedDouble', 'Rooms', t.rooms),
      row('Hourglass', 'Check-in', t.check_in),
      row('Hourglass', 'Check-out', t.check_out),
    ]),
    group('Amenities', 'chips', [yes(t.breakfast) && chip('Coffee', 'Breakfast'), yes(t.swimming_pool) && chip('Waves', 'Pool'), yes(t.bar) && chip('Beer', 'Bar', 'neutral'), yes(t.restaurant) && chip('UtensilsCrossed', 'Restaurant'), ...generalAmenities(t)]),
  ];
}

function park(t: Tags): (FactGroup | null)[] {
  return [
    group('Good to know', 'chips', [
      yes(t.lit) && chip('Sun', 'Lit at night'),
      (yes(t.playground) || t.leisure === 'playground') && chip('CircleCheck', 'Play area'),
      yes(t.dog) && chip('CircleCheck', 'Dogs welcome'),
      no(t.dog) && chip('DoorClosed', 'No dogs', 'bad'),
      yes(t.bench) && chip('CircleCheck', 'Benches'),
      yes(t.drinking_water) && chip('Droplets', 'Drinking water'),
      yes(t.toilets) && chip('Toilet', 'Washroom'),
      no(t.fee) && chip('CircleCheck', 'Free entry'),
      yes(t.fee) && chip('IndianRupee', t.charge ? `Entry ${t.charge}` : 'Entry fee', 'neutral'),
      wheelchair(t),
    ]),
    group('Details', 'rows', [row('Trophy', 'Sports', list(t.sport).join(', ') || undefined), row('Trees', 'Surface', t.surface ? titleCase(t.surface) : undefined), row('Building2', 'Maintained by', t.operator)]),
  ];
}

export function placeFacts(place: Place): FactGroup[] {
  const t = place.tags;
  let groups: (FactGroup | null)[];
  switch (place.categoryId) {
    case 'restaurants': case 'cafes': case 'bakeries': case 'desserts': case 'street-food': case 'fast-food': case 'bars':
      groups = food(place, t);
      break;
    case 'petrol-pumps':
      groups = fuel(t);
      break;
    case 'ev-charging':
      groups = charging(t);
      break;
    case 'parking':
      groups = parking(t);
      break;
    case 'bike-repair': case 'car-repair': case 'mechanics': case 'car-wash':
      groups = mechanic(place, t);
      break;
    case 'hospitals': case 'clinics': case 'emergency-care': case 'diagnostic-labs': case 'medical-stores':
      groups = hospital(t);
      break;
    case 'gyms': case 'yoga': case 'sports': case 'swimming':
      groups = gym(t);
      break;
    case 'public-toilets':
      groups = toilet(t);
      break;
    case 'atms': case 'banks':
      groups = bank(t);
      break;
    case 'hotels':
      groups = stay(t);
      break;
    case 'parks': case 'attractions':
      groups = park(t);
      break;
    default:
      groups = [
        group('About', 'rows', [row('Building2', 'Brand', t.brand), row('Users', 'Operated by', t.operator !== t.brand ? t.operator : undefined), row('Trophy', 'Speciality', list(t.sport ?? t.craft ?? t.cuisine).join(', ') || undefined)]),
        group('Amenities', 'chips', generalAmenities(t)),
      ];
  }
  const pay = payments(t);
  return [...groups, pay].filter((g): g is FactGroup => Boolean(g));
}

/** Short description when the map data carries one. */
export const placeDescription = (place: Place): string | undefined => place.tags['description:en'] || place.tags.description || place.tags.note || undefined;
