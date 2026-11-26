import type { PlanId } from '@/types';

/**
 * The plan catalogue: the one place that says what each plan includes.
 * The portal service enforces these limits; the subscription screen renders them.
 *
 * Payments are not connected yet. Choosing a plan records it on the listing and changes the
 * limits, nothing is charged. Prices are indicative so the future paid plans have a shape.
 */

export interface PlanLimits {
  /** Photos shown on the listing. */
  photos: number;
  /** Offers that are live or scheduled at the same time. */
  activeOffers: number;
  /** Of those, how many may be promoted. */
  promotedOffers: number;
  /** How far back the insights screen can look, in days. */
  insightsDays: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Indicative monthly price in rupees. 0 = free. */
  monthlyPrice: number;
  limits: PlanLimits;
  highlights: string[];
}

export const PLAN_ORDER: readonly PlanId[] = ['free', 'plus', 'pro'];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Everything a neighbourhood business needs to be found.',
    monthlyPrice: 0,
    limits: { photos: 6, activeOffers: 1, promotedOffers: 0, insightsDays: 30 },
    highlights: ['Verified listing with hours, services and contact details', 'Reply to reviews', 'Live availability updates', 'One offer at a time'],
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    tagline: 'For businesses that run regular offers.',
    monthlyPrice: 499,
    limits: { photos: 12, activeOffers: 5, promotedOffers: 1, insightsDays: 90 },
    highlights: ['Everything in Free', 'Up to 5 offers at once', 'One promoted offer', '90 days of insights'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'For busy places and multi-service businesses.',
    monthlyPrice: 1499,
    limits: { photos: 24, activeOffers: 20, promotedOffers: 5, insightsDays: 180 },
    highlights: ['Everything in Plus', 'Up to 20 offers at once', 'Five promoted offers', '180 days of insights'],
  },
};

export const planFor = (id: PlanId | undefined | null): Plan => PLANS[id ?? 'free'] ?? PLANS.free;

/** Ranges offered on the insights screen. Ranges longer than the plan allows are locked. */
export const INSIGHT_RANGES = [7, 14, 30, 90, 180] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

/** The cheapest plan whose limits include `days` of history. */
export function planForInsightDays(days: number): Plan {
  return PLAN_ORDER.map((id) => PLANS[id]).find((p) => p.limits.insightsDays >= days) ?? PLANS.pro;
}

export const formatPlanPrice = (plan: Plan) => `₹${plan.monthlyPrice.toLocaleString('en-IN')}`;

/** Rows of the comparison table. `true` renders a tick, `false` a dash. */
export const PLAN_COMPARISON: { label: string; hint?: string; value: (plan: Plan) => string | boolean }[] = [
  { label: 'Photos on your listing', value: (p) => String(p.limits.photos) },
  { label: 'Offers live or scheduled at once', value: (p) => String(p.limits.activeOffers) },
  { label: 'Promoted offers', hint: 'Always labelled "Promoted" to customers', value: (p) => (p.limits.promotedOffers ? String(p.limits.promotedOffers) : false) },
  { label: 'Insights history', value: (p) => `${p.limits.insightsDays} days` },
  { label: 'Verified badge after verification', value: () => true },
  { label: 'Replies to reviews', value: () => true },
  { label: 'Live availability in NearMe Live', value: () => true },
];
