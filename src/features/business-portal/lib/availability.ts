import type { AvailabilityStatus } from '@/services/businessPortal';

/** How each live status is named and coloured, wherever the portal shows one. */
export const AVAILABILITY_META: Record<AvailabilityStatus, { label: string; hint: string; dot: string; selected: string }> = {
  open: { label: 'Open', hint: 'Serving customers, no unusual wait.', dot: 'bg-success', selected: 'border-success/40 bg-success-soft' },
  busy: { label: 'Busy', hint: 'Open, but expect to wait.', dot: 'bg-warning', selected: 'border-warning/40 bg-warning-soft' },
  limited: { label: 'Limited', hint: 'Open with reduced service or stock.', dot: 'bg-butter', selected: 'border-butter bg-butter-soft' },
  closed: { label: 'Closed', hint: 'Not serving customers right now.', dot: 'bg-danger', selected: 'border-danger/40 bg-danger-soft' },
};

export const AVAILABILITY_ORDER: readonly AvailabilityStatus[] = ['open', 'busy', 'limited', 'closed'];
