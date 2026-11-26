import { Bell, Search } from 'lucide-react';
import { Link, useLocation as useRouteLocation } from 'react-router';
import { Avatar } from '@/components/ui/controls';
import { LocationSelector } from '@/features/discovery/components/LocationPicker';
import { useLocalDb } from '@/services/backend/localDb';
import { useAuth } from '@/store/auth';

/** Desktop header: location, global search entry point and account shortcuts. */
export function TopBar() {
  const user = useAuth((s) => s.user);
  const unread = useLocalDb((s) => s.notifications.filter((n) => !n.read).length);
  const { pathname } = useRouteLocation();
  const onSearch = pathname.startsWith('/search');

  return (
    <div className="sticky top-0 z-20 hidden border-b border-line bg-bg/88 backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-[68px] max-w-[1400px] items-center gap-6 px-10">
        <LocationSelector compact className="w-[250px] shrink-0" />
        {!onSearch && (
          <Link
            to="/search"
            className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line-2 bg-surface px-4 text-[15px] text-muted transition-[border-color,box-shadow] hover:border-muted hover:shadow-card"
          >
            <Search className="size-[18px] shrink-0" aria-hidden />
            <span className="truncate">What are you looking for?</span>
            <kbd className="ml-auto hidden rounded-md border border-line bg-bg-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-2 xl:block">/</kbd>
          </Link>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Link to="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink">
            <Bell className="size-5" strokeWidth={1.75} />
            {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-brand ring-2 ring-bg" />}
          </Link>
          <Link to={user ? '/profile' : '/login'} aria-label={user ? 'Your profile' : 'Sign in'} className="ml-1 rounded-full ring-offset-2 ring-offset-bg transition-shadow hover:ring-2 hover:ring-line-2">
            {user ? <Avatar name={user.name} hue={user.avatarHue} size={38} /> : <span className="grid h-10 place-items-center rounded-full border border-line-2 bg-surface px-4 text-sm font-medium text-ink">Sign in</span>}
          </Link>
        </div>
      </div>
    </div>
  );
}
