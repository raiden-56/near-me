import { BadgePercent, Bookmark, CalendarDays, Compass, Map, Radio, Siren, UserRound, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Paths that also count as "inside" this section. */
  match?: RegExp;
}

export const MOBILE_NAV: NavItem[] = [
  { to: '/', label: 'Discover', icon: Compass, match: /^\/($|search|categories|category|place|deals|events|emergency|notifications)/ },
  { to: '/map', label: 'Map', icon: Map, match: /^\/map/ },
  { to: '/live', label: 'Live', icon: Radio, match: /^\/live/ },
  { to: '/saved', label: 'Saved', icon: Bookmark, match: /^\/(saved|collections)/ },
  { to: '/profile', label: 'Profile', icon: UserRound, match: /^\/(profile|settings|contribute|login|register)/ },
];

export const DESKTOP_NAV: NavItem[] = [
  { to: '/', label: 'Discover', icon: Compass, match: /^\/($|search|categories|category|place)/ },
  { to: '/map', label: 'Explore map', icon: Map, match: /^\/map/ },
  { to: '/live', label: 'NearMe Live', icon: Radio, match: /^\/live/ },
  { to: '/deals', label: 'Deals', icon: BadgePercent, match: /^\/deals/ },
  { to: '/events', label: 'Events', icon: CalendarDays, match: /^\/events/ },
  { to: '/saved', label: 'Saved', icon: Bookmark, match: /^\/(saved|collections)/ },
  { to: '/emergency', label: 'Emergency', icon: Siren, match: /^\/emergency/ },
];

export const isActive = (item: NavItem, pathname: string) => (item.match ? item.match.test(pathname) : pathname === item.to);
