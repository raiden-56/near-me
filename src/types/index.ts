/** Shared domain types. Services return these; UI never talks to providers directly. */

export interface LatLon {
  lat: number;
  lon: number;
}

export type Tone = 'brand' | 'sage' | 'butter' | 'clay' | 'forest' | 'danger' | 'success' | 'sand';

export type GroupId = 'food' | 'health' | 'shopping' | 'automotive' | 'home' | 'fitness' | 'daily' | 'travel' | 'safety';

export interface CategoryGroup {
  id: GroupId;
  label: string;
  blurb: string;
  icon: string;
  tone: Tone;
}

/** One OSM tag rule: key, accepted values ('*' = any), optional extra tag conditions. */
export type TagRule = [key: string, values: readonly string[] | '*', extra?: Record<string, readonly string[]>];

export interface Category {
  id: string;
  groupId: GroupId;
  label: string;
  singular: string;
  icon: string;
  rules: readonly TagRule[];
  /** Search synonyms, lower-case. */
  keywords: readonly string[];
  /** Unnamed features are still useful (ATMs, toilets, parking). */
  nameless?: boolean;
  /** Shown in the curated home-screen selection. */
  featured?: boolean;
}

/* ── Places ─────────────────────────────────────────────────────────────── */

export type PlaceSource = 'tiles' | 'overpass' | 'nominatim' | 'listing';

export interface Place {
  /** OSM reference: n123 (node), w123 (way), r123 (relation). Listings created in NearMe use l_<id>. */
  id: string;
  name: string;
  hasName: boolean;
  categoryId: string;
  categoryIds: string[];
  groupId: GroupId;
  lat: number;
  lon: number;
  /** Raw OpenStreetMap tags. Empty-ish for 'basic' places that came from map tiles. */
  tags: Record<string, string>;
  /** basic = name, type and position only; full = complete tag set (hours, phone …). */
  detail: 'basic' | 'full';
  source: PlaceSource;
  fetchedAt: number;
  address?: string;
  locality?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  brand?: string;
  cuisine?: string[];
}

export type PlaceWithDistance = Place & { distance: number };

export interface PlacesResult {
  places: Place[];
  source: PlaceSource | 'cache';
  fetchedAt: number;
  /** The provider capped the result; a tighter radius or a category gives complete data. */
  truncated: boolean;
  /** Radius actually covered (tiles are capped for very wide searches). */
  coveredRadius: number;
}

export type OpenState = 'open' | 'closing_soon' | 'closed' | 'unknown';

export interface OpenStatus {
  state: OpenState;
  label: string;
  /** e.g. "Closes 10 pm", "Opens 9 am tomorrow" */
  detail?: string;
  alwaysOpen?: boolean;
}

export interface PlaceStats {
  rating: number | null;
  reviewCount: number;
  /** 1–4, null when unknown. */
  priceLevel: number | null;
  isSample: boolean;
}

export interface PlacePhoto {
  url: string;
  thumbUrl: string;
  /** exact = tagged on the place itself, nearby = taken close by, illustrative = category imagery. */
  kind: 'exact' | 'nearby' | 'illustrative';
  credit?: string;
  sourceUrl?: string;
  title?: string;
}

export interface GeocodeResult {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lon: number;
  kind: string;
  osmKey?: string;
  osmValue?: string;
  osmRef?: string;
  countryCode?: string;
  city?: string;
}

export interface AreaInfo {
  area: string;
  city: string;
  state?: string;
  country?: string;
  countryCode?: string;
  postcode?: string;
  road?: string;
}

export type TravelMode = 'car' | 'bike' | 'foot';

export interface RouteResult {
  mode: TravelMode;
  distance: number;
  duration: number;
  geometry: GeoJSON.LineString;
  steps: { instruction: string; distance: number; name: string }[];
}

/* ── Accounts ───────────────────────────────────────────────────────────── */

export type Role = 'user' | 'business' | 'admin';

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: Role;
  provider: 'local' | 'supabase';
  avatarHue: number;
  homeArea?: string;
  bio?: string;
  createdAt: number;
  status?: 'active' | 'suspended';
}

/* ── Reviews ────────────────────────────────────────────────────────────── */

export type ModerationState = 'visible' | 'pending' | 'hidden';

export interface Review {
  id: string;
  placeId: string;
  placeName: string;
  categoryId: string;
  userId: string;
  userName: string;
  userLevel?: string;
  rating: number;
  aspects: Record<string, number>;
  text: string;
  photos: string[];
  createdAt: number;
  updatedAt?: number;
  helpful: string[];
  flagged: string[];
  reply?: { text: string; at: number; by: string };
  moderation: ModerationState;
  isSample?: boolean;
}

/* ── Community intelligence ─────────────────────────────────────────────── */

export type ReportType =
  | 'queue'
  | 'wait_time'
  | 'availability'
  | 'parking'
  | 'traffic'
  | 'road'
  | 'closure'
  | 'event'
  | 'price'
  | 'outage'
  | 'service';

export type ReportSource = 'community' | 'business';

export interface CommunityReport {
  id: string;
  type: ReportType;
  title: string;
  note?: string;
  /** Queue length, minutes, free spots, price … depends on type. */
  value?: number;
  /** Coarse state used for colour: good = available / short queue, bad = blocked / closed. */
  level: 'good' | 'moderate' | 'bad' | 'info';
  placeId?: string;
  placeName?: string;
  categoryId?: string;
  /** Position shown to others. Place position for place reports, otherwise approximated. */
  lat: number;
  lon: number;
  areaLabel: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  source: ReportSource;
  reporterId: string;
  reporterName: string;
  reporterLevel: string;
  /** 0–100 at time of posting. */
  reporterReputation: number;
  confirmations: string[];
  disagreements: string[];
  helpful: string[];
  flagged: string[];
  moderation: ModerationState;
  isSample?: boolean;
}

export type Verification = 'business_confirmed' | 'community_verified' | 'unverified' | 'disputed';
export type Freshness = 'live' | 'recent' | 'expired';

export interface ReportView extends CommunityReport {
  verification: Verification;
  freshness: Freshness;
  /** 0–1 */
  confidence: number;
  distance?: number;
}

/* ── Deals & events ─────────────────────────────────────────────────────── */

export type DealKind = 'discount' | 'offer' | 'happy_hour' | 'seasonal' | 'event' | 'limited';

export interface Deal {
  id: string;
  placeId: string;
  placeName: string;
  categoryId: string;
  groupId: GroupId;
  lat: number;
  lon: number;
  title: string;
  description: string;
  kind: DealKind;
  badge: string;
  code?: string;
  terms?: string;
  startsAt: number;
  endsAt: number;
  promoted: boolean;
  source: 'business' | 'sample';
  ownerId?: string;
  moderation: ModerationState;
  isSample?: boolean;
}

export type EventKind = 'music' | 'market' | 'sports' | 'community' | 'food' | 'workshop' | 'culture' | 'wellness';

export interface EventItem {
  id: string;
  title: string;
  description: string;
  kind: EventKind;
  venueName: string;
  placeId?: string;
  lat: number;
  lon: number;
  startsAt: number;
  endsAt: number;
  price: string;
  organizer: string;
  interested: string[];
  source: 'community' | 'business' | 'sample';
  submittedBy?: string;
  moderation: ModerationState;
  isSample?: boolean;
}

/* ── Saved places ───────────────────────────────────────────────────────── */

export interface SavedPlace {
  placeId: string;
  place: Place;
  savedAt: number;
  note?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  icon: string;
  tone: Tone;
  placeIds: string[];
  createdAt: number;
  updatedAt: number;
  /** Starter collections can be renamed but are created for every user. */
  starter?: boolean;
}

/* ── Notifications ──────────────────────────────────────────────────────── */

export type NotificationKind = 'deal' | 'saved' | 'availability' | 'event' | 'community' | 'favorite' | 'system';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  href?: string;
  isSample?: boolean;
}

export interface NotificationPrefs {
  enabled: boolean;
  kinds: Record<Exclude<NotificationKind, 'system'>, boolean>;
  radius: number;
  frequency: 'instant' | 'hourly' | 'daily';
  quietHours: { enabled: boolean; from: string; to: string };
  push: boolean;
}

/* ── Contributions ──────────────────────────────────────────────────────── */

export type ContributionKind =
  | 'review'
  | 'report'
  | 'confirm'
  | 'photo'
  | 'place'
  | 'edit'
  | 'event'
  | 'closed'
  | 'category'
  | 'missing';

export interface Contribution {
  id: string;
  userId: string;
  kind: ContributionKind;
  title: string;
  points: number;
  status: 'pending' | 'verified' | 'rejected';
  refId?: string;
  placeId?: string;
  createdAt: number;
}

export interface PlaceSuggestion {
  id: string;
  kind: 'add' | 'edit' | 'closed' | 'missing' | 'category' | 'photo';
  placeId?: string;
  name: string;
  categoryId?: string;
  lat?: number;
  lon?: number;
  details: string;
  photos?: string[];
  userId: string;
  userName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

/* ── Business portal ────────────────────────────────────────────────────── */

export type DayKey = 'mo' | 'tu' | 'we' | 'th' | 'fr' | 'sa' | 'su';
export type WeekHours = Record<DayKey, { closed: boolean; open: string; close: string }>;

export type VerificationStatus = 'draft' | 'submitted' | 'in_review' | 'verified' | 'rejected';
export type PlanId = 'free' | 'plus' | 'pro';

export interface BusinessListing {
  id: string;
  ownerId: string;
  ownerName: string;
  /** OSM place this listing claims, if any. */
  placeId?: string;
  name: string;
  categoryId: string;
  description: string;
  lat: number;
  lon: number;
  address: string;
  phone: string;
  email?: string;
  website?: string;
  hours: WeekHours;
  services: { id: string; name: string; price?: string; note?: string }[];
  photos: string[];
  amenities: string[];
  verification: VerificationStatus;
  verificationNote?: string;
  verificationDoc?: string;
  plan: PlanId;
  availability: { status: 'open' | 'busy' | 'limited' | 'closed'; note: string; waitMinutes?: number; updatedAt: number } | null;
  createdAt: number;
  updatedAt: number;
}

export type AnalyticsKind = 'view' | 'impression' | 'direction' | 'call' | 'save' | 'share' | 'website';

export interface AnalyticsEvent {
  id: string;
  placeId: string;
  kind: AnalyticsKind;
  at: number;
}

/* ── Moderation & admin ─────────────────────────────────────────────────── */

export type ModerationTarget = 'review' | 'report' | 'deal' | 'event' | 'business' | 'user' | 'place';

export interface ModerationItem {
  id: string;
  targetType: ModerationTarget;
  targetId: string;
  targetLabel: string;
  reason: string;
  note?: string;
  reporterId: string;
  reporterName: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolution?: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface AdminConfig {
  /** Minutes a community report stays current, per type. */
  expiryMinutes: Record<ReportType, number>;
  minConfirmationsForVerified: number;
  maxReportsPerHour: number;
  disagreementsToHide: number;
  disabledCategoryIds: string[];
  featuredCategoryIds: string[];
  dealsRequireApproval: boolean;
  eventsRequireApproval: boolean;
}

export interface OutboxItem {
  id: string;
  kind: string;
  label: string;
  payload: unknown;
  createdAt: number;
}
