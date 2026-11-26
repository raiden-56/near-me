import {
  ArrowLeft, BadgeCheck, BadgePercent, CalendarDays, ChartColumn, HardDrive, LayoutDashboard, Lock, LogIn, Menu as MenuIcon, MessageSquareText, Radio, Server,
  Settings, Shapes, ShieldAlert, ShieldCheck, Store, Users, X, type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog } from 'radix-ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { toast } from 'sonner';
import { Logo, LogoMark } from '@/components/navigation/Logo';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/controls';
import { hasBackend } from '@/lib/env';
import { describeError } from '@/lib/http';
import { cn } from '@/lib/utils';
import type { AttentionCounts } from '@/services/admin';
import { authService } from '@/services/auth';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';
import { useAttention } from './hooks';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only the exact path is "current" (the dashboard at /admin). */
  end?: boolean;
  /** How many things are waiting in this section. */
  count?: (a: AttentionCounts) => number;
}

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/analytics', label: 'Analytics', icon: ChartColumn },
    ],
  },
  {
    label: 'Directory',
    items: [
      { to: '/admin/businesses', label: 'Businesses', icon: Store },
      { to: '/admin/verification', label: 'Verification', icon: BadgeCheck, count: (a) => a.pendingVerification },
      { to: '/admin/users', label: 'Users', icon: Users },
      { to: '/admin/categories', label: 'Categories', icon: Shapes, count: (a) => a.categorySuggestions },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: '/admin/reports', label: 'Live reports', icon: Radio, count: (a) => a.pendingReports },
      { to: '/admin/moderation', label: 'Moderation', icon: ShieldAlert, count: (a) => a.openModeration + a.pendingSuggestions },
      { to: '/admin/reviews', label: 'Reviews', icon: MessageSquareText, count: (a) => a.flaggedReviews },
      { to: '/admin/deals', label: 'Deals', icon: BadgePercent, count: (a) => a.pendingDeals },
      { to: '/admin/events', label: 'Events', icon: CalendarDays, count: (a) => a.pendingEvents },
    ],
  },
  { label: 'Platform', items: [{ to: '/admin/settings', label: 'Settings', icon: Settings }] },
];

const isCurrent = (item: NavItem, pathname: string) => {
  const path = pathname.replace(/\/+$/, '') || '/';
  return item.end ? path === item.to : path === item.to || path.startsWith(`${item.to}/`);
};

function NavList({ pathname, counts, indicatorId, onNavigate }: { pathname: string; counts?: AttentionCounts; indicatorId?: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {NAV.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[12.5px] font-medium text-muted">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isCurrent(item, pathname);
              const waiting = counts && item.count ? item.count(counts) : 0;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors',
                      active ? 'font-semibold text-ink' : 'font-medium text-ink-2 hover:bg-bg-2 hover:text-ink',
                      active && !indicatorId && 'bg-bg-2',
                    )}
                  >
                    {active && indicatorId && (
                      <motion.span layoutId={indicatorId} className="absolute inset-0 rounded-xl border border-line bg-surface shadow-card" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
                    )}
                    <item.icon className={cn('relative size-[18px] shrink-0', active && 'text-brand')} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
                    <span className="relative truncate">{item.label}</span>
                    {waiting > 0 && (
                      <span className="tabular relative ml-auto rounded-md bg-brand px-1.5 text-[11px] font-semibold leading-5 text-white" aria-label={`${waiting} waiting`}>
                        {waiting > 99 ? '99+' : waiting}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ModeNote() {
  const IconCmp = hasBackend ? Server : HardDrive;
  return (
    <p className="flex items-start gap-2 px-3 text-[12px] leading-snug text-muted-2">
      <IconCmp className="mt-px size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      {hasBackend ? 'Backend connected. Roles are enforced by the database.' : 'Local mode. Changes apply to data stored on this device.'}
    </p>
  );
}

function SidebarFooter({ user, onNavigate }: { user: UserProfile; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <ModeNote />
      <Link to="/" onClick={onNavigate} className="flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink">
        <ArrowLeft className="size-[18px]" strokeWidth={1.75} aria-hidden />
        Back to NearMe
      </Link>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
        <Avatar name={user.name} hue={user.avatarHue} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
          <span className="block truncate text-[12px] text-muted-2">Administrator</span>
        </span>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center justify-between gap-2 px-2">
      <Link to="/admin" aria-label="NearMe admin home">
        <Logo />
      </Link>
      <span className="rounded-md bg-forest px-1.5 py-0.5 text-[11.5px] font-medium text-on-forest">Admin</span>
    </div>
  );
}

/* ── Access gate ────────────────────────────────────────────────────────── */

function Gate({ icon: IconCmp, title, children, actions }: { icon: LucideIcon; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <main className="w-full max-w-[460px]">
        <Link to="/" aria-label="NearMe home" className="mb-6 inline-flex">
          <Logo />
        </Link>
        <div className="card p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-bg-2 text-ink-2">
            <IconCmp className="size-6" strokeWidth={1.5} aria-hidden />
          </span>
          <h1 className="display mt-5 text-[28px] text-ink">{title}</h1>
          <div className="mt-2.5 space-y-2.5 text-[15px] leading-relaxed text-ink-2">{children}</div>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">{actions}</div>
        </div>
      </main>
    </div>
  );
}

const backHome = (
  <Button variant="secondary" asChild>
    <Link to="/">
      <ArrowLeft /> Back to NearMe
    </Link>
  </Button>
);

function LocalModeGate({ user }: { user: UserProfile }) {
  const [busy, setBusy] = useState(false);
  const becomeAdmin = async () => {
    setBusy(true);
    try {
      await authService.setLocalRole('admin');
      toast.success('You are now an administrator on this device');
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Gate
      icon={HardDrive}
      title="Open the admin area in local mode"
      actions={
        <>
          <Button onClick={becomeAdmin} loading={busy}>
            <ShieldCheck /> Continue as administrator
          </Button>
          {backHome}
        </>
      }
    >
      <p>Local mode: no server is connected, so admin tools act on data stored on this device.</p>
      <p className="text-sm text-muted-2">
        Continuing gives {user.name}&rsquo;s account the administrator role on this device only. Once a backend is connected, roles are assigned in the database and enforced by Row Level
        Security, and this shortcut is switched off.
      </p>
    </Gate>
  );
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

function MobileMenu({ open, onOpenChange, pathname, counts, user }: { open: boolean; onOpenChange: (open: boolean) => void; pathname: string; counts?: AttentionCounts; user: UserProfile }) {
  const reduce = useReducedMotion();
  const close = () => onOpenChange(false);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-[#1b201c]/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[320px] flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-4 pb-safe pt-5 shadow-float outline-none"
                initial={reduce ? { opacity: 0 } : { x: '-100%' }}
                animate={reduce ? { opacity: 1 } : { x: 0 }}
                exit={reduce ? { opacity: 0 } : { x: '-100%' }}
                transition={{ duration: reduce ? 0.12 : 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center justify-between gap-2">
                  <Dialog.Title className="sr-only">Admin menu</Dialog.Title>
                  <div className="min-w-0 flex-1">
                    <Brand />
                  </div>
                  <Dialog.Close aria-label="Close menu" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-2 transition-colors hover:bg-bg-2 hover:text-ink">
                    <X className="size-[18px]" />
                  </Dialog.Close>
                </div>
                <div className="flex-1">
                  <NavList pathname={pathname} counts={counts} onNavigate={close} />
                </div>
                <SidebarFooter user={user} onNavigate={close} />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Shell({ user }: { user: UserProfile }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const counts = useAttention().data;
  const current = NAV.flatMap((g) => g.items).find((item) => isCurrent(item, pathname));

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="min-h-dvh bg-bg">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-forest focus:px-3 focus:py-2 focus:text-sm focus:text-on-forest">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col gap-6 border-r border-line bg-surface-2/70 px-4 pb-4 pt-6 lg:flex">
        <Brand />
        <div className="no-scrollbar -mx-1 flex-1 overflow-y-auto px-1">
          <NavList pathname={pathname} counts={counts} indicatorId="admin-nav-indicator" />
        </div>
        <SidebarFooter user={user} />
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-[264px]">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/88 pt-safe backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center gap-2 px-2.5">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open admin menu" aria-haspopup="dialog" className="grid size-10 place-items-center rounded-xl text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink">
              <MenuIcon className="size-5" strokeWidth={1.75} />
            </button>
            <LogoMark size={26} />
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
              {current?.label ?? 'Admin'} <span className="font-normal text-muted-2">· Admin</span>
            </p>
            <Link to="/" className="flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink">
              <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
              NearMe
            </Link>
          </div>
        </header>

        <main id="admin-main" className="flex-1">
          <motion.div key={pathname} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
            <Outlet />
          </motion.div>
        </main>
      </div>

      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} pathname={pathname} counts={counts} user={user} />
      <ScrollRestoration />
    </div>
  );
}

/** The admin area's own frame: access check first, then sidebar (or top bar and slide-over on phones) around the page. */
export function AdminLayout() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  // Session storage can be unavailable (private mode): do not wait on it forever.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(id);
  }, []);

  if (!ready && !waited && !user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg" aria-busy="true">
        <div className="flex flex-col items-center gap-4">
          <LogoMark size={52} className="animate-pulse" />
          <p className="text-sm text-muted-2">Checking your access…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Gate
        icon={LogIn}
        title="Sign in to open the admin area"
        actions={
          <>
            <Button asChild>
              <Link to="/login">
                <LogIn /> Sign in
              </Link>
            </Button>
            {backHome}
          </>
        }
      >
        <p>The admin area is for NearMe administrators. Sign in with an administrator account to continue.</p>
      </Gate>
    );
  }

  if (user.role !== 'admin') {
    if (!hasBackend) return <LocalModeGate user={user} />;
    return (
      <Gate icon={Lock} title="You need an administrator role" actions={backHome}>
        <p>
          {user.name} is signed in as a {user.role === 'business' ? 'business' : 'member'} account. Roles are enforced by the database&rsquo;s Row Level Security, so only an existing
          administrator can grant access.
        </p>
      </Gate>
    );
  }

  return <Shell user={user} />;
}
