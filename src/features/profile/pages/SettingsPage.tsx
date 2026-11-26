import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Database, Download, ExternalLink, FlaskConical, HardDrive, MapPin, Moon, Sun, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { IosInstallSheet, useInstallState } from '@/components/common/AppBanners';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, Segmented, Switch } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/sheet';
import { NotificationPreferences } from '@/features/notifications/pages/NotificationsPage';
import { areaStore, clearAllLocalData, placeStore, storageEstimate } from '@/lib/db';
import { appUrl, env, hasBackend } from '@/lib/env';
import { formatRadius } from '@/lib/geo';
import { authService } from '@/services/auth';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';
import { useSettings, type Theme } from '@/store/settings';
import type { Role } from '@/types';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-8 first:border-t-0 first:pt-2 lg:grid-cols-[260px_1fr] lg:gap-10">
      <div>
        <h2 className="display-sm text-xl text-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-muted-2">{description}</p>}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

function Row({ title, hint, control, icon }: { title: string; hint?: ReactNode; control: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5">
      {icon && <span className="shrink-0 text-muted-2 [&_svg]:size-5">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-2">{hint}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

const SOURCES = [
  { name: 'OpenStreetMap', role: 'Places, addresses, opening hours', url: 'https://www.openstreetmap.org/copyright' },
  { name: 'OpenFreeMap', role: 'Map tiles and nearby-place index', url: 'https://openfreemap.org' },
  { name: 'Overpass API and Nominatim', role: 'Detailed place data and area names', url: 'https://nominatim.org' },
  { name: 'Photon by Komoot', role: 'Location search', url: 'https://photon.komoot.io' },
  { name: 'OSRM', role: 'Routes and travel times', url: 'https://project-osrm.org' },
  { name: 'Wikimedia Commons', role: 'Photographs', url: 'https://commons.wikimedia.org' },
];

const formatBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function SettingsPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const settings = useSettings();
  const { area, city, radius, source } = useLocation();
  const install = useInstallState();
  const [iosHelp, setIosHelp] = useState(false);
  const [wipe, setWipe] = useState(false);
  const storage = useQuery({ queryKey: ['storage-estimate'], queryFn: storageEstimate, staleTime: 30_000 });

  const clearCache = async () => {
    await areaStore.clear();
    await placeStore.clearRecent();
    if ('caches' in window) await Promise.all((await caches.keys()).filter((k) => /map-tiles|place-data|images/.test(k)).map((k) => caches.delete(k)));
    void storage.refetch();
    toast.success('Cached map data cleared', { description: 'Saved places and your own contributions were kept.' });
  };

  const wipeAll = async () => {
    if (user?.provider === 'local') await authService.deleteLocalAccount();
    await clearAllLocalData();
    localStorage.clear();
    window.location.assign(appUrl());
  };

  const setRole = async (role: Role) => {
    try {
      await authService.setLocalRole(role);
      toast.success(role === 'user' ? 'Back to a regular account' : `${role === 'admin' ? 'Admin' : 'Business'} workspace enabled on this device`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change the role.');
    }
  };

  return (
    <Page className="max-w-[1000px]">
      <PageHeader title="Settings" subtitle="Location, appearance, notifications and your data." />

      <Section title="Account" description="Browsing never needs an account. Signing in lets you contribute.">
        {user ? (
          <Link to="/profile" className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2">
            <Avatar name={user.name} hue={user.avatarHue} size={44} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-ink">{user.name}</span>
              <span className="block truncate text-[13px] text-muted-2">{user.email ?? user.phone ?? 'Signed in'}</span>
            </span>
            <ChevronRight className="size-4 text-muted" />
          </Link>
        ) : (
          <Row title="You are browsing as a guest" hint="Create an account to write reviews, share live updates and earn badges." control={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
        )}
        <Row
          icon={hasBackend ? <Database /> : <HardDrive />}
          title={hasBackend ? 'Connected to Supabase' : 'Local mode'}
          hint={hasBackend ? 'Accounts and community data are stored in your Supabase project.' : 'No backend is configured. Accounts, reviews, updates and saved places are stored on this device only. Add Supabase keys in .env.local to sync across devices.'}
          control={<Badge tone={hasBackend ? 'success' : 'butter'}>{hasBackend ? 'Online' : 'This device'}</Badge>}
        />
      </Section>

      <Section title="Location" description="Controls where NearMe looks and how far.">
        <Link to="/settings/location" className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2">
          <MapPin className="size-5 shrink-0 text-muted-2" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-ink">{[area, city].filter(Boolean).join(', ')}</span>
            <span className="block text-[13px] text-muted-2">
              {source === 'gps' ? 'Using your live location' : source === 'manual' ? 'An area you picked' : 'Default starting area'} · searching within {formatRadius(radius)}
            </span>
          </span>
          <ChevronRight className="size-4 text-muted" />
        </Link>
      </Section>

      <Section title="Appearance">
        <Row
          title="Theme"
          hint="Light is the default. Dark is easier on the eyes at night."
          control={
            <Segmented<Theme>
              aria-label="Theme"
              size="sm"
              value={settings.theme}
              onChange={settings.setTheme}
              options={[
                { value: 'light', label: 'Light', icon: <Sun /> },
                { value: 'dark', label: 'Dark', icon: <Moon /> },
              ]}
            />
          }
        />
        <Row title="Reduce motion" hint="Turns off page transitions and decorative animation. Your device setting is always respected too." control={<Switch checked={settings.reduceMotion} onCheckedChange={(v) => settings.set({ reduceMotion: v })} aria-label="Reduce motion" />} />
      </Section>

      <Section title="Notifications" description="Nothing is sent unless you ask for it.">
        <div className="rounded-2xl border border-line bg-surface-2 p-4 sm:p-5">
          <NotificationPreferences />
        </div>
      </Section>

      <Section title="Data and sources" description="What is real, what is sample, and where it comes from.">
        <Row
          icon={<FlaskConical />}
          title="Sample community content"
          hint="Places, maps, routes and photos are always real. This switch adds labelled example ratings, reviews, live updates, deals and events so the app is not empty before real people contribute."
          control={<Switch checked={settings.sampleData} onCheckedChange={(v) => settings.set({ sampleData: v, demoBannerDismissed: false })} aria-label="Sample community content" />}
        />
        <Row title="Remember my searches" hint="Kept on this device to suggest them again." control={<Switch checked={settings.saveSearchHistory} onCheckedChange={(v) => { settings.set({ saveSearchHistory: v }); if (!v) settings.clearSearches(); }} aria-label="Remember my searches" />} />
        <div className="rounded-2xl border border-line bg-surface">
          <p className="border-b border-line px-4 py-3 text-[13px] font-semibold text-ink">Live data providers</p>
          <ul className="divide-y divide-line">
            {SOURCES.map((s) => (
              <li key={s.name}>
                <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-ink">{s.name}</span> <span className="text-muted-2">· {s.role}</span>
                  </span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted" />
                </a>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-3 text-[12.5px] leading-relaxed text-muted-2">Map data © OpenStreetMap contributors. Providers are configurable in .env; the public instances used by default are best-effort services, not for production traffic.</p>
        </div>
      </Section>

      <Section title="App and storage">
        <Row
          icon={<Download />}
          title={install.installed ? 'NearMe is installed' : 'Install NearMe'}
          hint={install.installed ? 'You are using the installed app.' : install.canInstall ? 'Add it to your home screen. It opens instantly and works offline.' : 'Your browser has not offered installation yet. Use the browser menu and choose “Install app” or “Add to Home Screen”.'}
          control={
            install.installed ? (
              <Badge tone="success">Installed</Badge>
            ) : (
              <Button size="sm" variant={install.canInstall ? 'brand' : 'secondary'} disabled={!install.canInstall} onClick={async () => (await install.install()) === 'ios' && setIosHelp(true)}>
                Install
              </Button>
            )
          }
        />
        <Row
          icon={<HardDrive />}
          title="Offline storage"
          hint={storage.data ? `Using ${formatBytes(storage.data.usage)} of ${formatBytes(storage.data.quota)} available. Includes map tiles for areas you have viewed.` : 'Map tiles and places you view are kept for offline use.'}
          control={<Button size="sm" variant="secondary" onClick={clearCache}>Clear cache</Button>}
        />
      </Section>

      {!hasBackend && (
        <Section title="Workspaces" description="Local mode only. With a backend, roles are assigned by an administrator and enforced by the database.">
          <Row
            title="Role for this device account"
            hint={user ? 'Lets you open the business portal and the admin area to explore them. This changes nothing outside this device.' : 'Sign in first to choose a role.'}
            control={
              <Segmented<Role>
                aria-label="Role"
                size="sm"
                value={user?.role ?? 'user'}
                onChange={(r) => (user ? void setRole(r) : navigate('/login?next=/settings'))}
                options={[
                  { value: 'user', label: 'User' },
                  { value: 'business', label: 'Business' },
                  { value: 'admin', label: 'Admin' },
                ]}
              />
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/business">Open business portal</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/admin">Open admin area</Link>
            </Button>
          </div>
        </Section>
      )}

      <Section title="Privacy" description="You are in control of what stays on this device.">
        <Row
          icon={<Trash2 />}
          title="Erase everything on this device"
          hint="Removes your local account, saved places, reviews, updates, settings and cached map data. This cannot be undone."
          control={<Button size="sm" variant="danger-soft" onClick={() => setWipe(true)}>Erase</Button>}
        />
        <p className="px-1 text-[12.5px] leading-relaxed text-muted-2">
          NearMe never shows your precise location to other people, keeps no location history, and does not sell location data. Version 0.1.0 · Default area: {env.defaultLocation.area}, {env.defaultLocation.city}.
        </p>
      </Section>

      <IosInstallSheet open={iosHelp} onOpenChange={setIosHelp} />
      <ConfirmDialog open={wipe} onOpenChange={setWipe} title="Erase all NearMe data on this device?" description="Your local account, saved places, collections, reviews, live updates and settings will be deleted permanently." confirmLabel="Erase everything" destructive onConfirm={wipeAll} />
    </Page>
  );
}
