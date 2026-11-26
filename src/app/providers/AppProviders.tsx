import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { OfflineError } from '@/lib/http';
import { authService } from '@/services/auth';
import { communityService } from '@/services/community';
import '@/services/offlineActions';
import { outbox } from '@/services/outbox';
import { savedService } from '@/services/saved';
import { resumeLocation, useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      // Never hammer a provider that is down, and never retry while offline.
      retry: (count, error) => !(error instanceof OfflineError) && count < 1,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'offlineFirst' },
  },
});

/** One-time wiring between the browser and the app's stores. Renders nothing. */
function Bootstrap() {
  const hydrated = useLocation((s) => s.hydrated);

  useEffect(() => {
    const ui = useUi.getState();
    const goOnline = async () => {
      ui.setOnline(true);
      const { sent } = await outbox.flush();
      toast.success('Back online', { description: sent ? `${sent} saved action${sent > 1 ? 's' : ''} sent.` : 'Live data is refreshing.' });
      void queryClient.invalidateQueries();
    };
    const goOffline = () => ui.setOnline(false);
    const onInstallable = (e: BeforeInstallPromptEvent) => {
      // Hold the browser's prompt so NearMe can offer install at a sensible moment.
      e.preventDefault();
      ui.setInstallEvent(e);
    };
    const onInstalled = () => {
      ui.setInstallEvent(null);
      toast.success('NearMe is installed', { description: 'Find it on your home screen.' });
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('beforeinstallprompt', onInstallable);
    window.addEventListener('appinstalled', onInstalled);

    void authService.init();
    void communityService.prune();
    void savedService.ensureStarters();
    void outbox.flush();

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('beforeinstallprompt', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (hydrated) void resumeLocation();
  }, [hydrated]);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const theme = useSettings((s) => s.theme);
  return (
    <QueryClientProvider client={queryClient}>
      {/* "user" follows the OS setting; the in-app switch forces reduced motion on. */}
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
        <Bootstrap />
        {children}
        <Toaster
          position="top-center"
          theme={theme}
          offset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
          mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
          toastOptions={{
            classNames: {
              toast: '!rounded-2xl !border-line !bg-surface !text-ink !shadow-float !font-sans',
              description: '!text-muted-2',
              actionButton: '!bg-forest !text-on-forest !rounded-lg',
            },
          }}
        />
      </MotionConfig>
    </QueryClientProvider>
  );
}
