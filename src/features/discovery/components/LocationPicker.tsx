import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Clock, LoaderCircle, LocateFixed, MapPin, Search, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Notice } from '@/components/common/states';
import { Chip } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/sheet';
import { useDebounced } from '@/hooks/useDebounced';
import { formatRadius } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { geocodingService } from '@/services/geocoding';
import { useLocation } from '@/store/location';
import { useUi } from '@/store/ui';

export const RADIUS_OPTIONS = [500, 1000, 2000, 5000, 10000];

/** Short description of where the app is currently looking, for headers. */
export function useLocationSummary() {
  const { status, source, area, city } = useLocation();
  const label = city && city !== area ? `${area}, ${city}` : area;
  const prefix = status === 'locating' ? 'Finding you…' : source === 'gps' ? 'Exploring around' : source === 'manual' ? 'Looking around' : 'Showing';
  return { label, prefix, status, source };
}

/** Header control that shows the current area and opens the location sheet. */
export function LocationSelector({ className, compact }: { className?: string; compact?: boolean }) {
  const { label, prefix, status, source } = useLocationSummary();
  const open = useUi((s) => s.setLocationPicker);
  return (
    <button type="button" onClick={() => open(true)} className={cn('group flex min-w-0 items-center gap-2.5 text-left', className)} aria-label={`Change location. Currently ${label}`}>
      <span className={cn('grid shrink-0 place-items-center rounded-full', compact ? 'size-9 bg-bg-2' : 'size-10 bg-brand-soft', source === 'gps' ? 'text-brand-ink' : 'text-ink-2')}>
        {status === 'locating' ? <LoaderCircle className="size-[18px] animate-spin" /> : source === 'gps' ? <LocateFixed className="size-[18px]" /> : <MapPin className="size-[18px]" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] leading-tight text-muted-2">{prefix}</span>
        <span className="flex items-center gap-1 text-[15px] font-semibold leading-snug text-ink">
          <span className="truncate">{label}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-2 transition-transform group-hover:translate-y-0.5" aria-hidden />
        </span>
      </span>
    </button>
  );
}

/** The location sheet: live position, manual search, recent areas and search radius. */
export function LocationPicker() {
  const open = useUi((s) => s.locationPicker);
  const setOpen = useUi((s) => s.setLocationPicker);
  const online = useUi((s) => s.online);
  const { status, source, error, recents, radius, coords, area, locate, setManual, setRadius, clearRecents } = useLocation();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 320);

  const results = useQuery({
    queryKey: ['geocode', debounced, Math.round(coords.lat * 10), Math.round(coords.lon * 10)],
    queryFn: ({ signal }) => geocodingService.search(debounced, coords, 7, signal),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const choose = (loc: { name: string; detail: string; lat: number; lon: number; city?: string; countryCode?: string }) => {
    setManual(loc);
    setQuery('');
    setOpen(false);
    toast.success(`Now showing ${loc.name}`);
  };

  const useMine = async () => {
    const ok = await locate();
    if (ok) {
      setOpen(false);
      toast.success('Using your current location');
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Where are you exploring?" description="Use your live location or pick any area." size="md">
      <div className="space-y-5">
        <button
          type="button"
          onClick={useMine}
          disabled={status === 'locating'}
          className={cn(
            'flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-colors',
            source === 'gps' && status === 'granted' ? 'border-brand/40 bg-brand-soft' : 'border-line-2 bg-surface hover:bg-surface-2',
          )}
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-on-forest">
            {status === 'locating' ? <LoaderCircle className="size-5 animate-spin" /> : <LocateFixed className="size-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">{status === 'locating' ? 'Finding your location…' : 'Use my current location'}</span>
            <span className="block text-[13px] text-muted-2">{source === 'gps' && status === 'granted' ? `Currently around ${area}` : 'Most accurate results for what is around you'}</span>
          </span>
        </button>

        {(status === 'denied' || status === 'unavailable') && error && (
          <Notice tone="warning" icon={MapPin}>
            {error}
            {status === 'denied' && <span className="mt-1 block text-muted-2">You can keep using NearMe by searching for an area below.</span>}
          </Notice>
        )}

        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search an area, street or landmark"
              aria-label="Search for a location"
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-line-2 bg-surface pl-11 pr-10 text-[15px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-3 focus:ring-brand/15"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear" className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-2 hover:bg-bg-2">
                <X className="size-4" />
              </button>
            )}
          </div>

          {debounced.trim().length >= 2 && (
            <div className="mt-2">
              {!online ? (
                <p className="px-1 py-3 text-sm text-muted-2">Location search needs a connection. Pick a recent area below.</p>
              ) : results.isPending ? (
                <div className="space-y-2 py-1">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : results.isError ? (
                <p className="px-1 py-3 text-sm text-danger">Location search is not responding. Please try again.</p>
              ) : results.data.length === 0 ? (
                <p className="px-1 py-3 text-sm text-muted-2">No places match “{debounced}”. Try a nearby landmark or the area name.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {results.data.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => choose({ name: r.name, detail: r.detail, lat: r.lat, lon: r.lon, city: r.city, countryCode: r.countryCode })} className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-bg-2">
                        <MapPin className="size-[18px] shrink-0 text-muted-2" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-ink">{r.name}</span>
                          <span className="block truncate text-[13px] text-muted-2">{[r.kind, r.detail].filter(Boolean).join(' · ')}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {!query && recents.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-ink-2">Recent areas</h3>
              <button type="button" onClick={clearRecents} className="text-[13px] text-muted-2 hover:text-ink">
                Clear
              </button>
            </div>
            <ul>
              {recents.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button type="button" onClick={() => choose(r)} className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-bg-2">
                    <Clock className="size-[18px] shrink-0 text-muted-2" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-ink">{r.name}</span>
                      {r.detail && <span className="block truncate text-[13px] text-muted-2">{r.detail}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-ink-2">Search radius</h3>
          <div className="flex flex-wrap gap-2">
            {RADIUS_OPTIONS.map((r) => (
              <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>
                {formatRadius(r)}
              </Chip>
            ))}
          </div>
        </div>

        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>
            Your location is used on this device to find what is nearby. It is never shown to other people and no location history is kept.{' '}
            <Link to="/settings/location" onClick={() => setOpen(false)} className="font-medium text-ink underline underline-offset-2">
              Location settings
            </Link>
          </span>
        </p>
      </div>
    </Sheet>
  );
}
