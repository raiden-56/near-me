import { sampleDeals, sampleEvents } from '@/data/sample/deals';
import { distanceMeters } from '@/lib/geo';
import { eventSchema } from '@/lib/schemas';
import { uid } from '@/lib/utils';
import type { Deal, EventItem, EventKind, LatLon, PlaceWithDistance, UserProfile } from '@/types';
import { localDb, toggle } from './backend/localDb';
import { contributionsService } from './contributions';

export type DealView = Deal & { distance: number; saved: boolean };
export type EventView = EventItem & { distance: number; going: boolean };

interface ListContext {
  places: PlaceWithDistance[];
  center: LatLon;
  sample: boolean;
}

export const dealsService = {
  async list(ctx: ListContext): Promise<DealView[]> {
    await localDb.ready();
    const s = localDb.get();
    const now = Date.now();
    // An offer is only shown while the listing behind it is still verified: if an admin later
    // rejects or suspends the business, its offers disappear with it.
    const verified = new Set(s.listings.filter((l) => l.verification === 'verified').flatMap((l) => [l.placeId, `l_${l.id}`]));
    const fromBusinesses = s.deals.filter(
      (d) => d.moderation === 'visible' && d.endsAt > now && d.startsAt <= now && verified.has(d.placeId) && distanceMeters(ctx.center, d) < 15_000,
    );
    const samples = ctx.sample ? sampleDeals(ctx.places, now).filter((d) => !s.hiddenIds.includes(d.id)) : [];
    return [...fromBusinesses, ...samples]
      .map((d) => ({ ...d, distance: distanceMeters(ctx.center, d), saved: s.savedDealIds.includes(d.id) }))
      .sort((a, b) => a.distance - b.distance);
  },

  async forPlace(placeId: string, ctx: ListContext): Promise<DealView[]> {
    return (await this.list(ctx)).filter((d) => d.placeId === placeId);
  },

  async toggleSave(dealId: string): Promise<boolean> {
    await localDb.ready();
    const next = toggle(localDb.get().savedDealIds, dealId);
    localDb.set({ savedDealIds: next });
    return next.includes(dealId);
  },
};

export const EVENT_KINDS: { id: EventKind; label: string; icon: string }[] = [
  { id: 'music', label: 'Music', icon: 'Music' },
  { id: 'market', label: 'Markets', icon: 'ShoppingBasket' },
  { id: 'food', label: 'Food', icon: 'UtensilsCrossed' },
  { id: 'culture', label: 'Culture', icon: 'Drama' },
  { id: 'sports', label: 'Sports', icon: 'Trophy' },
  { id: 'wellness', label: 'Wellness', icon: 'Flower2' },
  { id: 'workshop', label: 'Workshops', icon: 'GraduationCap' },
  { id: 'community', label: 'Community', icon: 'Users' },
];

export const eventsService = {
  async list(ctx: ListContext & { userId?: string }): Promise<EventView[]> {
    await localDb.ready();
    const s = localDb.get();
    const now = Date.now();
    const real = s.events.filter(
      (e) => e.endsAt > now && distanceMeters(ctx.center, e) < 20_000 && (e.moderation === 'visible' || (ctx.userId && e.submittedBy === ctx.userId)),
    );
    const samples = ctx.sample ? sampleEvents(ctx.places, now).filter((e) => !s.hiddenIds.includes(e.id)) : [];
    return [...real, ...samples]
      .map((e) => ({ ...e, distance: distanceMeters(ctx.center, e), going: s.eventInterest.includes(e.id) }))
      .sort((a, b) => a.startsAt - b.startsAt);
  },

  async toggleInterested(eventId: string): Promise<boolean> {
    await localDb.ready();
    const next = toggle(localDb.get().eventInterest, eventId);
    localDb.set({ eventInterest: next });
    return next.includes(eventId);
  },

  /** Community-submitted event. Held for review when the admin setting requires it. */
  async submit(user: UserProfile, input: unknown, where: LatLon & { placeId?: string }): Promise<EventItem> {
    const data = eventSchema.parse(input);
    await localDb.ready();
    const startsAt = new Date(`${data.date}T${data.startTime}`).getTime();
    const endsAt = new Date(`${data.date}T${data.endTime}`).getTime();
    if (!Number.isFinite(startsAt) || endsAt < Date.now()) throw new Error('Choose a date and time in the future.');
    const needsApproval = localDb.get().config.eventsRequireApproval;
    const event: EventItem = {
      id: uid('event'),
      title: data.title,
      description: data.description,
      kind: data.kind,
      venueName: data.venueName,
      placeId: where.placeId,
      lat: where.lat,
      lon: where.lon,
      startsAt,
      endsAt,
      price: data.price || 'Free',
      organizer: user.name,
      interested: [],
      source: 'community',
      submittedBy: user.id,
      moderation: needsApproval ? 'pending' : 'visible',
    };
    localDb.set((s) => ({ events: [event, ...s.events] }));
    await contributionsService.record(user, 'event', `Submitted event: ${data.title}`, { refId: event.id, status: needsApproval ? 'pending' : 'verified' });
    return event;
  },
};
