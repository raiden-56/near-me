import { Navigation, Phone, ShieldAlert, Siren } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { OpenStatusLabel } from '@/components/common/place-bits';
import { ErrorState, Notice } from '@/components/common/states';
import { Skeleton } from '@/components/ui/controls';
import { useEnrichPlaces, useNearbyPlaces } from '@/hooks/usePlaces';
import { formatDistance, formatRadius, mapsDirectionsUrl } from '@/lib/geo';
import { isOpenNow } from '@/lib/openingHours';
import { cn } from '@/lib/utils';
import { analyticsService } from '@/services/analytics';
import { useLocation } from '@/store/location';
import type { PlaceWithDistance } from '@/types';

/** National emergency numbers. Shown first: a phone call is faster and more reliable than any listing. */
const NUMBERS: Record<string, { number: string; label: string; primary?: boolean }[]> = {
  in: [
    { number: '112', label: 'All emergencies', primary: true },
    { number: '108', label: 'Ambulance' },
    { number: '100', label: 'Police' },
    { number: '101', label: 'Fire' },
    { number: '1091', label: 'Women helpline' },
    { number: '1098', label: 'Child helpline' },
  ],
  us: [{ number: '911', label: 'All emergencies', primary: true }, { number: '988', label: 'Crisis lifeline' }],
  ca: [{ number: '911', label: 'All emergencies', primary: true }],
  gb: [{ number: '999', label: 'All emergencies', primary: true }, { number: '111', label: 'Non-urgent medical' }],
  au: [{ number: '000', label: 'All emergencies', primary: true }],
  default: [{ number: '112', label: 'Emergency (most countries)', primary: true }],
};

const SECTIONS: { id: string; title: string; hint: string; icon: string; categoryIds: string[]; tone: string; prefer?: (p: PlaceWithDistance) => number }[] = [
  { id: 'hospitals', title: 'Hospitals', hint: 'Emergency departments listed first', icon: 'Hospital', categoryIds: ['emergency-care', 'hospitals'], tone: 'bg-danger-soft text-danger', prefer: (p) => (p.tags.emergency === 'yes' || p.categoryIds.includes('emergency-care') ? 0 : 1) },
  { id: 'pharmacies', title: 'Pharmacies', hint: 'Open ones first', icon: 'Pill', categoryIds: ['medical-stores'], tone: 'bg-success-soft text-success', prefer: (p) => (isOpenNow(p.openingHours) === true ? 0 : isOpenNow(p.openingHours) === false ? 2 : 1) },
  { id: 'clinics', title: 'Emergency clinics', hint: 'Clinics and doctors nearby', icon: 'Stethoscope', categoryIds: ['clinics'], tone: 'bg-clay text-clay-ink', prefer: (p) => (isOpenNow(p.openingHours) === false ? 1 : 0) },
  { id: 'police', title: 'Police stations', hint: '', icon: 'Shield', categoryIds: ['police'], tone: 'bg-bg-2 text-ink' },
  { id: 'fire', title: 'Fire stations', hint: '', icon: 'Flame', categoryIds: ['fire-stations'], tone: 'bg-brand-soft text-brand-ink' },
  { id: 'fuel', title: 'Petrol pumps', hint: 'If you are running low', icon: 'Fuel', categoryIds: ['petrol-pumps'], tone: 'bg-butter-soft text-butter-ink' },
  { id: 'roadside', title: 'Roadside assistance', hint: 'Mechanics and puncture repair', icon: 'Wrench', categoryIds: ['bike-repair', 'car-repair', 'mechanics'], tone: 'bg-sage text-sage-ink', prefer: (p) => (isOpenNow(p.openingHours) === false ? 1 : 0) },
];

const ALL_CATEGORY_IDS = [...new Set(SECTIONS.flatMap((s) => s.categoryIds))];
const RADIUS = 5000;
const PER_SECTION = 4;

function EmergencyRow({ place, from }: { place: PlaceWithDistance; from: { lat: number; lon: number } | null }) {
  const tel = place.phone?.replace(/[^\d+]/g, '');
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link to={`/place/${place.id}`} className="min-w-0 flex-1">
        <p className="line-clamp-1 text-[15px] font-semibold text-ink">{place.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-2">
          <span className="tabular font-medium text-ink-2">{formatDistance(place.distance)}</span>
          <OpenStatusLabel place={place} detail={false} />
          {place.tags.emergency === 'yes' && <span className="font-medium text-danger">Emergency dept.</span>}
        </p>
        {place.phone && <p className="tabular mt-0.5 text-[13px] text-ink-2">{place.phone}</p>}
      </Link>
      {tel ? (
        <a href={`tel:${tel}`} onClick={() => analyticsService.track(place.id, 'call')} aria-label={`Call ${place.name}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-success-soft text-success transition-transform active:scale-95">
          <Phone className="size-5" />
        </a>
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-bg-2 text-line-2" title="No phone number listed" aria-label="No phone number listed">
          <Phone className="size-5" />
        </span>
      )}
      <a
        href={mapsDirectionsUrl(place, from)}
        target="_blank"
        rel="noreferrer"
        onClick={() => analyticsService.track(place.id, 'direction')}
        aria-label={`Directions to ${place.name}`}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-on-forest transition-transform active:scale-95"
      >
        <Navigation className="size-5" />
      </a>
    </li>
  );
}

export default function EmergencyPage() {
  const { coords, countryCode, area, source } = useLocation();
  const numbers = NUMBERS[countryCode] ?? NUMBERS.default!;
  const primary = numbers.find((n) => n.primary) ?? numbers[0]!;
  const nearby = useNearbyPlaces({ radius: RADIUS, categoryIds: ALL_CATEGORY_IDS });

  // Proximity first, then relevance (an emergency department, an open pharmacy) among the closest few.
  const sections = useMemo(
    () =>
      SECTIONS.map((s) => {
        const pool = nearby.places.filter((p) => p.categoryIds.some((id) => s.categoryIds.includes(id)) && (p.hasName || s.id === 'fuel')).slice(0, 10);
        const ranked = s.prefer ? [...pool].sort((a, b) => s.prefer!(a) - s.prefer!(b) || a.distance - b.distance) : pool;
        return { ...s, places: ranked.slice(0, PER_SECTION) };
      }),
    [nearby.places],
  );
  // Fetch phone numbers and hours for exactly the places on screen.
  const shown = useMemo(() => sections.flatMap((s) => s.places), [sections]);
  useEnrichPlaces(shown, 40, !nearby.isLoading);

  return (
    <Page>
      <PageHeader back={false} eyebrow="Emergency and essentials" title="Help close to you" subtitle={`Closest services around ${area}, nearest first. Call first if someone is in danger.`} />

      {/* National numbers */}
      <section aria-label="Emergency numbers" className="rounded-3xl bg-danger p-5 text-white sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex flex-1 items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15">
              <Siren className="size-7" />
            </span>
            <div>
              <p className="text-sm opacity-85">In an emergency, call</p>
              <a href={`tel:${primary.number}`} className="display tabular block text-[44px] leading-none hover:underline">
                {primary.number}
              </a>
              <p className="mt-1 text-[13px] opacity-85">{primary.label}</p>
            </div>
          </div>
          {numbers.length > 1 && (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-[460px]">
              {numbers
                .filter((n) => n !== primary)
                .map((n) => (
                  <li key={n.number}>
                    <a href={`tel:${n.number}`} className="flex items-center gap-2.5 rounded-xl bg-white/12 px-3 py-2.5 transition-colors hover:bg-white/20">
                      <Phone className="size-4 shrink-0 opacity-80" aria-hidden />
                      <span className="min-w-0">
                        <span className="tabular block text-[17px] font-semibold leading-tight">{n.number}</span>
                        <span className="block truncate text-[12px] opacity-85">{n.label}</span>
                      </span>
                    </a>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      <Notice icon={ShieldAlert} className="mt-4">
        Listings come from OpenStreetMap and can be out of date. Phone numbers and hours are shown only where they are recorded. This page never uses community reports as its source.
        {source !== 'gps' && <span className="mt-1 block font-medium text-ink">Distances are from {area}, not your live position. Turn on location for accurate results.</span>}
      </Notice>

      {nearby.isError ? (
        <ErrorState error={nearby.error} onRetry={() => void nearby.refetch()} title="Nearby services could not load" />
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={`em-${s.id}`} className="card overflow-hidden">
              <header className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', s.tone)}>
                  <Icon name={s.icon} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={`em-${s.id}`} className="text-[16px] font-semibold text-ink">
                    {s.title}
                  </h2>
                  {s.hint && <p className="text-[12.5px] text-muted-2">{s.hint}</p>}
                </div>
                <Link to={`/map?cat=${s.categoryIds[s.categoryIds.length - 1]}`} className="shrink-0 text-[13px] font-medium text-brand-ink hover:underline">
                  Map
                </Link>
              </header>
              {nearby.isLoading ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : s.places.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-2">None mapped within {formatRadius(RADIUS)}. Call {primary.number} if you need urgent help.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {s.places.map((p) => (
                    <EmergencyRow key={p.id} place={p} from={source === 'gps' ? coords : null} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
