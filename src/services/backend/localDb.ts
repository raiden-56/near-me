import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idbStorage } from '@/store/persist';
import type {
  AdminConfig,
  AnalyticsEvent,
  BusinessListing,
  Collection,
  CommunityReport,
  Contribution,
  Deal,
  EventItem,
  ModerationItem,
  NotificationItem,
  PlaceSuggestion,
  Review,
  SavedPlace,
  UserProfile,
} from '@/types';

/**
 * Local backend. When no Supabase project is configured, every write the user makes (reviews,
 * live reports, saved places, listings, moderation decisions …) is stored here, in IndexedDB,
 * on this device only. Service modules are the only code that touches it, so swapping in the
 * Supabase tables from /supabase/migrations is a change inside the services, not the UI.
 *
 * Nothing in this store is sample data. Sample content is generated separately (src/data/sample)
 * and merged in by the services, always flagged `isSample`.
 */

/** Votes cast on sample items are kept apart so sample content itself stays immutable. */
export interface VoteOverlay {
  confirmations: string[];
  disagreements: string[];
  helpful: string[];
  flagged: string[];
}

export interface LocalDbState {
  users: UserProfile[];
  reviews: Review[];
  reports: CommunityReport[];
  overlays: Record<string, VoteOverlay>;
  deals: Deal[];
  savedDealIds: string[];
  events: EventItem[];
  eventInterest: string[];
  saved: Record<string, SavedPlace>;
  collections: Collection[];
  notifications: NotificationItem[];
  notificationsSeeded: boolean;
  contributions: Contribution[];
  suggestions: PlaceSuggestion[];
  listings: BusinessListing[];
  analytics: AnalyticsEvent[];
  moderation: ModerationItem[];
  /** Ids of sample items an admin hid, so moderation works on sample content too. */
  hiddenIds: string[];
  config: AdminConfig;
  hydrated: boolean;
}

export const DEFAULT_CONFIG: AdminConfig = {
  expiryMinutes: {
    queue: 20,
    wait_time: 30,
    parking: 20,
    traffic: 20,
    road: 60,
    availability: 45,
    service: 45,
    closure: 240,
    outage: 180,
    price: 720,
    event: 360,
  },
  minConfirmationsForVerified: 3,
  maxReportsPerHour: 6,
  disagreementsToHide: 4,
  disabledCategoryIds: [],
  featuredCategoryIds: [],
  dealsRequireApproval: false,
  eventsRequireApproval: true,
};

const initial: LocalDbState = {
  users: [],
  reviews: [],
  reports: [],
  overlays: {},
  deals: [],
  savedDealIds: [],
  events: [],
  eventInterest: [],
  saved: {},
  collections: [],
  notifications: [],
  notificationsSeeded: false,
  contributions: [],
  suggestions: [],
  listings: [],
  analytics: [],
  moderation: [],
  hiddenIds: [],
  config: DEFAULT_CONFIG,
  hydrated: false,
};

export const useLocalDb = create<LocalDbState>()(
  persist(() => initial, {
    name: 'nearme-local-db',
    storage: idbStorage(),
    version: 1,
    partialize: ({ hydrated, ...rest }) => rest as LocalDbState,
    merge: (persisted, current) => {
      const p = (persisted ?? {}) as Partial<LocalDbState>;
      return { ...current, ...p, config: { ...DEFAULT_CONFIG, ...p.config, expiryMinutes: { ...DEFAULT_CONFIG.expiryMinutes, ...p.config?.expiryMinutes } } };
    },
    onRehydrateStorage: () => () => {
      useLocalDb.setState({ hydrated: true });
    },
  }),
);

let readyPromise: Promise<void> | null = null;

export const localDb = {
  get: () => useLocalDb.getState(),
  set: (patch: Partial<LocalDbState> | ((s: LocalDbState) => Partial<LocalDbState>)) => useLocalDb.setState(patch),
  /** Resolves once persisted data has been loaded from IndexedDB. Every service awaits this first. */
  ready(): Promise<void> {
    readyPromise ??= new Promise<void>((resolve) => {
      if (useLocalDb.getState().hydrated) return resolve();
      const unsub = useLocalDb.subscribe((s) => {
        if (s.hydrated) {
          unsub();
          resolve();
        }
      });
      // Storage can be unavailable (private mode): do not block the app on it.
      setTimeout(() => {
        if (!useLocalDb.getState().hydrated) useLocalDb.setState({ hydrated: true });
      }, 1500);
    });
    return readyPromise;
  },
  overlay(id: string): VoteOverlay {
    return useLocalDb.getState().overlays[id] ?? { confirmations: [], disagreements: [], helpful: [], flagged: [] };
  },
  setOverlay(id: string, next: VoteOverlay) {
    useLocalDb.setState((s) => ({ overlays: { ...s.overlays, [id]: next } }));
  },
  reset() {
    useLocalDb.setState({ ...initial, hydrated: true });
  },
};

/** Toggle membership of `value` in a list, returning a new array. */
export const toggle = <T,>(list: readonly T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
