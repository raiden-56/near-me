import { CloudOff, Download, FlaskConical, RefreshCw, Share, SquarePlus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { LogoMark } from '@/components/navigation/Logo';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { hasBackend } from '@/lib/env';
import { DAY } from '@/lib/time';
import { isIOS, isStandalone } from '@/lib/utils';
import { outbox } from '@/services/outbox';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';

/** Persistent strip while offline, so cached content is never mistaken for live data. */
export function OfflineBanner() {
  const online = useUi((s) => s.online);
  const [queued, setQueued] = useState(0);
  useEffect(() => outbox.subscribe(setQueued), []);

  return (
    <AnimatePresence initial={false}>
      {!online && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-forest text-on-forest" role="status">
          <div className="mx-auto flex max-w-[1180px] items-center gap-2.5 px-4 py-2 text-[13px] sm:px-6 lg:px-10">
            <CloudOff className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              You are offline. Showing places saved on this device; live updates are paused.
              {queued > 0 && <span className="opacity-75"> {queued} action{queued > 1 ? 's' : ''} will be sent when you reconnect.</span>}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** One-line explanation that community content is sample data until a backend is connected. */
export function DemoNotice() {
  const sample = useSettings((s) => s.sampleData);
  const dismissed = useSettings((s) => s.demoBannerDismissed);
  const set = useSettings((s) => s.set);
  if (!sample || dismissed || hasBackend) return null;
  return (
    <div className="border-b border-dashed border-line-2 bg-butter-soft/70">
      <div className="mx-auto flex max-w-[1180px] items-center gap-2.5 px-4 py-2 text-[12.5px] text-ink-2 sm:px-6 lg:px-10">
        <FlaskConical className="size-4 shrink-0 text-butter-ink" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-semibold text-ink">Places and maps are real.</span> Ratings, reviews, live updates, deals and events marked “Sample” are example data.{' '}
          <Link to="/settings" className="font-medium underline underline-offset-2">
            Manage
          </Link>
        </p>
        <button type="button" onClick={() => set({ demoBannerDismissed: true })} aria-label="Dismiss" className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-black/5">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Service-worker lifecycle: tells the user when the app is ready offline and when an update is waiting. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version every hour while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60_000);
    },
    onOfflineReady() {
      toast.success('Ready to work offline', { description: 'NearMe will open even without a connection.' });
    },
  });

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="fixed inset-x-3 bottom-[84px] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-forest p-3 pl-4 text-on-forest shadow-float lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0"
          role="alert"
        >
          <RefreshCw className="size-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">A new version is ready.</span> <span className="opacity-80">Update to get the latest improvements.</span>
          </p>
          <button type="button" onClick={() => setNeedRefresh(false)} className="rounded-lg px-2.5 py-2 text-[13px] font-medium opacity-75 hover:opacity-100">
            Later
          </button>
          <button type="button" onClick={() => void updateServiceWorker(true)} className="rounded-lg bg-brand px-3 py-2 text-[13px] font-semibold text-white hover:bg-brand-strong">
            Update
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** True when the app can offer installation (native prompt available, or iOS where instructions are needed). */
export function useInstallState() {
  const installEvent = useUi((s) => s.installEvent);
  const setInstallEvent = useUi((s) => s.setInstallEvent);
  const installed = isStandalone();
  const ios = isIOS();
  const canInstall = !installed && (Boolean(installEvent) || ios);

  const install = async (): Promise<'accepted' | 'dismissed' | 'ios'> => {
    if (installEvent) {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      setInstallEvent(null);
      if (outcome === 'accepted') toast.success('NearMe is installing');
      return outcome;
    }
    return 'ios';
  };
  return { canInstall, installed, ios, hasNativePrompt: Boolean(installEvent), install };
}

/** Step-by-step install help for iOS, where the browser offers no install prompt. */
export function IosInstallSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const steps = [
    { icon: Share, text: 'Tap the Share button in the browser toolbar.' },
    { icon: SquarePlus, text: 'Scroll down and choose “Add to Home Screen”.' },
    { icon: Download, text: 'Tap “Add”. NearMe appears on your home screen like any other app.' },
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add NearMe to your Home Screen" description="Three quick steps in Safari." size="sm">
      <ol className="space-y-3 pt-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3.5 rounded-xl bg-bg-2 p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-card">
              <s.icon className="size-5" />
            </span>
            <span className="text-sm text-ink">
              <span className="tabular mr-1.5 font-semibold text-brand-ink">{i + 1}.</span>
              {s.text}
            </span>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/** Custom install card. Appears once the browser says the app is installable; easy to dismiss for a while. */
export function InstallPWA() {
  const { canInstall, ios, install } = useInstallState();
  const dismissedAt = useSettings((s) => s.installDismissedAt);
  const set = useSettings((s) => s.set);
  const [iosHelp, setIosHelp] = useState(false);
  const [ready, setReady] = useState(false);

  // Let people use the app for a moment before asking.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 12_000);
    return () => clearTimeout(t);
  }, []);

  const visible = ready && canInstall && Date.now() - dismissedAt > 14 * DAY;
  const onInstall = async () => {
    const result = await install();
    if (result === 'ios') setIosHelp(true);
    else set({ installDismissedAt: Date.now() });
  };

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-3 bottom-[84px] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-float lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0"
          >
            <LogoMark size={44} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Install NearMe</p>
              <p className="text-[12.5px] text-muted-2">{ios ? 'Add it to your Home Screen for one-tap access.' : 'Opens instantly and works offline.'}</p>
            </div>
            <Button size="sm" variant="brand" onClick={onInstall}>
              Install
            </Button>
            <button type="button" aria-label="Not now" onClick={() => set({ installDismissedAt: Date.now() })} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-2 hover:bg-bg-2">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <IosInstallSheet open={iosHelp} onOpenChange={setIosHelp} />
    </>
  );
}
