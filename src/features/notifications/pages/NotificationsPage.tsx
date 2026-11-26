import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, BellRing, CheckCheck, Info, Settings2, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@/components/common/Icon';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { EmptyState, Notice } from '@/components/common/states';
import { Chip, SampleTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton, Switch } from '@/components/ui/controls';
import { Input, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { RADIUS_OPTIONS } from '@/features/discovery/components/LocationPicker';
import { formatRadius } from '@/lib/geo';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { inQuietHours, NOTIFICATION_KINDS, notificationsService } from '@/services/notifications';
import { useSettings } from '@/store/settings';
import type { NotificationItem, NotificationPrefs } from '@/types';

const KIND_META = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.id, k]));
const KIND_TONE: Record<string, string> = {
  deal: 'bg-butter-soft text-butter-ink',
  saved: 'bg-brand-soft text-brand-ink',
  availability: 'bg-success-soft text-success',
  event: 'bg-sage text-sage-ink',
  community: 'bg-warning-soft text-warning',
  favorite: 'bg-danger-soft text-danger',
  system: 'bg-bg-2 text-ink-2',
};

export function NotificationCard({ item, onOpen, onRemove }: { item: NotificationItem; onOpen: () => void; onRemove: () => void }) {
  const meta = KIND_META[item.kind];
  return (
    <div className={cn('group relative flex gap-3.5 rounded-2xl border p-3.5 transition-colors', item.read ? 'border-line bg-surface' : 'border-brand/25 bg-brand-soft/45')}>
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', KIND_TONE[item.kind])}>{item.kind === 'system' ? <Info className="size-5" /> : <Icon name={meta?.icon ?? 'Megaphone'} className="size-5" />}</span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-2">
          <span className={cn('truncate text-[15px] text-ink', item.read ? 'font-medium' : 'font-semibold')}>{item.title}</span>
          {!item.read && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-ink-2">{item.body}</p>
        <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-muted-2">
          {meta?.label ?? 'NearMe'} · {timeAgo(item.createdAt)} {item.isSample && <SampleTag />}
        </p>
      </button>
      <button type="button" onClick={onRemove} aria-label="Dismiss notification" className="grid size-8 shrink-0 place-items-center rounded-full text-muted opacity-100 hover:bg-bg-2 hover:text-ink lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Controls for what NearMe may notify about, how far, how often and when to stay quiet. */
export function NotificationPreferences({ className }: { className?: string }) {
  const prefs = useSettings((s) => s.notifications);
  const setPrefs = useSettings((s) => s.setNotifications);
  const [busy, setBusy] = useState(false);
  const support = notificationsService.pushSupport();
  const permission = notificationsService.permission();
  const patch = (p: Partial<NotificationPrefs>) => setPrefs(p);

  const togglePush = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const { permission: result, subscription } = await notificationsService.enablePush();
        if (result !== 'granted') {
          toast.warning('Notifications are blocked', { description: 'Allow notifications for this site in your browser settings, then try again.' });
          return;
        }
        patch({ push: true });
        toast.success('Device notifications on', { description: subscription ? 'This device is subscribed to push.' : 'NearMe can now show alerts while it is open or installed.' });
        void notificationsService.showLocal('NearMe notifications are on', 'You will hear about the things you chose, and nothing else.');
      } else {
        await notificationsService.disablePush();
        patch({ push: false });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change notification settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block text-[15px] font-semibold text-ink">Notifications</span>
          <span className="block text-[13px] text-muted-2">Turn everything on or off in one place.</span>
        </span>
        <Switch checked={prefs.enabled} onCheckedChange={(v) => patch({ enabled: v })} aria-label="Enable notifications" />
      </label>

      <fieldset disabled={!prefs.enabled} className={cn('space-y-6 transition-opacity', !prefs.enabled && 'opacity-50')}>
        <div>
          <legend className="mb-2 text-[13px] font-semibold text-ink">What to tell you about</legend>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {NOTIFICATION_KINDS.map((k) => (
              <li key={k.id}>
                <label className="flex items-center gap-3 px-4 py-3">
                  <Icon name={k.icon} className="size-5 shrink-0 text-muted-2" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{k.label}</span>
                    <span className="block text-[12.5px] text-muted-2">{k.description}</span>
                  </span>
                  <Switch checked={prefs.kinds[k.id]} onCheckedChange={(v) => patch({ kinds: { ...prefs.kinds, [k.id]: v } })} aria-label={k.label} />
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Only within</p>
          <div className="flex flex-wrap gap-2">
            {RADIUS_OPTIONS.map((r) => (
              <Chip key={r} active={prefs.radius === r} onClick={() => patch({ radius: r })}>
                {formatRadius(r)}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="notif-frequency" className="mb-2 block text-[13px] font-semibold text-ink">
              How often
            </label>
            <Select id="notif-frequency" value={prefs.frequency} onChange={(e) => patch({ frequency: e.target.value as NotificationPrefs['frequency'] })}>
              <option value="instant">As they happen</option>
              <option value="hourly">At most once an hour</option>
              <option value="daily">One daily summary</option>
            </Select>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">Quiet hours</span>
              <Switch checked={prefs.quietHours.enabled} onCheckedChange={(v) => patch({ quietHours: { ...prefs.quietHours, enabled: v } })} aria-label="Quiet hours" />
            </div>
            <div className={cn('flex items-center gap-2', !prefs.quietHours.enabled && 'opacity-50')}>
              <Input type="time" value={prefs.quietHours.from} disabled={!prefs.quietHours.enabled} onChange={(e) => patch({ quietHours: { ...prefs.quietHours, from: e.target.value } })} aria-label="Quiet hours start" />
              <span className="text-sm text-muted-2">to</span>
              <Input type="time" value={prefs.quietHours.to} disabled={!prefs.quietHours.enabled} onChange={(e) => patch({ quietHours: { ...prefs.quietHours, to: e.target.value } })} aria-label="Quiet hours end" />
            </div>
            {inQuietHours(prefs) && <p className="mt-1.5 text-[12.5px] text-muted-2">Quiet hours are active right now.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4">
          <label className="flex items-center gap-3">
            <BellRing className="size-5 shrink-0 text-muted-2" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">Alerts on this device</span>
              <span className="block text-[12.5px] text-muted-2">
                {support === 'unsupported'
                  ? 'This browser does not support notifications.'
                  : permission === 'denied'
                    ? 'Blocked in your browser settings for this site.'
                    : support === 'unconfigured'
                      ? 'Shown while NearMe is open or installed. Background push needs a server key.'
                      : 'Delivered even when NearMe is closed.'}
              </span>
            </span>
            <Switch checked={prefs.push && permission === 'granted'} disabled={busy || support === 'unsupported' || permission === 'denied'} onCheckedChange={togglePush} aria-label="Alerts on this device" />
          </label>
        </div>
      </fieldset>
    </div>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const prefs = useSettings((s) => s.notifications);
  const version = useLocalDb((s) => s.notifications);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [prefsOpen, setPrefsOpen] = useState(false);

  const query = useQuery({ queryKey: ['notifications', version, prefs.kinds], queryFn: () => notificationsService.list(prefs), staleTime: 0 });
  const items = (query.data ?? []).filter((n) => filter === 'all' || !n.read);
  const unread = (query.data ?? []).filter((n) => !n.read).length;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['notifications'] });

  const open = async (item: NotificationItem) => {
    await notificationsService.markRead(item.id);
    refresh();
    if (item.href) navigate(item.href);
  };

  return (
    <Page className="max-w-[820px]">
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : 'You are all caught up'}
        actions={
          <Button variant="secondary" onClick={() => setPrefsOpen(true)}>
            <Settings2 /> <span className="hidden sm:inline">Preferences</span>
          </Button>
        }
      />

      {!prefs.enabled && (
        <Notice icon={BellOff} tone="warning" className="mb-4" action={<Button size="sm" variant="secondary" onClick={() => useSettings.getState().setNotifications({ enabled: true })}>Turn on</Button>}>
          Notifications are turned off. You will not get new alerts until you turn them back on.
        </Notice>
      )}

      <div className="mb-4 flex items-center gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </Chip>
        <Chip active={filter === 'unread'} onClick={() => setFilter('unread')}>
          Unread {unread > 0 && <span className="tabular">· {unread}</span>}
        </Chip>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" disabled={!unread} onClick={async () => { await notificationsService.markAllRead(); refresh(); }}>
            <CheckCheck /> <span className="hidden sm:inline">Mark all read</span>
          </Button>
          <Button variant="ghost" size="sm" disabled={!query.data?.length} onClick={async () => { await notificationsService.clear(); refresh(); toast('Notifications cleared'); }}>
            <Trash2 /> <span className="hidden sm:inline">Clear</span>
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[92px] rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'} description="Deals near you, changes at saved places and important local updates will appear here. We keep it to what matters." />
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {items.map((n) => (
              <motion.div key={n.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.22 }}>
                <NotificationCard item={n} onOpen={() => void open(n)} onRemove={async () => { await notificationsService.remove(n.id); refresh(); }} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <p className="mt-8 text-center text-[13px] text-muted-2">
        Fine-tune alerts any time in{' '}
        <Link to="/settings" className="font-medium text-ink underline underline-offset-2">
          Settings
        </Link>
        .
      </p>

      <Sheet open={prefsOpen} onOpenChange={setPrefsOpen} title="Notification preferences" description="You decide what reaches you, how often and when." size="md">
        <NotificationPreferences />
      </Sheet>
    </Page>
  );
}
