import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { env } from '@/lib/env';
import { distanceMeters } from '@/lib/geo';
import { geocodingService } from '@/services/geocoding';
import type { LatLon } from '@/types';
import { idbStorage } from './persist';

export type LocationStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable' | 'manual';
export type LocationSource = 'gps' | 'manual' | 'default';

export interface RecentLocation {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

interface LocationState {
  status: LocationStatus;
  source: LocationSource;
  /** Always set: the configured starting point until the user shares or picks a location. */
  coords: LatLon;
  accuracy: number | null;
  area: string;
  city: string;
  countryCode: string;
  updatedAt: number;
  error: string | null;
  radius: number;
  recents: RecentLocation[];
  hydrated: boolean;
  locate: () => Promise<boolean>;
  setManual: (loc: { name: string; detail?: string; lat: number; lon: number; city?: string; countryCode?: string }) => void;
  setRadius: (radius: number) => void;
  refreshArea: (keepName?: boolean) => Promise<void>;
  clearRecents: () => void;
  resetToDefault: () => void;
}

const d = env.defaultLocation;

function geoErrorMessage(error: GeolocationPositionError): { status: LocationStatus; message: string } {
  if (error.code === error.PERMISSION_DENIED)
    return { status: 'denied', message: 'Location access is off. Choose an area manually, or allow location in your browser settings.' };
  if (error.code === error.TIMEOUT) return { status: 'unavailable', message: 'Finding your location took too long. Try again or choose an area.' };
  return { status: 'unavailable', message: 'Your location is unavailable right now. Choose an area instead.' };
}

export const useLocation = create<LocationState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      source: 'default',
      coords: { lat: d.lat, lon: d.lon },
      accuracy: null,
      area: d.area,
      city: d.city,
      countryCode: d.countryCode,
      updatedAt: 0,
      error: null,
      radius: 2000,
      recents: [],
      hydrated: false,

      locate: () =>
        new Promise<boolean>((resolve) => {
          if (!('geolocation' in navigator)) {
            set({ status: 'unavailable', error: 'This device does not support location. Choose an area instead.' });
            resolve(false);
            return;
          }
          set({ status: 'locating', error: null });
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
              const moved = distanceMeters(get().coords, coords) > 150 || get().source !== 'gps';
              set({ status: 'granted', source: 'gps', coords, accuracy: pos.coords.accuracy, updatedAt: Date.now(), error: null });
              if (moved) void get().refreshArea();
              resolve(true);
            },
            (err) => {
              const { status, message } = geoErrorMessage(err);
              // Keep whatever location was already in use: the app stays fully usable.
              set({ status, error: message });
              resolve(false);
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
          );
        }),

      setManual: (loc) => {
        const recent: RecentLocation = { name: loc.name, detail: loc.detail ?? '', lat: loc.lat, lon: loc.lon };
        set((s) => ({
          status: 'manual',
          source: 'manual',
          coords: { lat: loc.lat, lon: loc.lon },
          accuracy: null,
          area: loc.name,
          city: loc.city ?? loc.detail?.split(',')[0]?.trim() ?? s.city,
          countryCode: loc.countryCode ?? s.countryCode,
          updatedAt: Date.now(),
          error: null,
          recents: [recent, ...s.recents.filter((r) => r.name !== recent.name)].slice(0, 5),
        }));
        // Fill in city / country for places picked from the map rather than search.
        if (!loc.city || !loc.countryCode) void get().refreshArea(true);
      },

      setRadius: (radius) => set({ radius }),

      refreshArea: async (keepName = false) => {
        const at = get().coords;
        const info = await geocodingService.reverse(at);
        // Ignore the answer if the user moved on while it was loading.
        if (get().coords !== at) return;
        set((s) => ({
          area: keepName ? s.area : info.area,
          city: info.city || s.city,
          countryCode: info.countryCode ?? s.countryCode,
        }));
      },

      clearRecents: () => set({ recents: [] }),

      resetToDefault: () =>
        set({ status: 'idle', source: 'default', coords: { lat: d.lat, lon: d.lon }, accuracy: null, area: d.area, city: d.city, countryCode: d.countryCode, error: null }),
    }),
    {
      name: 'nearme-location',
      storage: idbStorage(),
      version: 1,
      // Privacy: a GPS fix is stored coarsened (~110 m) and no history of positions is kept.
      partialize: (s) => ({
        source: s.source,
        coords: s.source === 'gps' ? { lat: Math.round(s.coords.lat * 1000) / 1000, lon: Math.round(s.coords.lon * 1000) / 1000 } : s.coords,
        area: s.area,
        city: s.city,
        countryCode: s.countryCode,
        radius: s.radius,
        recents: s.recents,
        updatedAt: s.updatedAt,
      }),
      // A stored "default" location is only a copy of configuration: always take the current one.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LocationState>;
        if (!p.source || p.source === 'default') return { ...current, radius: p.radius ?? current.radius, recents: p.recents ?? [] };
        return { ...current, ...p };
      },
      onRehydrateStorage: () => (state) => {
        // Storage is asynchronous, so the store exists by the time this runs.
        useLocation.setState({ hydrated: true, status: state?.source === 'manual' ? 'manual' : 'idle' });
      },
    },
  ),
);

/** Re-acquire a live fix on startup only when permission was already granted: never prompt uninvited. */
export async function resumeLocation() {
  const state = useLocation.getState();
  if (state.source === 'manual' || !navigator.permissions?.query) return;
  try {
    const perm = await navigator.permissions.query({ name: 'geolocation' });
    if (perm.state === 'granted') void state.locate();
    else if (perm.state === 'denied' && state.source === 'gps') useLocation.setState({ status: 'denied' });
  } catch {
    /* Permissions API unsupported: wait for the user to tap "Use my location". */
  }
}
