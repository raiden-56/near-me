import { CATEGORY_BY_ID } from '@/data/categories';
import { businessContactSchema } from '@/lib/schemas';
import { basicsSchema, hasLocation } from '@/services/businessPortal';
import type { BusinessListing } from '@/types';
import { hasOpenDay } from './hours';

export interface CompletionItem {
  key: string;
  label: string;
  hint: string;
  /** Portal screen where this is filled in. */
  to: string;
  weight: number;
  done: boolean;
}

/**
 * How complete a listing is, computed from the fields that are actually filled in.
 * Weights add up to 100 and favour what customers look for first: what it is, where, when, how to reach it.
 */
export function profileCompletion(l: BusinessListing): { percent: number; items: CompletionItem[]; remaining: CompletionItem[] } {
  const contactOk = businessContactSchema.pick({ phone: true, address: true }).safeParse({ phone: l.phone, address: l.address }).success;
  const items: CompletionItem[] = [
    { key: 'details', label: 'Name and description', hint: 'Say what you do in a couple of sentences.', to: '/business/profile#details', weight: 15, done: basicsSchema.safeParse({ name: l.name, description: l.description }).success },
    { key: 'category', label: 'Category', hint: 'So you appear in the right searches.', to: '/business/profile#details', weight: 10, done: Boolean(CATEGORY_BY_ID[l.categoryId]) },
    { key: 'location', label: 'Pin on the map', hint: 'Drag the pin to your entrance.', to: '/business/profile#location', weight: 10, done: hasLocation(l) },
    { key: 'hours', label: 'Opening hours', hint: 'Customers check these before they set out.', to: '/business/hours', weight: 15, done: hasOpenDay(l.hours) },
    { key: 'contact', label: 'Phone and address', hint: 'A number people can call and a full address.', to: '/business/profile#contact', weight: 15, done: contactOk },
    { key: 'photos', label: 'At least one photo', hint: 'Listings with photos get noticed.', to: '/business/photos', weight: 15, done: l.photos.length > 0 },
    { key: 'services', label: 'Services or menu items', hint: 'List what you offer, with prices if you like.', to: '/business/services', weight: 10, done: l.services.length > 0 },
    { key: 'amenities', label: 'Amenities', hint: 'Parking, delivery, payment options and more.', to: '/business/profile#amenities', weight: 5, done: l.amenities.length > 0 },
    { key: 'online', label: 'Email or website', hint: 'Another way for customers to reach you.', to: '/business/profile#contact', weight: 5, done: Boolean(l.email || l.website) },
  ];
  const percent = items.reduce((sum, i) => sum + (i.done ? i.weight : 0), 0);
  return { percent, items, remaining: items.filter((i) => !i.done) };
}
