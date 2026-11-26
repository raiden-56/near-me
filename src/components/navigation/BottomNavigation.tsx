import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { isActive, MOBILE_NAV } from './nav-items';

/** Phone navigation: five destinations, a sliding indicator, and room for the home-indicator safe area. */
export function BottomNavigation() {
  const { pathname } = useLocation();
  const unread = useLocalDb((s) => s.notifications.filter((n) => !n.read).length);

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="mx-auto flex h-16 max-w-md items-stretch px-2">
        {MOBILE_NAV.map((item) => {
          const active = isActive(item, pathname);
          const IconCmp = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <Link to={item.to} aria-current={active ? 'page' : undefined} className="relative flex h-full flex-col items-center justify-center gap-1">
                <span className="relative grid h-8 w-14 place-items-center">
                  {active && <motion.span layoutId="bottom-nav-indicator" className="absolute inset-0 rounded-full bg-brand-soft" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <IconCmp className={cn('relative size-[21px] transition-colors', active ? 'text-brand-ink' : 'text-muted-2')} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
                  {item.to === '/profile' && unread > 0 && <span className="absolute right-3 top-1 size-2 rounded-full bg-brand ring-2 ring-surface" aria-label={`${unread} unread notifications`} />}
                </span>
                <span className={cn('text-[11px] leading-none transition-colors', active ? 'font-semibold text-ink' : 'font-medium text-muted-2')}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
