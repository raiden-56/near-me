import { sampleDeals, sampleEvents } from '@/data/sample/deals';
import { assetUrl, env } from '@/lib/env';
import { formatDistance } from '@/lib/geo';
import { formatDateRange, HOUR, MIN } from '@/lib/time';
import { uid } from '@/lib/utils';
import type { NotificationItem, NotificationKind, NotificationPrefs, PlaceWithDistance } from '@/types';
import { localDb } from './backend/localDb';

export const NOTIFICATION_KINDS: { id: Exclude<NotificationKind, 'system'>; label: string; description: string; icon: string }[] = [
  { id: 'deal', label: 'Nearby deals', description: 'New offers within your radius', icon: 'BadgePercent' },
  { id: 'saved', label: 'Saved places', description: 'Changes at places you saved', icon: 'Bookmark' },
  { id: 'availability', label: 'Business availability', description: 'Queues and availability you follow', icon: 'Activity' },
  { id: 'event', label: 'Local events', description: 'Things happening around you', icon: 'CalendarDays' },
  { id: 'community', label: 'Important community updates', description: 'Outages, closures and road blocks', icon: 'Megaphone' },
  { id: 'favorite', label: 'Favorite businesses', description: 'News from businesses you follow', icon: 'Heart' },
];

/** True when "now" falls inside the user's quiet hours (handles ranges that cross midnight). */
export function inQuietHours(prefs: NotificationPrefs, now = new Date()): boolean {
  if (!prefs.quietHours.enabled) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const from = toMin(prefs.quietHours.from);
  const to = toMin(prefs.quietHours.to);
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export const notificationsService = {
  async list(prefs: NotificationPrefs): Promise<NotificationItem[]> {
    await localDb.ready();
    return localDb
      .get()
      .notifications.filter((n) => n.kind === 'system' || prefs.kinds[n.kind])
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  /** Add a notification, respecting the user's category opt-outs. */
  async push(kind: NotificationKind, title: string, body: string, href?: string, prefs?: NotificationPrefs): Promise<void> {
    await localDb.ready();
    if (prefs && (!prefs.enabled || (kind !== 'system' && !prefs.kinds[kind]))) return;
    const item: NotificationItem = { id: uid('notif'), kind, title, body, href, createdAt: Date.now(), read: false };
    localDb.set((s) => ({ notifications: [item, ...s.notifications].slice(0, 80) }));
  },

  /**
   * First run in sample mode: a few labelled sample notifications built from the sample deals
   * and events around the user, so the notification centre is not empty. Seeded once.
   */
  async seedSamples(places: PlaceWithDistance[], prefs: NotificationPrefs): Promise<void> {
    await localDb.ready();
    if (localDb.get().notificationsSeeded || !places.length) return;
    const now = Date.now();
    const inRadius = places.filter((p) => p.distance <= prefs.radius);
    const deals = sampleDeals(inRadius, now).slice(0, 2);
    const events = sampleEvents(inRadius, now).slice(0, 1);
    const items: NotificationItem[] = [
      ...deals.map((d, i) => ({
        id: uid('notif'), kind: 'deal' as const, title: `${d.badge} at ${d.placeName}`,
        body: `${d.title}. ${formatDistance(places.find((p) => p.id === d.placeId)?.distance)} from you.`,
        href: `/place/${d.placeId}`, createdAt: now - (25 + i * 95) * MIN, read: false, isSample: true,
      })),
      ...events.map((e) => ({
        id: uid('notif'), kind: 'event' as const, title: e.title, body: `${formatDateRange(e.startsAt, e.endsAt)} at ${e.venueName}.`,
        href: '/events', createdAt: now - 5 * HOUR, read: false, isSample: true,
      })),
      {
        id: uid('notif'), kind: 'system', title: 'Welcome to NearMe',
        body: 'Places, maps and directions are live OpenStreetMap data. Community content marked "Sample" is example data until a backend is connected.',
        href: '/settings', createdAt: now - 6 * HOUR, read: false,
      },
    ];
    localDb.set((s) => ({ notifications: [...items, ...s.notifications], notificationsSeeded: true }));
  },

  async markRead(id: string, read = true): Promise<void> {
    await localDb.ready();
    localDb.set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read } : n)) }));
  },

  async markAllRead(): Promise<void> {
    await localDb.ready();
    localDb.set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
  },

  async remove(id: string): Promise<void> {
    await localDb.ready();
    localDb.set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
  },

  async clear(): Promise<void> {
    await localDb.ready();
    localDb.set({ notifications: [] });
  },

  /* ── Web push ───────────────────────────────────────────────────────── */

  pushSupport(): 'supported' | 'unsupported' | 'unconfigured' {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
    return env.vapidPublicKey ? 'supported' : 'unconfigured';
  },

  permission: (): NotificationPermission | 'unsupported' => ('Notification' in window ? Notification.permission : 'unsupported'),

  /**
   * Ask for permission and, when a VAPID key is configured, create a push subscription.
   * The subscription must then be stored server-side (table `push_subscriptions`, see the
   * Supabase migration) so an Edge Function can send to it. Without a key, permission still
   * enables local notifications shown by the service worker.
   */
  async enablePush(): Promise<{ permission: NotificationPermission; subscription: PushSubscriptionJSON | null }> {
    if (!('Notification' in window)) throw new Error('This browser does not support notifications.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted' || !env.vapidPublicKey || !('serviceWorker' in navigator)) return { permission, subscription: null };
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey) as BufferSource }));
    return { permission, subscription: subscription.toJSON() };
  },

  async disablePush(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  },

  /** Show a notification through the service worker (works without a push server). */
  async showLocal(title: string, body: string, href = '/notifications'): Promise<boolean> {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration) return false;
    await registration.showNotification(title, { body, icon: assetUrl('/icons/icon-192.png'), badge: assetUrl('/icons/icon-192.png'), data: { href }, tag: 'nearme-local' });
    return true;
  },
};
