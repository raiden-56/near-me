import {
  BadgePercent, ChartLine, Clock, CreditCard, Images, LayoutDashboard, ListChecks, MapPinned, MessageSquare, Radio, ShieldCheck, Store, type LucideIcon,
} from 'lucide-react';

export interface PortalNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match the path exactly (the dashboard lives at the portal root). */
  end?: boolean;
}

export interface PortalNavGroup {
  heading: string;
  items: PortalNavItem[];
}

/** Navigation once the account has a listing. */
export const PORTAL_NAV: PortalNavGroup[] = [
  { heading: 'Overview', items: [{ to: '/business', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    heading: 'Your listing',
    items: [
      { to: '/business/profile', label: 'Profile', icon: Store },
      { to: '/business/services', label: 'Services', icon: ListChecks },
      { to: '/business/hours', label: 'Opening hours', icon: Clock },
      { to: '/business/photos', label: 'Photos', icon: Images },
    ],
  },
  {
    heading: 'Customers',
    items: [
      { to: '/business/availability', label: 'Live availability', icon: Radio },
      { to: '/business/offers', label: 'Offers', icon: BadgePercent },
      { to: '/business/reviews', label: 'Reviews', icon: MessageSquare },
    ],
  },
  {
    heading: 'Growth',
    items: [
      { to: '/business/analytics', label: 'Insights', icon: ChartLine },
      { to: '/business/verification', label: 'Verification', icon: ShieldCheck },
      { to: '/business/subscription', label: 'Plans', icon: CreditCard },
    ],
  },
];

/** Navigation before the first listing exists. */
export const STARTER_NAV: PortalNavGroup[] = [
  {
    heading: 'Get started',
    items: [
      { to: '/business', label: 'Welcome', icon: LayoutDashboard, end: true },
      { to: '/business/claim', label: 'Claim a place', icon: MapPinned },
      { to: '/business/onboarding', label: 'Register a business', icon: Store },
    ],
  },
];
