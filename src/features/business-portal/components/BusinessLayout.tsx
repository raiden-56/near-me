import { ArrowLeft, Check, ChevronsUpDown, LogOut, MapPinned, Menu as MenuIcon, Plus, UserRound, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog } from 'radix-ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { OfflineBanner } from '@/components/common/AppBanners';
import { Icon } from '@/components/common/Icon';
import { ErrorState } from '@/components/common/states';
import { LogoMark } from '@/components/navigation/Logo';
import { Avatar, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Skeleton } from '@/components/ui/controls';
import { CATEGORY_BY_ID } from '@/data/categories';
import { cn } from '@/lib/utils';
import { authService } from '@/services/auth';
import type { PortalListing } from '@/services/businessPortal';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';
import { PortalContext, type PortalContextValue } from '../context';
import { useAuthReady, useMyListings, usePortalSync } from '../hooks';
import { usePortalUi } from '../store';
import { VERIFICATION_META } from './bits';
import { PORTAL_NAV, STARTER_NAV, type PortalNavGroup } from './nav';
import { PortalIntro, WelcomePanel } from './PortalEntry';

const STATUS_DOT: Record<PortalListing['verification'], string> = {
  draft: 'bg-muted',
  submitted: 'bg-butter',
  in_review: 'bg-warning',
  verified: 'bg-success',
  rejected: 'bg-danger',
};

function ListingSwitcher({ context }: { context: PortalContextValue }) {
  const navigate = useNavigate();
  const { listing, listings, selectListing } = context;
  const cat = CATEGORY_BY_ID[listing.categoryId];
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={`Current listing: ${listing.name || 'Untitled business'}. Switch listing`}
          className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-2.5 text-left transition-shadow hover:shadow-card"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-bg-2 text-ink-2">
            <Icon name={cat?.icon ?? 'Store'} className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{listing.name || 'Untitled business'}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-muted-2">
              <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[listing.verification])} aria-hidden />
              <span className="truncate">{VERIFICATION_META[listing.verification].label}</span>
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-[240px]">
        <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium text-muted-2">{listings.length > 1 ? 'Your listings' : 'Your listing'}</p>
        {listings.map((l) => (
          <MenuItem key={l.id} onSelect={() => selectListing(l.id)}>
            <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[l.verification])} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{l.name || 'Untitled business'}</span>
            {l.id === listing.id && <Check className="text-brand" aria-label="Selected" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => navigate('/business/claim')}>
          <MapPinned aria-hidden /> Claim another place
        </MenuItem>
        <MenuItem onSelect={() => navigate('/business/onboarding?new=1')}>
          <Plus aria-hidden /> Register another business
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function AccountMenu({ user }: { user: UserProfile }) {
  const navigate = useNavigate();
  const signOut = async () => {
    try {
      await authService.signOut();
      toast('Signed out');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not sign out.');
    }
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-bg-2" aria-label={`Account menu for ${user.name}`}>
          <Avatar name={user.name} hue={user.avatarHue} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
            <span className="block truncate text-[12px] text-muted-2">{user.email ?? user.phone ?? 'Business account'}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent align="start" side="top" className="w-[232px]">
        <MenuItem onSelect={() => navigate('/profile')}>
          <UserRound aria-hidden /> Your NearMe profile
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function NavGroups({ groups }: { groups: PortalNavGroup[] }) {
  return (
    <nav aria-label="Business portal" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.heading}>
          <p className="px-3 pb-1.5 text-[12px] font-medium text-muted-2">{group.heading}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ to, label, icon: IconCmp, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex h-10 items-center gap-3 rounded-xl border px-3 text-sm transition-colors',
                      isActive ? 'border-line bg-surface font-semibold text-ink shadow-card' : 'border-transparent font-medium text-ink-2 hover:bg-bg-2 hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <IconCmp className={cn('size-[18px] shrink-0', isActive && 'text-brand')} strokeWidth={isActive ? 2.1 : 1.75} aria-hidden />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Sidebar contents, shared by the desktop rail and the phone slide-over. */
function SidebarBody({ user, context }: { user: UserProfile | null; context: PortalContextValue | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Link to="/business" className="flex items-center gap-2.5 px-2" aria-label="Business portal home">
        <LogoMark size={30} />
        <span className="leading-tight">
          <span className="display block text-[19px] font-semibold tracking-tight text-ink">
            Near<span className="text-brand">Me</span>
          </span>
          <span className="block text-[12px] text-muted-2">Business portal</span>
        </span>
      </Link>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pb-4">
        {context && (
          <div className="mb-5">
            <ListingSwitcher context={context} />
          </div>
        )}
        {user ? (
          <NavGroups groups={context ? PORTAL_NAV : STARTER_NAV} />
        ) : (
          <p className="px-3 text-sm leading-relaxed text-muted-2">Manage your listing, hours, offers and reviews in one place. Sign in to begin.</p>
        )}
      </div>

      <div className="border-t border-line pt-3">
        <Link to="/" className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink">
          <ArrowLeft className="size-[18px]" strokeWidth={1.75} aria-hidden /> Back to NearMe
        </Link>
        {user && (
          <div className="mt-1">
            <AccountMenu user={user} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Navigation drawer for phones and tablets. Radix Dialog gives it focus trapping and Escape. */
function SlideOver({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const reduce = useReducedMotion();
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
                className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[320px] flex-col border-r border-line bg-surface-2 px-4 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-float outline-none"
                initial={reduce ? { opacity: 0 } : { x: '-100%' }}
                animate={reduce ? { opacity: 1 } : { x: 0 }}
                exit={reduce ? { opacity: 0 } : { x: '-100%' }}
                transition={{ duration: reduce ? 0.12 : 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <Dialog.Title className="sr-only">Business portal menu</Dialog.Title>
                <Dialog.Close className="absolute right-3 top-4 grid size-9 place-items-center rounded-full text-muted-2 transition-colors hover:bg-bg-2 hover:text-ink" aria-label="Close menu">
                  <X className="size-[18px]" />
                </Dialog.Close>
                <div className="flex min-h-0 flex-1 flex-col pt-4">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function PortalLoading() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pt-8 sm:px-6 lg:px-10 lg:pt-12" aria-busy="true" aria-label="Loading the business portal">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-64 rounded-2xl" />
    </div>
  );
}

/**
 * The business portal's own frame: a rail on desktop, a top bar with a slide-over menu on phones.
 * It also decides what a visitor may see: the introduction when signed out, the welcome screen
 * before the first listing, and the management screens after that.
 */
export function BusinessLayout() {
  usePortalSync();
  const ready = useAuthReady();
  const user = useAuth((s) => s.user);
  const listings = useMyListings();
  const activeId = usePortalUi((s) => s.activeListingId);
  const selectListing = usePortalUi((s) => s.setActiveListing);
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const section = pathname.replace(/^\/business\/?/, '').split('/')[0] ?? '';
  const rows = listings.data;
  const active = rows?.find((l) => l.id === activeId) ?? rows?.[0];
  const context = useMemo<PortalContextValue | null>(
    () => (user && active && rows ? { user, listing: active, listings: rows, selectListing } : null),
    [user, active, rows, selectListing],
  );

  let body: ReactNode;
  if (!ready || (user && listings.isPending)) body = <PortalLoading />;
  // Onboarding begins with its own sign-in step, so it is reachable without an account.
  else if (!user) body = section === 'onboarding' ? <Outlet /> : <PortalIntro />;
  else if (listings.isError)
    body = (
      <div className="grid min-h-[60dvh] place-items-center">
        <ErrorState error={listings.error} onRetry={() => void listings.refetch()} title="We could not load your listings" />
      </div>
    );
  else if (!context) body = section === 'onboarding' || section === 'claim' ? <Outlet /> : <WelcomePanel user={user} />;
  else body = <Outlet />;

  const sidebar = <SidebarBody user={ready ? user : null} context={context} />;

  return (
    <PortalContext.Provider value={context}>
      <div className="min-h-dvh bg-bg">
        <a href="#portal-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-forest focus:px-3 focus:py-2 focus:text-sm focus:text-on-forest">
          Skip to content
        </a>

        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-surface-2/70 px-4 pb-4 pt-6 lg:flex">{sidebar}</aside>

        <div className="flex min-h-dvh flex-col lg:pl-[264px]">
          <div className="pt-safe">
            <OfflineBanner />
          </div>

          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/92 px-3 backdrop-blur-sm lg:hidden">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-haspopup="dialog" className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-bg-2">
              <MenuIcon className="size-5" />
            </button>
            <Link to="/business" className="flex min-w-0 flex-1 items-center gap-2.5">
              <LogoMark size={26} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight text-ink">{context?.listing.name || 'NearMe Business'}</span>
                <span className="block text-[12px] leading-tight text-muted-2">Business portal</span>
              </span>
            </Link>
            <Link to="/" className="flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden /> NearMe
            </Link>
          </header>

          <main id="portal-main" className="flex-1">
            <motion.div key={pathname} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
              {body}
            </motion.div>
          </main>
        </div>

        <SlideOver open={menuOpen} onOpenChange={setMenuOpen}>
          {sidebar}
        </SlideOver>
        <ScrollRestoration />
      </div>
    </PortalContext.Provider>
  );
}
