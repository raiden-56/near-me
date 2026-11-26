import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bike, Car, ExternalLink, Footprints, LoaderCircle, LocateFixed, Minus, Navigation, Plus, Radio, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PlaceImage } from '@/components/common/PlaceImage';
import { OpenStatusLabel, PriceLevel, RatingInline, SaveButton, VerifiedBadge } from '@/components/common/place-bits';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { categoryLabel } from '@/features/businesses/components/PlaceCards';
import { LiveUpdateCard } from '@/features/community/components/LiveUpdateCard';
import { usePlaceStats, useVerifiedListing } from '@/hooks/usePlaces';
import { formatDistance, formatDuration, mapsDirectionsUrl } from '@/lib/geo';
import { describeError } from '@/lib/http';
import { cn } from '@/lib/utils';
import { routingService } from '@/services/routing';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import type { LatLon, Place, ReportView, RouteResult, TravelMode } from '@/types';

/** Zoom, locate and live-layer buttons that float over the map. */
export function MapControls({ onZoom, onLocate, locating, live, onToggleLive, className }: { onZoom: (delta: number) => void; onLocate: () => void; locating: boolean; live: boolean; onToggleLive: () => void; className?: string }) {
  const btn = 'grid size-11 place-items-center text-ink transition-colors hover:bg-surface-2 active:bg-bg-2';
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <button
        type="button"
        onClick={onToggleLive}
        aria-pressed={live}
        aria-label={live ? 'Hide live updates on the map' : 'Show live updates on the map'}
        title="Live updates"
        className={cn('grid size-11 place-items-center rounded-xl border shadow-lift transition-colors', live ? 'border-forest bg-forest text-on-forest' : 'border-line bg-surface text-ink hover:bg-surface-2')}
      >
        <Radio className="size-5" />
      </button>
      <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lift">
        <button type="button" onClick={() => onZoom(1)} aria-label="Zoom in" className={btn}>
          <Plus className="size-5" />
        </button>
        <span className="h-px bg-line" />
        <button type="button" onClick={() => onZoom(-1)} aria-label="Zoom out" className={btn}>
          <Minus className="size-5" />
        </button>
      </div>
      <button type="button" onClick={onLocate} aria-label="Go to my location" title="My location" className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink shadow-lift transition-colors hover:bg-surface-2">
        {locating ? <LoaderCircle className="size-5 animate-spin" /> : <LocateFixed className="size-5" />}
      </button>
    </div>
  );
}

/** Card for the selected marker: enough to decide, with one tap to go or to open the full page. */
export function PlacePreview({ place, report, onClose, onDirections, className }: { place: Place & { distance?: number }; report?: ReportView; onClose: () => void; onDirections: () => void; className?: string }) {
  const stats = usePlaceStats(place);
  const verified = useVerifiedListing(place.id);
  return (
    <motion.div
      key={place.id}
      initial={{ y: 28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 28, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.5 }}
      onDragEnd={(_, info) => info.offset.y > 70 && onClose()}
      className={cn('rounded-[22px] border border-line bg-surface p-3 shadow-float', className)}
    >
      <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line-2 lg:hidden" aria-hidden />
      <div className="flex gap-3.5">
        <Link to={`/place/${place.id}`} className="shrink-0">
          <PlaceImage place={place} className="size-[92px] rounded-2xl" iconClassName="size-7" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <Link to={`/place/${place.id}`} className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-[16px] font-semibold leading-snug text-ink">{place.name}</h2>
            </Link>
            <button type="button" onClick={onClose} aria-label="Close preview" className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-2 hover:bg-bg-2">
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-2">
            {categoryLabel(place)}
            {place.distance != null && <> · {formatDistance(place.distance)}</>}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <RatingInline stats={stats} />
            <OpenStatusLabel place={place} detail={false} />
            <PriceLevel level={stats.priceLevel} />
            {verified && <VerifiedBadge />}
          </div>
        </div>
      </div>

      {report && <LiveUpdateCard report={report} variant="compact" showPlace={false} className="mt-3 border-0 bg-bg-2 p-2.5" />}

      <div className="mt-3 flex gap-2">
        <Button variant="brand" className="flex-1" onClick={onDirections}>
          <Navigation /> Directions
        </Button>
        <SaveButton place={place} variant="button" className="px-3.5" />
        <Button variant="secondary" asChild className="px-3.5">
          <Link to={`/place/${place.id}`} aria-label={`Open ${place.name}`}>
            Details <ArrowRight />
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}

const MODES: { value: TravelMode; label: string; icon: React.ReactNode; google: 'driving' | 'bicycling' | 'walking' }[] = [
  { value: 'car', label: 'Drive', icon: <Car />, google: 'driving' },
  // The router's "bike" profile is a bicycle. Motorbikes and scooters follow the driving route.
  { value: 'bike', label: 'Cycle', icon: <Bike />, google: 'bicycling' },
  { value: 'foot', label: 'Walk', icon: <Footprints />, google: 'walking' },
];

export function useRoute(from: LatLon, to: Place | null, mode: TravelMode) {
  return useQuery<RouteResult>({
    queryKey: ['route', mode, from.lat.toFixed(4), from.lon.toFixed(4), to?.id],
    queryFn: ({ signal }) => routingService.route(from, to!, mode, signal),
    enabled: Boolean(to),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** Route summary with a mode switch, the first turns, and a hand-off to turn-by-turn navigation. */
export function RoutePanel({ to, route, onClose, className }: { to: Place; route: ReturnType<typeof useRoute>; onClose: () => void; className?: string }) {
  const here = useLocation((s) => s.coords);
  const source = useLocation((s) => s.source);
  const mode = useSettings((s) => s.travelMode);
  const set = useSettings((s) => s.set);
  const [steps, setSteps] = useState(false);
  const google = MODES.find((m) => m.value === mode)!.google;

  return (
    <motion.div initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={{ duration: 0.22 }} className={cn('rounded-[22px] border border-line bg-surface p-3.5 shadow-float', className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-muted-2">Directions to</p>
          <h2 className="line-clamp-1 text-[16px] font-semibold text-ink">{to.name}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close directions" className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-2 hover:bg-bg-2">
          <X className="size-[18px]" />
        </button>
      </div>

      <Segmented<TravelMode> aria-label="Travel mode" className="mt-3 flex w-full" size="sm" value={mode} onChange={(v) => set({ travelMode: v })} options={MODES.map((m) => ({ value: m.value, label: m.label, icon: m.icon }))} />

      <div className="mt-3 min-h-[44px]">
        {route.isPending ? (
          <p className="flex items-center gap-2 py-2 text-sm text-muted-2">
            <LoaderCircle className="size-4 animate-spin" /> Finding the best route…
          </p>
        ) : route.isError ? (
          <p className="py-1 text-[13px] text-danger">{describeError(route.error)} You can still open the route in Google Maps.</p>
        ) : (
          <>
            <p className="tabular flex items-baseline gap-2">
              <span className="display text-[28px] text-ink">{formatDuration(route.data.duration)}</span>
              <span className="text-sm text-muted-2">{formatDistance(route.data.distance)}</span>
            </p>
            {source !== 'gps' && <p className="text-[12.5px] text-muted-2">From the area you selected, not your live position.</p>}
            {steps && (
              <ol className="mt-2.5 max-h-44 space-y-2 overflow-y-auto border-t border-line pt-2.5 text-[13px]">
                {route.data.steps.slice(0, 14).map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="tabular w-4 shrink-0 text-muted">{i + 1}</span>
                    <span className="flex-1 text-ink-2">{s.instruction}</span>
                    {s.distance > 0 && <span className="tabular shrink-0 text-muted-2">{formatDistance(s.distance)}</span>}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button asChild variant="primary" className="flex-1">
          <a href={mapsDirectionsUrl(to, source === 'gps' ? here : null, google)} target="_blank" rel="noreferrer">
            Start navigation <ExternalLink />
          </a>
        </Button>
        {route.data && (
          <Button variant="secondary" onClick={() => setSteps((s) => !s)} aria-expanded={steps}>
            {steps ? 'Hide steps' : 'Steps'}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
