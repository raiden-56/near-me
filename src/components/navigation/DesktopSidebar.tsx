import { Bell, Building2, LogIn, Plus, Settings, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router';
import { Avatar } from '@/components/ui/controls';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { useAuth } from '@/store/auth';
import { useUi } from '@/store/ui';
import { Logo } from './Logo';
import { DESKTOP_NAV, isActive } from './nav-items';

/** Desktop navigation: a persistent rail rather than a stretched phone tab bar. */
export function DesktopSidebar() {
  const { pathname } = useLocation();
  const user = useAuth((s) => s.user);
  const unread = useLocalDb((s) => s.notifications.filter((n) => !n.read).length);
  const openReport = useUi((s) => s.openReport);

  const secondary = [
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: unread },
    { to: '/business', label: 'For business', icon: Building2 },
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface-2/70 px-4 pb-4 pt-6 lg:flex">
      <Link to="/" className="px-2" aria-label="NearMe home">
        <Logo />
      </Link>
      <p className="px-2 pt-1.5 text-[12.5px] text-muted-2">Everything around you.</p>

      <nav aria-label="Primary" className="mt-7 flex flex-col gap-0.5">
        {DESKTOP_NAV.map((item) => {
          const active = isActive(item, pathname);
          const IconCmp = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn('relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors', active ? 'font-semibold text-ink' : 'font-medium text-ink-2 hover:bg-bg-2 hover:text-ink')}
            >
              {active && <motion.span layoutId="sidebar-indicator" className="absolute inset-0 rounded-xl border border-line bg-surface shadow-card" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
              <IconCmp className={cn('relative size-[19px]', active && 'text-brand')} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => openReport()}
        className="mt-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-forest text-sm font-medium text-on-forest transition-opacity hover:opacity-90"
      >
        <Plus className="size-[18px]" /> Share an update
      </button>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
        {secondary.map((item) => {
          const active = pathname.startsWith(item.to);
          const IconCmp = item.icon;
          return (
            <Link key={item.to} to={item.to} className={cn('flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors', active ? 'bg-bg-2 font-semibold text-ink' : 'font-medium text-ink-2 hover:bg-bg-2 hover:text-ink')}>
              <IconCmp className="size-[18px]" strokeWidth={1.75} aria-hidden />
              {item.label}
              {'badge' in item && item.badge ? <span className="tabular ml-auto rounded-md bg-brand px-1.5 text-[11px] font-semibold leading-5 text-white">{item.badge}</span> : null}
            </Link>
          );
        })}

        {user ? (
          <Link to="/profile" className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 transition-shadow hover:shadow-card">
            <Avatar name={user.name} hue={user.avatarHue} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
              <span className="block truncate text-[12px] text-muted-2">View profile</span>
            </span>
          </Link>
        ) : (
          <Link to="/login" className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl border border-line-2 bg-surface text-sm font-medium text-ink transition-colors hover:bg-surface-2">
            <LogIn className="size-[18px]" /> Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
