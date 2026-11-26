import { Clock, EyeOff, History, LocateFixed, LocateOff, MapPin, RotateCcw, ShieldCheck, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { Notice } from '@/components/common/states';
import { Badge, Chip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/controls';
import { RADIUS_OPTIONS } from '@/features/discovery/components/LocationPicker';
import { formatRadius } from '@/lib/geo';
import { timeAgo } from '@/lib/time';
import { useLocation } from '@/store/location';
import { useUi } from '@/store/ui';

type Permission = PermissionState | 'unsupported';

function usePermission(): Permission {
  const [state, setState] = useState<Permission>('prompt');
  const status = useLocation((s) => s.status);
  useEffect(() => {
    let cancelled = false;
    let handle: PermissionStatus | undefined;
    if (!navigator.permissions?.query) {
      setState('geolocation' in navigator ? 'prompt' : 'unsupported');
      return;
    }
    void navigator.permissions.query({ name: 'geolocation' }).then((p) => {
      if (cancelled) return;
      handle = p;
      setState(p.state);
      p.onchange = () => setState(p.state);
    });
    return () => {
      cancelled = true;
      if (handle) handle.onchange = null;
    };
  }, [status]);
  return state;
}

const PERMISSION: Record<Permission, { label: string; tone: 'success' | 'danger' | 'butter' | 'neutral'; text: string }> = {
  granted: { label: 'Allowed', tone: 'success', text: 'NearMe can use your location while the app is open.' },
  denied: { label: 'Blocked', tone: 'danger', text: 'Location is blocked for this site. NearMe keeps working with an area you choose.' },
  prompt: { label: 'Not asked yet', tone: 'butter', text: 'Your browser will ask the first time you tap “Use my location”.' },
  unsupported: { label: 'Unavailable', tone: 'neutral', text: 'This device or browser cannot share its location. Choose an area instead.' },
};

const PROMISES = [
  { icon: EyeOff, title: 'Never shown to others', text: 'Your precise position is not visible to any other person or business.' },
  { icon: MapPin, title: 'Updates use approximate areas', text: 'A live update about traffic or parking is placed on a ~300 m grid. Updates about a place use the place, not you.' },
  { icon: History, title: 'No location history', text: 'Only your most recent position is kept, rounded to about 100 m, so the app can reopen where you left off.' },
  { icon: Store, title: 'Not sold, not shared', text: 'Location data is never sold or passed to advertisers.' },
];

export default function LocationSettingsPage() {
  const loc = useLocation();
  const openPicker = useUi((s) => s.setLocationPicker);
  const permission = usePermission();
  const meta = PERMISSION[permission];
  const custom = !RADIUS_OPTIONS.includes(loc.radius);

  const locate = async () => {
    const ok = await loc.locate();
    if (ok) toast.success('Using your current location');
  };

  return (
    <Page className="max-w-[820px]">
      <PageHeader back="/settings" title="Location" subtitle="Choose how NearMe knows where to look, and see exactly how your location is used." />

      <section className="card p-5">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand-ink">{permission === 'denied' ? <LocateOff className="size-6" /> : <LocateFixed className="size-6" />}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[16px] font-semibold text-ink">Device location</h2>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-2">{meta.text}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[12.5px] text-muted-2">Looking around</dt>
            <dd className="mt-0.5 font-medium text-ink">{[loc.area, loc.city].filter(Boolean).join(', ')}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-muted-2">Source</dt>
            <dd className="mt-0.5 font-medium text-ink">{loc.status === 'locating' ? 'Finding you…' : loc.source === 'gps' ? 'Live location' : loc.source === 'manual' ? 'Chosen by you' : 'Default area'}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-muted-2">{loc.source === 'gps' ? 'Accuracy' : 'Last changed'}</dt>
            <dd className="tabular mt-0.5 font-medium text-ink">{loc.source === 'gps' && loc.accuracy ? `Within ${Math.round(loc.accuracy)} m` : loc.updatedAt ? timeAgo(loc.updatedAt) : 'Not yet set'}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={locate} loading={loc.status === 'locating'} disabled={permission === 'denied' || permission === 'unsupported'}>
            <LocateFixed /> Use my location
          </Button>
          <Button variant="secondary" onClick={() => openPicker(true)}>
            <MapPin /> Choose an area
          </Button>
          {loc.source !== 'default' && (
            <Button variant="ghost" onClick={() => { loc.resetToDefault(); toast('Location cleared', { description: 'NearMe is back to the default starting area.' }); }}>
              <RotateCcw /> Stop using my location
            </Button>
          )}
        </div>

        {loc.error && (loc.status === 'denied' || loc.status === 'unavailable') && (
          <Notice tone="warning" className="mt-4">
            {loc.error}
          </Notice>
        )}
        {permission === 'denied' && (
          <Notice className="mt-4">
            <p className="font-medium text-ink">To allow location again</p>
            Open your browser's site settings for NearMe (the lock or tune icon beside the address bar), set Location to “Allow”, then reload. On a phone with the app installed, check Settings → Apps → NearMe → Permissions.
          </Notice>
        )}
      </section>

      <section className="mt-8">
        <h2 className="display-sm text-xl text-ink">Default search distance</h2>
        <p className="mb-3 mt-0.5 text-sm text-muted-2">How far NearMe looks on the home screen, in search and on the map.</p>
        <div className="flex flex-wrap gap-2">
          {RADIUS_OPTIONS.map((r) => (
            <Chip key={r} active={loc.radius === r} onClick={() => loc.setRadius(r)}>
              {formatRadius(r)}
            </Chip>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <div className="mb-1.5 flex justify-between text-[13px]">
            <span className="text-muted-2">Custom distance{custom ? '' : ' (drag to set)'}</span>
            <span className="tabular font-semibold text-ink">{formatRadius(loc.radius)}</span>
          </div>
          <Slider aria-label="Custom search distance" min={300} max={15000} step={100} value={[loc.radius]} onValueChange={([v]) => v && loc.setRadius(v)} />
        </div>
      </section>

      {loc.recents.length > 0 && (
        <section className="mt-8">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="display-sm text-xl text-ink">Recent areas</h2>
            <button type="button" onClick={loc.clearRecents} className="text-[13px] font-medium text-muted-2 hover:text-ink">
              Clear
            </button>
          </div>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {loc.recents.map((r) => (
              <li key={`${r.lat},${r.lon}`}>
                <button type="button" onClick={() => { loc.setManual(r); toast.success(`Now showing ${r.name}`); }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  <Clock className="size-[18px] shrink-0 text-muted-2" />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-ink">{r.name}</span>
                    {r.detail && <span className="block truncate text-[13px] text-muted-2">{r.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="display-sm flex items-center gap-2 text-xl text-ink">
          <ShieldCheck className="size-5 text-success" aria-hidden /> How NearMe uses your location
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {PROMISES.map((p) => (
            <li key={p.title} className="rounded-2xl border border-line bg-surface p-4">
              <p.icon className="size-5 text-muted-2" strokeWidth={1.75} />
              <p className="mt-3 text-[15px] font-semibold text-ink">{p.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-2">{p.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] leading-relaxed text-muted-2">
          To find places, NearMe sends the area you are looking at (rounded to about 100 m) to the map data providers listed in Settings. No account or device identifier is sent with those requests.
        </p>
      </section>
    </Page>
  );
}
