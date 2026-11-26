import { ArrowRight, Check, MapPinOff, Search, SearchX, Store, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { CATEGORY_BY_ID } from '@/data/categories';
import { useDebounced } from '@/hooks/useDebounced';
import { useNearbyPlaces } from '@/hooks/usePlaces';
import { distanceMeters, formatDistance } from '@/lib/geo';
import { parseOpeningHours } from '@/lib/openingHours';
import { useLocation } from '@/store/location';
import { useUi } from '@/store/ui';
import type { Place } from '@/types';
import { PortalPage } from '../components/bits';
import { useOptionalPortal } from '../context';
import { useClaimedPlaces, useClaimPlace, usePlaceNameSearch } from '../hooks';
import { usePortalUi } from '../store';

const NEARBY_RADIUS = 2000;
const SEARCH_RADIUS = 5000;
const OSM_ID = /^[nwr]\d+$/;

type Candidate = Place & { distance: number };

function ClaimSheet({ place, onClose }: { place: Candidate | null; onClose: () => void }) {
  const navigate = useNavigate();
  const claim = useClaimPlace();
  const selectListing = usePortalUi((s) => s.setActiveListing);

  const known = place
    ? [
        { label: 'Name', value: place.name },
        { label: 'Category', value: CATEGORY_BY_ID[place.categoryId]?.singular },
        { label: 'Position on the map', value: `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}` },
        { label: 'Address', value: place.address },
        { label: 'Phone', value: place.phone },
        { label: 'Website', value: place.website },
        { label: 'Opening hours', value: place.openingHours ? (parseOpeningHours(place.openingHours) ? 'Listed on the map' : undefined) : undefined },
      ]
    : [];

  const confirm = async () => {
    if (!place) return;
    try {
      const listing = await claim.mutateAsync(place);
      selectListing(listing.id);
      onClose();
      // The name comes from the map; the description is the first thing only the owner can supply.
      navigate(`/business/onboarding?listing=${listing.id}&step=${listing.onboardingStep ?? 2}`);
    } catch {
      /* the hook has already shown why */
    }
  };

  return (
    <Sheet
      open={Boolean(place)}
      onOpenChange={(open) => !open && onClose()}
      title={place ? `Claim ${place.name}?` : 'Claim this place'}
      description="We start a private draft from what the map already knows. Nothing changes for customers until you are verified."
      size="md"
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={claim.isPending}>
            Not mine
          </Button>
          <Button className="flex-1" onClick={() => void confirm()} loading={claim.isPending}>
            Yes, this is my business
          </Button>
        </div>
      }
    >
      <dl className="divide-y divide-line rounded-2xl border border-line">
        {known.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5 text-sm">
            <dt className="shrink-0 text-muted-2">{row.label}</dt>
            <dd className={row.value ? 'min-w-0 break-words text-right font-medium text-ink' : 'text-right text-muted'}>{row.value ?? 'You will add this'}</dd>
          </div>
        ))}
      </dl>
      {place?.detail === 'basic' && <p className="mt-3 text-[13px] text-muted-2">We will look up the full map record for this place when you continue, so more of this may be filled in for you.</p>}
      <p className="mt-3 text-[13px] leading-relaxed text-muted-2">
        By continuing you confirm that you own or manage this business. You will be asked for one proof document before the Verified badge is shown.
      </p>
    </Sheet>
  );
}

export default function ClaimPage() {
  const coords = useLocation((s) => s.coords);
  const area = useLocation((s) => s.area);
  const online = useUi((s) => s.online);
  const selectListing = usePortalUi((s) => s.setActiveListing);
  const portal = useOptionalPortal();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const typed = query.trim();
  const term = useDebounced(typed, 400);

  const nearby = useNearbyPlaces({ radius: NEARBY_RADIUS });
  const remote = usePlaceNameSearch(term, SEARCH_RADIUS);
  const claimed = useClaimedPlaces();
  const [picked, setPicked] = useState<Candidate | null>(null);

  // The wider name search only counts once it has caught up with what is typed.
  const remoteCurrent = typed.length >= 3 && term === typed;
  const remotePlaces = remoteCurrent ? remote.data : undefined;
  const searchingWider = typed.length >= 3 && online && (term !== typed || remote.isFetching);

  const results = useMemo(() => {
    const needle = typed.toLowerCase();
    const seen = new Set<string>();
    const out: Candidate[] = [];
    const consider = (p: Place, distance: number, filter: boolean) => {
      // Only real, named map places can be claimed; NearMe-only listings already belong to someone.
      if (seen.has(p.id) || !p.hasName || !OSM_ID.test(p.id)) return;
      if (filter && needle && !p.name.toLowerCase().includes(needle)) return;
      seen.add(p.id);
      out.push({ ...p, distance });
    };
    for (const p of nearby.places) consider(p, p.distance, true);
    for (const p of remotePlaces ?? []) consider(p, distanceMeters(coords, p), false);
    return out.sort((a, b) => a.distance - b.distance).slice(0, 40);
  }, [nearby.places, remotePlaces, typed, coords]);

  return (
    <PortalPage
      title="Claim your place"
      subtitle={`Find your business among the places already on the map around ${area}, and tell us it is yours.`}
      eyebrow="NearMe for business"
    >
      <div className="relative max-w-2xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by business name"
          aria-label="Search places by name"
          autoComplete="off"
          className="h-[52px] rounded-[14px] px-11 text-base"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-2 hover:bg-bg-2">
            <X className="size-[18px]" />
          </button>
        )}
      </div>
      <p className="mt-2 text-[13px] text-muted-2" aria-live="polite">
        {typed.length >= 3
          ? !online
            ? 'You are offline, so only places already loaded on this device are searched.'
            : searchingWider
              ? 'Searching a wider area…'
              : remote.isError
                ? `The wider search is not responding. Showing matches within ${NEARBY_RADIUS / 1000} km.`
                : `Matches within about ${SEARCH_RADIUS / 1000} km of ${area}.`
          : `Places within ${NEARBY_RADIUS / 1000} km of ${area}. Type at least 3 letters to search further out.`}
      </p>

      <div className="mt-5">
        {nearby.isLoading && results.length === 0 ? (
          <ul className="space-y-2.5" aria-busy="true" aria-label="Loading places">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3">
                <Skeleton className="size-11 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3.5 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : nearby.isError && results.length === 0 ? (
          <ErrorState error={nearby.error} onRetry={() => void nearby.refetch()} title="We could not load places around you" />
        ) : results.length === 0 ? (
          searchingWider ? (
            <p className="py-10 text-center text-sm text-muted-2">Looking for “{typed}”…</p>
          ) : (
            <EmptyState
              icon={typed ? SearchX : MapPinOff}
              title={typed ? `No place called “${typed}” nearby` : 'No named places mapped nearby'}
              description="If your business is not on the map yet, register it as a new listing instead. It takes about ten minutes."
              action={
                <Button asChild>
                  <Link to="/business/onboarding?new=1">
                    <Store /> Register a new business
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <ul className="space-y-2.5">
            {results.map((p) => {
              const cat = CATEGORY_BY_ID[p.categoryId];
              const owner = claimed.data?.[p.id];
              return (
                <li key={p.id} className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-bg-2 text-ink-2">
                    <Icon name={cat?.icon ?? 'MapPin'} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">{p.name}</p>
                    <p className="truncate text-[13px] text-muted-2">
                      {[cat?.singular, formatDistance(p.distance), p.address ?? p.locality].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {owner === 'mine' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // Land on the listing for this place, not whichever one was open last.
                        const mine = portal?.listings.find((l) => l.placeId === p.id);
                        if (mine) selectListing(mine.id);
                        navigate('/business');
                      }}
                    >
                      <Check /> You manage this
                    </Button>
                  ) : owner === 'other' ? (
                    <Badge tone="neutral" title="Another account has already claimed this place">
                      Already claimed
                    </Badge>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setPicked(p)} disabled={claimed.isPending}>
                      Claim <ArrowRight />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {results.length > 0 && (
        <Notice className="mt-6" action={<Link to="/business/onboarding?new=1" className="shrink-0 text-[13px] font-semibold text-brand-ink underline-offset-4 hover:underline">Register a new business</Link>}>
          Cannot find it? Places come from OpenStreetMap, and newer or home-based businesses are often missing.
        </Notice>
      )}

      <ClaimSheet place={picked} onClose={() => setPicked(null)} />
    </PortalPage>
  );
}
