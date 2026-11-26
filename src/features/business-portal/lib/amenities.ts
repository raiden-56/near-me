import { CATEGORY_BY_ID } from '@/data/categories';
import type { GroupId } from '@/types';

/** Amenities that make sense for each kind of business. Stored on the listing as these labels. */
const BY_GROUP: Record<GroupId, string[]> = {
  food: [
    'Dine-in', 'Takeaway', 'Home delivery', 'Outdoor seating', 'Air conditioned', 'Pure vegetarian', 'Vegan options', 'Family friendly',
    'Table reservations', 'Free Wi-Fi', 'Parking', 'Wheelchair accessible', 'UPI accepted', 'Cards accepted',
  ],
  health: [
    'Open 24 hours', 'Emergency care', 'Appointments', 'Walk-ins welcome', 'Home visits', 'Online consultation', 'Home sample collection',
    'Medicine delivery', 'Cashless insurance', 'Wheelchair accessible', 'Parking', 'UPI accepted', 'Cards accepted',
  ],
  shopping: [
    'Home delivery', 'Click and collect', 'Returns accepted', 'Trial rooms', 'Gift wrapping', 'Air conditioned', 'Parking',
    'Wheelchair accessible', 'UPI accepted', 'Cards accepted',
  ],
  automotive: [
    'Open 24 hours', 'Pick-up and drop', 'Roadside assistance', 'Free air for tyres', 'Genuine spare parts', 'Service warranty',
    'Waiting lounge', 'Restrooms', 'Fast charging', 'UPI accepted', 'Cards accepted',
  ],
  home: [
    'Home visits', 'Same-day service', 'Emergency call-outs', 'Free estimates', 'Service warranty', 'Materials included',
    'Background-checked staff', 'UPI accepted',
  ],
  fitness: [
    'Personal training', 'Group classes', 'Day passes', 'Lockers', 'Showers', 'Changing rooms', 'Women-only hours', 'Air conditioned',
    'Parking', 'Wheelchair accessible', 'UPI accepted', 'Cards accepted',
  ],
  daily: [
    'Appointments', 'Walk-ins welcome', 'Home service', 'Pick-up and delivery', 'Air conditioned', 'Parking', 'Wheelchair accessible',
    'UPI accepted', 'Cards accepted',
  ],
  travel: [
    'Advance booking', 'Free Wi-Fi', 'Air conditioned', 'Restaurant on site', '24-hour front desk', 'Family friendly', 'Guided tours',
    'Parking', 'Wheelchair accessible', 'UPI accepted', 'Cards accepted',
  ],
  safety: ['Open 24 hours', 'Wheelchair accessible', 'Parking'],
};

export function amenitiesFor(categoryId: string): string[] {
  return BY_GROUP[CATEGORY_BY_ID[categoryId]?.groupId ?? 'daily'];
}
