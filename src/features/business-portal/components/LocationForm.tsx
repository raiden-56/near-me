import { zodResolver } from '@hookform/resolvers/zod';
import { LocateFixed, MapPin, MapPinOff, Search, X } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/field';
import { useDebounced } from '@/hooks/useDebounced';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { locationSchema, type LocationInput } from '@/services/businessPortal';
import { useLocation } from '@/store/location';
import { useUi } from '@/store/ui';
import type { BusinessListing, LatLon } from '@/types';
import { useAddressSearch } from '../hooks';
import type { MapLibreMap, Marker } from '../lib/maplibre';
import type { FormFooter } from './bits';

type MapLib = typeof import('../lib/maplibre');

/** Six decimals is about 10 cm: more than enough for a doorway, and it keeps stored values tidy. */
const tidy = (n: number) => Math.round(n * 1e6) / 1e6;

interface PinMapProps {
  value: LatLon | null;
  /** Where to look before a pin exists. */
  fallbackCenter: LatLon;
  onChange: (point: LatLon) => void;
  /** Bump to bring the pin into view (after a search pick or a GPS fix). */
  focus: number;
}

/**
 * A small MapLibre map with one draggable pin. The map is a convenience, not a requirement:
 * if the library, WebGL or the style fails to load, the form still works through search and GPS.
 */
function PinMap({ value, fallbackCenter, onChange, focus }: PinMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const markerRef = useRef<Marker | null>(null);
  const [instance, setInstance] = useState<{ map: MapLibreMap; lib: MapLib } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const reduce = useReducedMotion();

  // Latest props for the long-lived map callbacks.
  const latest = useRef({ value, onChange, fallbackCenter });
  latest.current = { value, onChange, fallbackCenter };

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    void (async () => {
      try {
        const lib = await import('../lib/maplibre');
        if (cancelled || !container.current) return;
        const start = latest.current.value ?? latest.current.fallbackCenter;
        let loaded = false;
        map = new lib.MapLibreMap({
          container: container.current,
          style: env.map.styleUrl,
          center: [start.lon, start.lat],
          zoom: latest.current.value ? 16 : 13,
          attributionControl: { compact: true },
          // The map sits inside a scrolling form: do not hijack the page scroll.
          cooperativeGestures: true,
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
        map.on('load', () => {
          loaded = true;
          if (!cancelled) setState('ready');
        });
        // Errors after the first render are single tiles failing, which the map survives.
        map.on('error', () => {
          if (!cancelled && !loaded) setState('failed');
        });
        map.on('click', (e) => latest.current.onChange({ lat: tidy(e.lngLat.lat), lon: tidy(e.lngLat.lng) }));
        setInstance({ map, lib });
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      setInstance(null);
    };
  }, []);

  // Keep the pin where the form says it is.
  const lat = value?.lat;
  const lon = value?.lon;
  useEffect(() => {
    if (!instance) return;
    if (lat == null || lon == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (markerRef.current) {
      markerRef.current.setLngLat([lon, lat]);
      return;
    }
    const marker = new instance.lib.Marker({ draggable: true, color: '#E97845' }).setLngLat([lon, lat]).addTo(instance.map);
    marker.on('dragend', () => {
      const p = marker.getLngLat();
      latest.current.onChange({ lat: tidy(p.lat), lon: tidy(p.lng) });
    });
    markerRef.current = marker;
  }, [instance, lat, lon]);

  useEffect(() => {
    const point = latest.current.value;
    if (!instance || !focus || !point) return;
    const camera = { center: [point.lon, point.lat] as [number, number], zoom: Math.max(instance.map.getZoom(), 16) };
    if (reduce) instance.map.jumpTo(camera);
    else instance.map.easeTo({ ...camera, duration: 700 });
  }, [instance, focus, reduce]);

  return (
    <div className="relative h-[300px] overflow-hidden rounded-2xl border border-line bg-bg-2 sm:h-[340px]">
      {/* Sized with width and height, not inset: MapLibre's stylesheet sets `position: relative` on its container. */}
      <div ref={container} className={cn('size-full', state === 'failed' && 'invisible')} role="group" aria-label="Map. Click it or drag the pin to set your business location." />
      {state === 'loading' && <div className="skeleton absolute inset-0 rounded-none" aria-hidden />}
      {state === 'failed' && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <MapPinOff className="mx-auto size-7 text-muted-2" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 text-sm font-medium text-ink">The map could not load</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted-2">You can still set your location by searching for the address or using your current location.</p>
          </div>
        </div>
      )}
      {state === 'ready' && !value && (
        <p className="pointer-events-none absolute inset-x-3 bottom-3 mx-auto w-fit rounded-lg bg-forest px-3 py-1.5 text-[13px] font-medium text-on-forest shadow-lift">Click the map to drop your pin</p>
      )}
    </div>
  );
}

interface LocationFormProps {
  listing: Pick<BusinessListing, 'lat' | 'lon'>;
  onSubmit: (values: LocationInput) => Promise<unknown>;
  footer: FormFooter;
}

/** Where the business is: search for an address, use the device's position, or place the pin by hand. */
export function LocationForm({ listing, onSubmit, footer }: LocationFormProps) {
  const here = useLocation((s) => s.coords);
  const online = useUi((s) => s.online);
  const form = useForm<LocationInput>({ resolver: zodResolver(locationSchema), defaultValues: { lat: listing.lat, lon: listing.lon, address: '' } });
  const { errors, isSubmitting, isDirty } = form.formState;
  const lat = useWatch({ control: form.control, name: 'lat' });
  const lon = useWatch({ control: form.control, name: 'lon' });
  const value: LatLon | null = lat === 0 && lon === 0 ? null : { lat, lon };

  const [query, setQuery] = useState('');
  const term = useDebounced(query, 350);
  const search = useAddressSearch(term, value ?? here);
  const [focus, setFocus] = useState(0);
  const [locating, setLocating] = useState(false);
  const showResults = query.trim().length >= 3;

  const setPoint = (point: LatLon, options: { address?: string; reveal?: boolean } = {}) => {
    form.setValue('lat', tidy(point.lat), { shouldDirty: true, shouldValidate: true });
    form.setValue('lon', tidy(point.lon), { shouldDirty: true, shouldValidate: true });
    if (options.address) form.setValue('address', options.address.slice(0, 200));
    if (options.reveal) setFocus((n) => n + 1);
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    const ok = await useLocation.getState().locate();
    setLocating(false);
    if (!ok) {
      toast.error(useLocation.getState().error ?? 'Your location is unavailable right now.');
      return;
    }
    setPoint(useLocation.getState().coords, { reveal: true });
    toast.success('Pin moved to your current location', { description: 'Drag it to your entrance if it is slightly off.' });
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      form.reset({ ...values, address: '' });
    } catch {
      /* reported by the caller */
    }
  });

  return (
    <form onSubmit={submit} noValidate className="@container">
      <Label htmlFor="location-search">Find your address</Label>
      {/* Side by side only when the form itself is wide enough, wherever it is placed. */}
      <div className="flex flex-col gap-2.5 @lg:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            id="location-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Street, landmark or area"
            autoComplete="off"
            className="px-10"
            aria-describedby="location-search-status"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-2 hover:bg-bg-2">
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="button" variant="secondary" onClick={useCurrentLocation} loading={locating}>
          {!locating && <LocateFixed />} Use my current location
        </Button>
      </div>

      <div id="location-search-status" aria-live="polite">
        {showResults && (
          <div className="mt-2 overflow-hidden rounded-xl border border-line bg-surface">
            {!online ? (
              <p className="px-3.5 py-3 text-sm text-muted-2">Address search needs a connection. You can still place the pin on the map.</p>
            ) : search.isPending || term !== query ? (
              <p className="px-3.5 py-3 text-sm text-muted-2">Searching…</p>
            ) : search.isError ? (
              <p className="px-3.5 py-3 text-sm text-muted-2">Address search is not responding. Place the pin on the map instead.</p>
            ) : !search.data?.length ? (
              <p className="px-3.5 py-3 text-sm text-muted-2">No address matches “{query.trim()}”. Try a nearby landmark.</p>
            ) : (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto">
                {search.data.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPoint(r, { address: [r.name, r.detail].filter(Boolean).join(', '), reveal: true });
                        setQuery('');
                      }}
                      className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-bg-2"
                    >
                      <MapPin className="mt-0.5 size-4 shrink-0 text-muted-2" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-medium text-ink">{r.name}</span>
                        {r.detail && <span className="block truncate text-[13px] text-muted-2">{r.detail}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        <PinMap value={value} fallbackCenter={here} onChange={(p) => setPoint(p)} focus={focus} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
        {value ? (
          <p className="text-muted-2">
            Pin at <span className="tabular font-medium text-ink">{value.lat.toFixed(5)}, {value.lon.toFixed(5)}</span>. Drag it, or click the map, to adjust.
          </p>
        ) : (
          <p className="text-muted-2">No pin yet. Search, use your location, or click the map.</p>
        )}
      </div>
      <FieldError>{errors.lat?.message ?? errors.lon?.message}</FieldError>

      {footer({ submitting: isSubmitting, dirty: isDirty, reset: () => form.reset() })}
    </form>
  );
}
