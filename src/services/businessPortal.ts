import { z } from 'zod';
import { CATEGORY_BY_ID } from '@/data/categories';
import { closedWeek, hasOpenDay, hoursFromOsm } from '@/features/business-portal/lib/hours';
import { PLAN_ORDER, planFor } from '@/features/business-portal/plans';
import { hasBackend } from '@/lib/env';
import { toOpeningHoursString } from '@/lib/openingHours';
import { businessContactSchema, businessDetailsSchema, dealSchema } from '@/lib/schemas';
import { uid } from '@/lib/utils';
import { currentUser } from '@/store/auth';
import type { AnalyticsKind, BusinessListing, CommunityReport, Deal, Place, PlanId, ReportView, Review, UserProfile, WeekHours } from '@/types';
import { analyticsService, type DailyPoint } from './analytics';
import { authService } from './auth';
import { localDb } from './backend/localDb';
import { communityService } from './community';
import { placesService } from './places';
import { reviewsService } from './reviews';

/**
 * Business owner portal.
 *
 * Every read and write the portal makes goes through this module. It is the only portal code that
 * touches the local backend, and it enforces the rules the UI merely reflects:
 *  - an owner only ever sees and changes listings where `ownerId` is their own account,
 *  - every input is validated with zod before it is stored,
 *  - plan limits (photos, offers, promoted offers, insights history) are checked here,
 *  - only verified listings can publish offers, reply to reviews or post "Business confirmed" updates.
 *
 * The signed-in account is read from the auth store rather than passed in, so a caller cannot
 * act for somebody else by handing over a different profile.
 */

export class PortalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalError';
  }
}

/* ── Types ──────────────────────────────────────────────────────────────── */

export type ProofType = 'gst' | 'shop_licence' | 'utility_bill' | 'owner_id';

export const PROOF_TYPES: { id: ProofType; label: string; description: string }[] = [
  { id: 'gst', label: 'GST certificate', description: 'Registration certificate showing the business name and address.' },
  { id: 'shop_licence', label: 'Shop licence', description: 'Shop and Establishment or trade licence from the local authority.' },
  { id: 'utility_bill', label: 'Utility bill', description: 'A recent electricity, water or broadband bill for the premises.' },
  { id: 'owner_id', label: 'Owner ID', description: 'Government photo ID of the owner, with the address visible.' },
];

export const ONBOARDING_STEP_COUNT = 10;

/**
 * A listing as the portal stores it. The two extra fields ride along on the listing record
 * (they are plain JSON, so they survive the admin area's status changes on the same row).
 */
export interface PortalListing extends BusinessListing {
  /** Furthest onboarding step reached, 1–10. Lets the wizard resume after a reload. */
  onboardingStep?: number;
  /** What the owner sent with the latest verification request. */
  verificationRequest?: { proofType: ProofType; note?: string; submittedAt: number };
}

export interface ListingIssue {
  key: 'details' | 'category' | 'location' | 'hours' | 'contact';
  label: string;
  /** Onboarding step that fixes it. */
  step: number;
  /** Portal screen that fixes it once onboarding is over. */
  to: string;
}

export interface Insights {
  days: number;
  totals: Record<AnalyticsKind, number>;
  daily: DailyPoint[];
  /** False when nothing has been tracked for this listing in the period. */
  hasData: boolean;
}

export type AvailabilityStatus = NonNullable<BusinessListing['availability']>['status'];

/* ── Validation ─────────────────────────────────────────────────────────── */

const CLOCK = /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/;

const daySchema = z
  .object({
    closed: z.boolean(),
    open: z.string().regex(CLOCK, 'Pick an opening time'),
    close: z.string().regex(CLOCK, 'Pick a closing time'),
  })
  .refine((d) => d.closed || d.open !== d.close, { path: ['close'], message: 'Closing time must be different from opening time' });

export const ownerSchema = z.object({
  ownerName: z.string().trim().min(2, 'Enter your name').max(60, 'Name can be at most 60 characters'),
});

export const basicsSchema = businessDetailsSchema.pick({ name: true, description: true });

export const categorySchema = z.object({
  categoryId: z
    .string()
    .min(1, 'Choose a category')
    .refine((id) => Boolean(CATEGORY_BY_ID[id]), 'Choose a category from the list'),
});

export const detailsSchema = basicsSchema.extend(categorySchema.shape);

export const locationSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    /** Optional address suggestion from the search result. Only used when the listing has no address yet. */
    address: z.string().trim().max(200).optional(),
  })
  .refine((v) => !(v.lat === 0 && v.lon === 0), { path: ['lat'], message: 'Place the pin where your business is' });

export const hoursSchema = z
  .object({ mo: daySchema, tu: daySchema, we: daySchema, th: daySchema, fr: daySchema, sa: daySchema, su: daySchema })
  .refine((w) => Object.values(w).some((d) => !d.closed), { message: 'Mark at least one day as open' });

export const serviceItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Name the service').max(60, 'Keep the name under 60 characters'),
  price: z.string().trim().max(24, 'Keep the price under 24 characters').optional(),
  note: z.string().trim().max(120, 'Keep the note under 120 characters').optional(),
});

export const servicesSchema = z.object({ services: z.array(serviceItemSchema).max(40, 'You can list up to 40 services') });

export const amenitiesSchema = z.array(z.string().trim().min(1).max(48)).max(40);

export const verificationSchema = z.object({
  proofType: z.enum(['gst', 'shop_licence', 'utility_bill', 'owner_id'], { error: 'Choose the document you can provide' }),
  note: z.string().trim().max(300, 'Keep the note under 300 characters').optional(),
  /** Compressed image of the document as a data URL. Optional. */
  doc: z.string().optional(),
});

export const offerSchema = dealSchema.and(z.object({ promoted: z.boolean() }));

export const availabilitySchema = z.object({
  status: z.enum(['open', 'busy', 'limited', 'closed']),
  waitMinutes: z.number().int('Use whole minutes').min(0).max(240, 'Use a wait of 4 hours or less').optional(),
  note: z.string().trim().max(140, 'Keep the note under 140 characters'),
});

export type OwnerInput = z.input<typeof ownerSchema>;
export type BasicsInput = z.input<typeof basicsSchema>;
export type CategoryInput = z.input<typeof categorySchema>;
export type DetailsInput = z.input<typeof detailsSchema>;
export type LocationInput = z.input<typeof locationSchema>;
export type ServiceInput = z.input<typeof serviceItemSchema>;
export type ContactInput = z.input<typeof businessContactSchema>;
export type VerificationInput = z.input<typeof verificationSchema>;
export type OfferInput = z.input<typeof offerSchema>;
export type AvailabilityInput = z.input<typeof availabilitySchema>;

/** One editable part of a listing. Each is validated on its own, so a section can be saved independently. */
export type ListingChange =
  | { section: 'owner'; data: OwnerInput }
  | { section: 'basics'; data: BasicsInput }
  | { section: 'category'; data: CategoryInput }
  | { section: 'details'; data: DetailsInput }
  | { section: 'location'; data: LocationInput }
  | { section: 'hours'; data: WeekHours }
  | { section: 'services'; data: ServiceInput[] }
  | { section: 'contact'; data: ContactInput }
  | { section: 'amenities'; data: string[] };

/* ── Helpers ────────────────────────────────────────────────────────────── */

const OSM_ID = /^[nwr]\d+$/;
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,/;
/** Roughly 1.1 MB of image once base64 is decoded. Compressed uploads are far below this. */
const MAX_DATA_URL_LENGTH = 1_500_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD, the format date inputs use. */
export const toDateInput = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const dayStart = (date: string) => new Date(`${date}T00:00:00`).getTime();
const dayEnd = (date: string) => new Date(`${date}T23:59:59.999`).getTime();

/** The place id customers see: the claimed OpenStreetMap place, or `l_<id>` for a NearMe-only listing. */
export const listingPlaceId = (l: Pick<BusinessListing, 'id' | 'placeId'>): string => l.placeId ?? `l_${l.id}`;

/** The listing as a `Place`, so reviews, live updates and analytics line up with the consumer app. */
export function listingPlace(l: BusinessListing): Place {
  const cat = CATEGORY_BY_ID[l.categoryId];
  return {
    id: listingPlaceId(l),
    name: l.name,
    hasName: true,
    categoryId: l.categoryId,
    categoryIds: [l.categoryId],
    groupId: cat?.groupId ?? 'daily',
    lat: l.lat,
    lon: l.lon,
    tags: { description: l.description },
    detail: 'full',
    source: 'listing',
    fetchedAt: l.updatedAt,
    address: l.address,
    phone: l.phone,
    website: l.website,
    openingHours: toOpeningHoursString(l.hours),
  };
}

/** A new listing has no position until the owner places the pin; 0,0 is the "not set" marker. */
export const hasLocation = (l: Pick<BusinessListing, 'lat' | 'lon'>): boolean => !(l.lat === 0 && l.lon === 0);

export type OfferState = 'active' | 'scheduled' | 'expired';
export const offerState = (deal: Pick<Deal, 'startsAt' | 'endsAt'>, now = Date.now()): OfferState =>
  deal.endsAt <= now ? 'expired' : deal.startsAt > now ? 'scheduled' : 'active';

export const dealToInput = (deal: Deal): OfferInput => ({
  title: deal.title,
  description: deal.description,
  kind: deal.kind,
  badge: deal.badge,
  code: deal.code ?? '',
  terms: deal.terms ?? '',
  startsOn: toDateInput(deal.startsAt),
  endsOn: toDateInput(deal.endsAt),
  promoted: deal.promoted,
});

/** What still has to be filled in before a listing can be sent for verification. */
export function listingIssues(l: BusinessListing): ListingIssue[] {
  const issues: ListingIssue[] = [];
  if (!basicsSchema.safeParse({ name: l.name, description: l.description }).success)
    issues.push({ key: 'details', label: 'Add a business name and a description of at least 20 characters', step: 2, to: '/business/profile#details' });
  if (!CATEGORY_BY_ID[l.categoryId]) issues.push({ key: 'category', label: 'Choose a category', step: 3, to: '/business/profile#details' });
  if (!hasLocation(l)) issues.push({ key: 'location', label: 'Place the pin on the map', step: 4, to: '/business/profile#location' });
  if (!hasOpenDay(l.hours)) issues.push({ key: 'hours', label: 'Set your opening hours', step: 5, to: '/business/hours' });
  if (!businessContactSchema.safeParse({ phone: l.phone, email: l.email ?? '', website: l.website ?? '', address: l.address }).success)
    issues.push({ key: 'contact', label: 'Add a phone number and a full address', step: 8, to: '/business/profile#contact' });
  return issues;
}

function requireUser(): UserProfile {
  const user = currentUser();
  if (!user) throw new PortalError('Sign in to manage a business.');
  if (user.status === 'suspended') throw new PortalError('This account has been suspended by a moderator.');
  return user;
}

/** The signed-in owner and one of their listings. Missing and not-yours give the same answer. */
function owned(listingId: string): { user: UserProfile; listing: PortalListing } {
  const user = requireUser();
  const listing = localDb.get().listings.find((l) => l.id === listingId) as PortalListing | undefined;
  if (!listing || listing.ownerId !== user.id) throw new PortalError('We could not find that listing on your account.');
  return { user, listing };
}

/** Apply a patch to a listing the caller has already been checked against. */
function write(listing: PortalListing, patch: Partial<PortalListing>, step?: number): PortalListing {
  const next: PortalListing = {
    ...listing,
    ...patch,
    onboardingStep: Math.min(ONBOARDING_STEP_COUNT, Math.max(listing.onboardingStep ?? 1, step ?? 1)),
    updatedAt: Date.now(),
  };
  localDb.set((s) => ({ listings: s.listings.map((l) => (l.id === listing.id && l.ownerId === listing.ownerId ? next : l)) }));
  return next;
}

function requireVerified(listing: PortalListing, action: string): void {
  if (listing.verification !== 'verified') throw new PortalError(`Only verified businesses can ${action}. Finish verification first.`);
}

const normaliseWebsite = (value: string | undefined): string | undefined => {
  const v = value?.trim();
  if (!v) return undefined;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

const isImageDataUrl = (value: string) => IMAGE_DATA_URL.test(value) && value.length <= MAX_DATA_URL_LENGTH;

/** Local mode: owning a listing is what makes an account a business account. */
async function promoteLocalRole(user: UserProfile): Promise<void> {
  if (hasBackend || user.role !== 'user') return;
  try {
    await authService.setLocalRole('business');
  } catch {
    /* The role only changes which workspace is suggested; the listing is already saved. */
  }
}

const ownDeals = (user: UserProfile, listing: PortalListing): Deal[] => {
  const placeId = listingPlaceId(listing);
  return localDb.get().deals.filter((d) => d.source === 'business' && d.ownerId === user.id && d.placeId === placeId);
};

const AVAILABILITY_REPORT: Record<AvailabilityStatus, { level: CommunityReport['level']; title: (wait?: number) => string }> = {
  open: { level: 'good', title: () => 'Open and available now' },
  busy: { level: 'moderate', title: (wait) => (wait ? `Busy right now, about ${wait} min wait` : 'Busy right now') },
  limited: { level: 'moderate', title: (wait) => (wait ? `Limited availability, about ${wait} min wait` : 'Limited availability') },
  closed: { level: 'bad', title: () => 'Closed right now' },
};

/* ── Service ────────────────────────────────────────────────────────────── */

export const businessPortalService = {
  /* Listings */

  async listMine(): Promise<PortalListing[]> {
    await localDb.ready();
    const user = requireUser();
    return (localDb.get().listings as PortalListing[]).filter((l) => l.ownerId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  },

  async get(listingId: string): Promise<PortalListing> {
    await localDb.ready();
    return owned(listingId).listing;
  },

  /** Start a NearMe-only listing. It stays a private draft until it is submitted and verified. */
  async createDraft(input: OwnerInput & BasicsInput): Promise<PortalListing> {
    await localDb.ready();
    const user = requireUser();
    const owner = ownerSchema.parse(input);
    const basics = basicsSchema.parse(input);
    const now = Date.now();
    const listing: PortalListing = {
      id: uid('listing'),
      ownerId: user.id,
      ownerName: owner.ownerName,
      name: basics.name,
      categoryId: '',
      description: basics.description,
      lat: 0,
      lon: 0,
      address: '',
      phone: '',
      hours: closedWeek(),
      services: [],
      photos: [],
      amenities: [],
      verification: 'draft',
      plan: 'free',
      availability: null,
      createdAt: now,
      updatedAt: now,
      onboardingStep: 3,
    };
    localDb.set((s) => ({ listings: [...s.listings, listing] }));
    await promoteLocalRole(user);
    return listing;
  },

  /** Which OpenStreetMap places already have a listing, and whether it is the caller's. */
  async claimedPlaces(): Promise<Record<string, 'mine' | 'other'>> {
    await localDb.ready();
    const user = requireUser();
    const out: Record<string, 'mine' | 'other'> = {};
    for (const l of localDb.get().listings) if (l.placeId) out[l.placeId] = l.ownerId === user.id ? 'mine' : 'other';
    return out;
  },

  /** Claim an existing OpenStreetMap place: a draft listing prefilled with what the map already knows. */
  async claimPlace(place: Place): Promise<PortalListing> {
    await localDb.ready();
    const user = requireUser();
    if (!OSM_ID.test(place.id)) throw new PortalError('Only places from the map can be claimed.');

    const taken = () => localDb.get().listings.find((l) => l.placeId === place.id);
    const refuse = (existing: BusinessListing) =>
      new PortalError(existing.ownerId === user.id ? 'You already manage this place.' : 'This place has already been claimed by another account.');
    const before = taken();
    if (before) throw refuse(before);

    // Map tiles only carry a name and a position. Fetch the full record when we can; claim with what we have when we cannot.
    let full = place;
    if (place.detail !== 'full') {
      try {
        full = await placesService.byId(place.id);
      } catch {
        full = place;
      }
    }
    // Someone else may have claimed it while the details were loading.
    const after = taken();
    if (after) throw refuse(after);

    const now = Date.now();
    const listing: PortalListing = {
      id: uid('listing'),
      ownerId: user.id,
      ownerName: user.name,
      placeId: full.id,
      name: full.hasName ? full.name.slice(0, 80) : '',
      categoryId: CATEGORY_BY_ID[full.categoryId] ? full.categoryId : '',
      description: '',
      lat: full.lat,
      lon: full.lon,
      address: (full.address ?? '').slice(0, 200),
      phone: (full.phone ?? '').split(/[;,]/)[0]!.trim(),
      website: normaliseWebsite(full.website),
      hours: hoursFromOsm(full.openingHours) ?? closedWeek(),
      services: [],
      photos: [],
      amenities: [],
      verification: 'draft',
      plan: 'free',
      availability: null,
      createdAt: now,
      updatedAt: now,
      onboardingStep: 2,
    };
    localDb.set((s) => ({ listings: [...s.listings, listing] }));
    await promoteLocalRole(user);
    return listing;
  },

  /** Save one section of a listing. `step` records onboarding progress when called from the wizard. */
  async save(listingId: string, change: ListingChange, step?: number): Promise<PortalListing> {
    await localDb.ready();
    const { listing } = owned(listingId);
    switch (change.section) {
      case 'owner':
        return write(listing, ownerSchema.parse(change.data), step);
      case 'basics':
        return write(listing, basicsSchema.parse(change.data), step);
      case 'category':
        return write(listing, categorySchema.parse(change.data), step);
      case 'details':
        return write(listing, detailsSchema.parse(change.data), step);
      case 'location': {
        const { lat, lon, address } = locationSchema.parse(change.data);
        return write(listing, { lat, lon, ...(address && !listing.address ? { address } : {}) }, step);
      }
      case 'hours':
        return write(listing, { hours: hoursSchema.parse(change.data) }, step);
      case 'services': {
        const { services } = servicesSchema.parse({ services: change.data });
        return write(listing, { services: services.map((s) => ({ id: s.id, name: s.name, price: s.price || undefined, note: s.note || undefined })) }, step);
      }
      case 'contact': {
        const d = businessContactSchema.parse(change.data);
        return write(listing, { phone: d.phone, email: d.email || undefined, website: normaliseWebsite(d.website), address: d.address }, step);
      }
      case 'amenities':
        return write(listing, { amenities: [...new Set(amenitiesSchema.parse(change.data))] }, step);
    }
  },

  /** Record that the owner moved past an optional onboarding step without changing anything. */
  async markStep(listingId: string, step: number): Promise<PortalListing> {
    await localDb.ready();
    return write(owned(listingId).listing, {}, step);
  },

  /* Photos */

  /** Add compressed images. Stops at the plan's photo limit and reports how many did not fit. */
  async addPhotos(listingId: string, dataUrls: string[]): Promise<{ listing: PortalListing; added: number; skipped: number }> {
    await localDb.ready();
    const { listing } = owned(listingId);
    const plan = planFor(listing.plan);
    const valid = dataUrls.filter(isImageDataUrl);
    if (!valid.length) throw new PortalError('Those files could not be read as images.');
    const room = plan.limits.photos - listing.photos.length;
    if (room <= 0) throw new PortalError(`The ${plan.name} plan includes ${plan.limits.photos} photos. Remove one, or change plan to add more.`);
    const accepted = valid.slice(0, room);
    const next = write(listing, { photos: [...listing.photos, ...accepted] });
    return { listing: next, added: accepted.length, skipped: dataUrls.length - accepted.length };
  },

  async removePhoto(listingId: string, index: number): Promise<PortalListing> {
    await localDb.ready();
    const { listing } = owned(listingId);
    if (!listing.photos[index]) throw new PortalError('That photo is no longer on the listing.');
    return write(listing, { photos: listing.photos.filter((_, i) => i !== index) });
  },

  /** Reorder photos. The first photo is the cover. `order` must be the same photos in a new order. */
  async reorderPhotos(listingId: string, order: number[]): Promise<PortalListing> {
    await localDb.ready();
    const { listing } = owned(listingId);
    const valid = order.length === listing.photos.length && new Set(order).size === order.length && order.every((i) => Number.isInteger(i) && i >= 0 && i < listing.photos.length);
    if (!valid) throw new PortalError('The photos changed while you were reordering. Please try again.');
    return write(listing, { photos: order.map((i) => listing.photos[i]!) });
  },

  /* Verification */

  /** draft or rejected → submitted. The admin area moves it on from there. */
  async submitVerification(listingId: string, input: VerificationInput): Promise<PortalListing> {
    await localDb.ready();
    const { listing } = owned(listingId);
    if (listing.verification !== 'draft' && listing.verification !== 'rejected')
      throw new PortalError(listing.verification === 'verified' ? 'This listing is already verified.' : 'This listing is already with our reviewers.');
    const issues = listingIssues(listing);
    if (issues.length) throw new PortalError(`Before you submit: ${issues[0]!.label.toLowerCase()}.`);
    const data = verificationSchema.parse(input);
    if (data.doc && !isImageDataUrl(data.doc)) throw new PortalError('The document image could not be read. Try a JPG, PNG or WebP photo of it.');
    return write(
      listing,
      {
        verification: 'submitted',
        // A new request starts clean: the previous reviewer note no longer applies.
        verificationNote: undefined,
        verificationDoc: data.doc ?? listing.verificationDoc,
        verificationRequest: { proofType: data.proofType, note: data.note || undefined, submittedAt: Date.now() },
      },
      ONBOARDING_STEP_COUNT,
    );
  },

  /* Plan */

  /** Record the chosen plan. Nothing is charged: payments are not connected yet. */
  async setPlan(listingId: string, plan: PlanId): Promise<PortalListing> {
    await localDb.ready();
    const { listing } = owned(listingId);
    if (!PLAN_ORDER.includes(plan)) throw new PortalError('That plan does not exist.');
    return write(listing, { plan });
  },

  /** Remove a listing and everything the portal created for it. Cannot be undone. */
  async deleteListing(listingId: string): Promise<void> {
    await localDb.ready();
    const { user, listing } = owned(listingId);
    const placeId = listingPlaceId(listing);
    localDb.set((s) => ({
      listings: s.listings.filter((l) => !(l.id === listing.id && l.ownerId === user.id)),
      deals: s.deals.filter((d) => !(d.source === 'business' && d.ownerId === user.id && d.placeId === placeId)),
      reports: s.reports.filter((r) => !(r.source === 'business' && r.reporterId === user.id && r.placeId === placeId)),
      // Events for a NearMe-only listing have no meaning without it. A claimed map place keeps its history.
      analytics: listing.placeId ? s.analytics : s.analytics.filter((e) => e.placeId !== placeId),
    }));
  },

  /* Offers */

  async listDeals(listingId: string): Promise<Deal[]> {
    await localDb.ready();
    const { user, listing } = owned(listingId);
    return ownDeals(user, listing).sort((a, b) => b.endsAt - a.endsAt);
  },

  /** Create an offer, or update one when `dealId` is given. */
  async saveDeal(listingId: string, input: OfferInput, dealId?: string): Promise<Deal> {
    await localDb.ready();
    const { user, listing } = owned(listingId);
    requireVerified(listing, 'publish offers');
    const data = offerSchema.parse(input);
    const now = Date.now();
    const startsAt = dayStart(data.startsOn);
    const endsAt = dayEnd(data.endsOn);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) throw new PortalError('Pick valid start and end dates.');
    if (endsAt <= now) throw new PortalError('Choose an end date that is today or later.');

    const mine = ownDeals(user, listing);
    const existing = dealId ? mine.find((d) => d.id === dealId) : undefined;
    if (dealId && !existing) throw new PortalError('We could not find that offer on this listing.');

    const plan = planFor(listing.plan);
    const others = mine.filter((d) => d.id !== dealId && d.endsAt > now);
    if (others.length >= plan.limits.activeOffers)
      throw new PortalError(
        `The ${plan.name} plan includes ${plan.limits.activeOffers} offer${plan.limits.activeOffers === 1 ? '' : 's'} at a time. End one, or change plan to publish more.`,
      );
    if (data.promoted) {
      if (plan.limits.promotedOffers === 0) throw new PortalError(`Promoted offers are not part of the ${plan.name} plan.`);
      if (others.filter((d) => d.promoted).length >= plan.limits.promotedOffers)
        throw new PortalError(`The ${plan.name} plan includes ${plan.limits.promotedOffers} promoted offer${plan.limits.promotedOffers === 1 ? '' : 's'} at a time.`);
    }

    const requested = localDb.get().config.dealsRequireApproval ? 'pending' : 'visible';
    const deal: Deal = {
      id: existing?.id ?? uid('deal'),
      placeId: listingPlaceId(listing),
      placeName: listing.name,
      categoryId: listing.categoryId,
      groupId: CATEGORY_BY_ID[listing.categoryId]?.groupId ?? 'daily',
      lat: listing.lat,
      lon: listing.lon,
      title: data.title,
      description: data.description,
      kind: data.kind,
      badge: data.badge,
      code: data.code || undefined,
      terms: data.terms || undefined,
      startsAt,
      endsAt,
      promoted: data.promoted,
      source: 'business',
      ownerId: user.id,
      // An offer a moderator has hidden stays hidden when it is edited.
      moderation: existing?.moderation === 'hidden' ? 'hidden' : requested,
    };
    localDb.set((s) => ({ deals: existing ? s.deals.map((d) => (d.id === deal.id ? deal : d)) : [deal, ...s.deals] }));
    return deal;
  },

  async deleteDeal(listingId: string, dealId: string): Promise<void> {
    await localDb.ready();
    const { user, listing } = owned(listingId);
    if (!ownDeals(user, listing).some((d) => d.id === dealId)) throw new PortalError('We could not find that offer on this listing.');
    localDb.set((s) => ({ deals: s.deals.filter((d) => d.id !== dealId), savedDealIds: s.savedDealIds.filter((id) => id !== dealId) }));
  },

  /* Reviews */

  async listReviews(listingId: string, sample: boolean): Promise<Review[]> {
    await localDb.ready();
    const { listing } = owned(listingId);
    return reviewsService.listForPlace(listingPlace(listing), sample);
  },

  /** Public reply from the business. Real reviews of the owner's own, verified listing only. */
  async replyToReview(listingId: string, reviewId: string, text: string): Promise<void> {
    await localDb.ready();
    const { user, listing } = owned(listingId);
    requireVerified(listing, 'reply to reviews');
    const review = localDb.get().reviews.find((r) => r.id === reviewId);
    if (!review) throw new PortalError('Sample reviews are examples, so they cannot be replied to.');
    if (review.placeId !== listingPlaceId(listing)) throw new PortalError('You can only reply to reviews of your own listing.');
    // The reply is signed with the business name, which is what customers recognise.
    await reviewsService.reply({ ...user, name: listing.name || user.name }, reviewId, text);
  },

  /** Send a review to the moderators. Returns false when the owner had already reported it. */
  async flagReview(listingId: string, review: Review, reason: string, note?: string): Promise<boolean> {
    await localDb.ready();
    const { user, listing } = owned(listingId);
    if (review.placeId !== listingPlaceId(listing)) throw new PortalError('You can only report reviews of your own listing.');
    return reviewsService.flag(user, review, reason, note);
  },

  /* Insights */

  async insights(listingId: string, days: number): Promise<Insights> {
    await localDb.ready();
    const { listing } = owned(listingId);
    const plan = planFor(listing.plan);
    if (!Number.isInteger(days) || days < 1) throw new PortalError('Choose a valid period.');
    if (days > plan.limits.insightsDays) throw new PortalError(`The ${plan.name} plan includes ${plan.limits.insightsDays} days of insights history.`);
    const ids = [listingPlaceId(listing)];
    const [totals, daily] = await Promise.all([analyticsService.totals(ids, days), analyticsService.daily(ids, days)]);
    return { days, totals, daily, hasData: Object.values(totals).some((n) => n > 0) };
  },

  /* Live availability */

  /**
   * Save the current status on the listing. For a verified listing it is also posted to NearMe Live
   * as a "Business confirmed" update, which expires on its own like every live update.
   */
  async setAvailability(listingId: string, input: AvailabilityInput): Promise<{ listing: PortalListing; report: CommunityReport | null }> {
    await localDb.ready();
    const { user, listing } = owned(listingId);
    const data = availabilitySchema.parse(input);
    const wait = data.status === 'busy' || data.status === 'limited' ? data.waitMinutes || undefined : undefined;
    const next = write(listing, { availability: { status: data.status, note: data.note, waitMinutes: wait, updatedAt: Date.now() } });
    if (next.verification !== 'verified') return { listing: next, report: null };

    const meta = AVAILABILITY_REPORT[data.status];
    const { report } = await communityService.submit(
      user,
      { type: 'availability', title: meta.title(wait), level: meta.level, value: wait, note: data.note || undefined },
      { place: listingPlace(next), location: { lat: next.lat, lon: next.lon }, areaLabel: next.name, asBusiness: true },
    );
    return { listing: next, report };
  },

  /** Withdraw the current status and the live update that carried it. */
  async clearAvailability(listingId: string): Promise<PortalListing> {
    await localDb.ready();
    const { user, listing } = owned(listingId);
    const placeId = listingPlaceId(listing);
    const now = Date.now();
    const live = localDb.get().reports.filter((r) => r.source === 'business' && r.reporterId === user.id && r.placeId === placeId && r.type === 'availability' && r.expiresAt > now);
    for (const r of live) await communityService.remove(user, r.id);
    return write(listing, { availability: null });
  },

  /** This business's own recent live updates, newest first. */
  async availabilityHistory(listingId: string): Promise<ReportView[]> {
    await localDb.ready();
    const { user, listing } = owned(listingId);
    const placeId = listingPlaceId(listing);
    return (await communityService.mine(user.id)).filter((r) => r.source === 'business' && r.placeId === placeId).slice(0, 20);
  },
};
