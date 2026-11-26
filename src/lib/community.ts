import type { AdminConfig, CommunityReport, ContributionKind, Freshness, ReportType, ReportView, Verification } from '@/types';
import { clamp } from './utils';

export interface ReportTypeMeta {
  type: ReportType;
  label: string;
  icon: string;
  prompt: string;
  /** Quick choices so a report takes two taps. */
  options: { label: string; title: string; level: CommunityReport['level']; value?: number }[];
  /** Optional number field (queue length, minutes …). */
  valueLabel?: string;
  valueUnit?: string;
  needsPlace: boolean;
}

export const REPORT_TYPES: ReportTypeMeta[] = [
  {
    type: 'queue', label: 'Queue', icon: 'Users', prompt: 'How long is the queue?', needsPlace: true, valueLabel: 'People or vehicles waiting', valueUnit: 'waiting',
    options: [
      { label: 'No queue', title: 'No queue right now', level: 'good', value: 0 },
      { label: 'Short', title: 'Short queue', level: 'good', value: 4 },
      { label: 'Moderate', title: 'Moderate queue', level: 'moderate', value: 8 },
      { label: 'Long', title: 'Long queue', level: 'bad', value: 15 },
    ],
  },
  {
    type: 'wait_time', label: 'Waiting time', icon: 'Hourglass', prompt: 'How long is the wait?', needsPlace: true, valueLabel: 'Minutes', valueUnit: 'min wait',
    options: [
      { label: 'No wait', title: 'No waiting right now', level: 'good', value: 0 },
      { label: '10 min', title: 'Waiting time about 10 min', level: 'good', value: 10 },
      { label: '20 min', title: 'Waiting time about 20 min', level: 'moderate', value: 20 },
      { label: '30+ min', title: 'Waiting time over 30 min', level: 'bad', value: 35 },
    ],
  },
  {
    type: 'availability', label: 'Availability', icon: 'CircleCheck', prompt: 'Is it available right now?', needsPlace: true,
    options: [
      { label: 'Available', title: 'Available now', level: 'good' },
      { label: 'Limited', title: 'Limited availability', level: 'moderate' },
      { label: 'Not available', title: 'Not available right now', level: 'bad' },
    ],
  },
  {
    type: 'service', label: 'Service status', icon: 'Wrench', prompt: 'What is the service status?', needsPlace: true,
    options: [
      { label: 'Working', title: 'Service is running normally', level: 'good' },
      { label: 'Slow', title: 'Service is slower than usual', level: 'moderate' },
      { label: 'Not working', title: 'Service is not working', level: 'bad' },
    ],
  },
  {
    type: 'parking', label: 'Parking', icon: 'SquareParking', prompt: 'How is parking?', needsPlace: false,
    options: [
      { label: 'Plenty', title: 'Parking available', level: 'good' },
      { label: 'Filling up', title: 'Parking is filling up', level: 'moderate' },
      { label: 'Full', title: 'Parking is full', level: 'bad' },
    ],
  },
  {
    type: 'traffic', label: 'Traffic', icon: 'TrafficCone', prompt: 'How is the traffic?', needsPlace: false,
    options: [
      { label: 'Moving', title: 'Traffic is moving freely', level: 'good' },
      { label: 'Slow', title: 'Slow-moving traffic', level: 'moderate' },
      { label: 'Jammed', title: 'Heavy traffic congestion', level: 'bad' },
    ],
  },
  {
    type: 'road', label: 'Road condition', icon: 'Construction', prompt: 'What is happening on the road?', needsPlace: false,
    options: [
      { label: 'Road work', title: 'Road work in progress', level: 'moderate' },
      { label: 'Waterlogging', title: 'Waterlogging on the road', level: 'bad' },
      { label: 'Blocked', title: 'Road blocked', level: 'bad' },
      { label: 'Cleared', title: 'Road is clear again', level: 'good' },
    ],
  },
  {
    type: 'closure', label: 'Temporary closure', icon: 'DoorClosed', prompt: 'What changed?', needsPlace: true,
    options: [
      { label: 'Closed today', title: 'Temporarily closed', level: 'bad' },
      { label: 'Closing early', title: 'Closing early today', level: 'moderate' },
      { label: 'Open again', title: 'Open again', level: 'good' },
    ],
  },
  {
    type: 'outage', label: 'Power or water', icon: 'ZapOff', prompt: 'What is affected?', needsPlace: false,
    options: [
      { label: 'Power cut', title: 'Power outage in the area', level: 'bad' },
      { label: 'Water outage', title: 'Water supply disruption', level: 'bad' },
      { label: 'Restored', title: 'Supply restored', level: 'good' },
    ],
  },
  {
    type: 'price', label: 'Price', icon: 'IndianRupee', prompt: 'What price did you see?', needsPlace: true, valueLabel: 'Price (₹)', valueUnit: '₹',
    options: [
      { label: 'Fair price', title: 'Prices are fair today', level: 'good' },
      { label: 'Price hike', title: 'Prices are higher than usual', level: 'moderate' },
    ],
  },
  {
    type: 'event', label: 'Event', icon: 'PartyPopper', prompt: 'What is happening?', needsPlace: false,
    options: [
      { label: 'Happening now', title: 'Local event happening now', level: 'info' },
      { label: 'Setting up', title: 'Event setting up nearby', level: 'info' },
      { label: 'Crowded', title: 'Large crowd gathering', level: 'moderate' },
    ],
  },
];

export const REPORT_TYPE_BY_ID = Object.fromEntries(REPORT_TYPES.map((t) => [t.type, t])) as Record<ReportType, ReportTypeMeta>;

/** Which report types make sense for a given category of place. */
export function reportTypesForCategory(categoryId: string | undefined): ReportType[] {
  switch (categoryId) {
    case 'petrol-pumps':
      return ['queue', 'price', 'service', 'closure'];
    case 'ev-charging':
      return ['availability', 'queue', 'service'];
    case 'parking':
      return ['parking', 'price'];
    case 'restaurants':
    case 'cafes':
    case 'fast-food':
    case 'street-food':
    case 'bakeries':
    case 'desserts':
    case 'bars':
    case 'salons':
    case 'clinics':
    case 'diagnostic-labs':
      return ['wait_time', 'closure', 'price'];
    case 'atms':
    case 'public-toilets':
      return ['service', 'queue', 'closure'];
    case 'bike-repair':
    case 'car-repair':
    case 'mechanics':
    case 'car-wash':
    case 'electricians':
    case 'plumbers':
    case 'carpenters':
    case 'painters':
    case 'cleaning':
    case 'appliance-repair':
      return ['availability', 'wait_time', 'closure'];
    default:
      return ['availability', 'queue', 'wait_time', 'closure'];
  }
}

export function deriveReport(report: CommunityReport, config: AdminConfig, now = Date.now()): ReportView {
  const ttl = Math.max(60_000, report.expiresAt - report.updatedAt);
  const age = now - report.updatedAt;
  const freshness: Freshness = now >= report.expiresAt ? 'expired' : age < ttl * 0.5 ? 'live' : 'recent';

  const confirms = report.confirmations.length;
  const disputes = report.disagreements.length;
  const verification: Verification =
    disputes >= Math.max(2, confirms + 1)
      ? 'disputed'
      : report.source === 'business'
        ? 'business_confirmed'
        : confirms >= config.minConfirmationsForVerified
          ? 'community_verified'
          : 'unverified';

  // Confidence: who said it, how many independent people agree, how many disagree, how old it is.
  let confidence = report.source === 'business' ? 0.82 : 0.3 + (report.reporterReputation / 100) * 0.25;
  confidence += Math.min(0.36, confirms * 0.09);
  confidence -= Math.min(0.6, disputes * 0.16);
  confidence *= 1 - 0.35 * clamp(age / ttl, 0, 1);
  if (freshness === 'expired') confidence *= 0.3;

  return { ...report, verification, freshness, confidence: clamp(confidence, 0.04, 0.97) };
}

export const confidenceLabel = (c: number) => (c >= 0.72 ? 'High confidence' : c >= 0.45 ? 'Medium confidence' : 'Low confidence');

/* ── Contribution score ─────────────────────────────────────────────────── */

export const LEVELS = [
  { name: 'Explorer', min: 0, blurb: 'Getting to know the neighbourhood.' },
  { name: 'Local Scout', min: 50, blurb: 'Regularly shares what is happening nearby.' },
  { name: 'Neighborhood Expert', min: 200, blurb: 'A trusted voice. Reports carry extra weight.' },
  { name: 'Community Hero', min: 600, blurb: 'Keeps the whole neighbourhood informed.' },
] as const;

export function levelFor(points: number) {
  let index = 0;
  LEVELS.forEach((l, i) => {
    if (points >= l.min) index = i;
  });
  const current = LEVELS[index]!;
  const next = LEVELS[index + 1];
  return {
    index,
    name: current.name,
    blurb: current.blurb,
    next: next?.name ?? null,
    toNext: next ? next.min - points : 0,
    progress: next ? clamp((points - current.min) / (next.min - current.min), 0, 1) : 1,
  };
}

/** Points are only counted once a contribution is verified; pending and rejected ones earn nothing. */
export const POINTS: Record<ContributionKind, number> = {
  review: 10,
  report: 5,
  confirm: 2,
  photo: 5,
  place: 15,
  edit: 8,
  event: 8,
  closed: 6,
  category: 4,
  missing: 6,
};

export const CONTRIBUTION_LABEL: Record<ContributionKind, string> = {
  review: 'Review',
  report: 'Live update',
  confirm: 'Confirmation',
  photo: 'Photo',
  place: 'New place',
  edit: 'Suggested edit',
  event: 'Event',
  closed: 'Closure report',
  category: 'Category suggestion',
  missing: 'Missing place',
};
