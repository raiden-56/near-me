import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { ScrollRestoration, useLocation, useNavigate, useOutlet } from 'react-router';
import { DemoNotice, InstallPWA, OfflineBanner, UpdatePrompt } from '@/components/common/AppBanners';
import { BottomNavigation } from '@/components/navigation/BottomNavigation';
import { DesktopSidebar } from '@/components/navigation/DesktopSidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { AuthGate } from '@/features/auth/components/AuthGate';
import { ReportComposer } from '@/features/community/components/ReportComposer';
import { LocationPicker } from '@/features/discovery/components/LocationPicker';
import { cn } from '@/lib/utils';

/** Routes that fill the viewport themselves (the map) and manage their own scrolling. */
const FULL_BLEED = /^\/map/;

export function AppLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const fullBleed = FULL_BLEED.test(location.pathname);

  // "/" focuses search from anywhere, like most desktop apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      navigate('/search');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="min-h-dvh bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-forest focus:px-3 focus:py-2 focus:text-sm focus:text-on-forest">
        Skip to content
      </a>
      <DesktopSidebar />
      {/* Full-bleed routes get a fixed viewport-height column so the map can fill what is left. */}
      <div className={cn('flex flex-col lg:pl-[248px]', fullBleed ? 'h-dvh overflow-hidden' : 'min-h-dvh')}>
        <div className="shrink-0 pt-safe">
          <OfflineBanner />
          <DemoNotice />
        </div>
        <TopBar />
        <main id="main" className={cn('flex-1', fullBleed ? 'min-h-0 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-10')}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              // Detail pages share a key per section so switching tabs animates but in-page updates do not.
              key={location.pathname}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.09 } }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className={cn(fullBleed && 'h-full')}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <BottomNavigation />

      <LocationPicker />
      <ReportComposer />
      <AuthGate />
      <InstallPWA />
      <UpdatePrompt />
      <ScrollRestoration />
    </div>
  );
}
