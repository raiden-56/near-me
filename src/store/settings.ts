import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { hasBackend } from '@/lib/env';
import type { NotificationPrefs, TravelMode } from '@/types';
import { idbStorage } from './persist';

export type Theme = 'light' | 'dark';

interface SettingsState {
  theme: Theme;
  /** Labelled sample community content (ratings, reviews, live updates, deals, events). */
  sampleData: boolean;
  travelMode: TravelMode;
  reduceMotion: boolean;
  recentSearches: string[];
  saveSearchHistory: boolean;
  notifications: NotificationPrefs;
  locationPrimerDismissed: boolean;
  installDismissedAt: number;
  demoBannerDismissed: boolean;
  setTheme: (theme: Theme) => void;
  set: (patch: Partial<SettingsState>) => void;
  addSearch: (query: string) => void;
  removeSearch: (query: string) => void;
  clearSearches: () => void;
  setNotifications: (patch: Partial<NotificationPrefs>) => void;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  kinds: { deal: true, saved: true, availability: true, event: true, community: true, favorite: true },
  radius: 2000,
  frequency: 'hourly',
  quietHours: { enabled: true, from: '22:00', to: '07:00' },
  push: false,
};

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151916' : '#F5F3ED');
  try {
    localStorage.setItem('nearme-theme', theme);
  } catch {
    /* storage blocked: theme still applies for this session */
  }
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      sampleData: !hasBackend,
      travelMode: 'car',
      reduceMotion: false,
      recentSearches: [],
      saveSearchHistory: true,
      notifications: DEFAULT_NOTIFICATION_PREFS,
      locationPrimerDismissed: false,
      installDismissedAt: 0,
      demoBannerDismissed: false,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      set: (patch) => set(patch),
      addSearch: (query) =>
        set((s) => {
          const q = query.trim();
          if (!q || !s.saveSearchHistory) return s;
          return { recentSearches: [q, ...s.recentSearches.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 12) };
        }),
      removeSearch: (query) => set((s) => ({ recentSearches: s.recentSearches.filter((x) => x !== query) })),
      clearSearches: () => set({ recentSearches: [] }),
      setNotifications: (patch) => set((s) => ({ notifications: { ...s.notifications, ...patch } })),
    }),
    {
      name: 'nearme-settings',
      storage: idbStorage(),
      version: 1,
      partialize: ({ setTheme, set, addSearch, removeSearch, clearSearches, setNotifications, ...rest }) => rest,
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);
