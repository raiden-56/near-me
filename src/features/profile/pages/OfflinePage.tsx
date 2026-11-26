import { useQuery } from '@tanstack/react-query';
import { Bookmark, CloudOff, History, RefreshCw, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Page, SectionHeader } from '@/components/common/layout-bits';
import { EmptyState, Notice } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { CompactPlaceCard } from '@/features/businesses/components/PlaceCards';
import { useRecentlyViewed } from '@/hooks/usePlaces';
import { useSavedPlaces } from '@/hooks/useSaved';
import { distanceMeters } from '@/lib/geo';
import { timeAgo } from '@/lib/time';
import { outbox } from '@/services/outbox';
import { placesService } from '@/services/places';
import { useLocation } from '@/store/location';
import { useUi } from '@/store/ui';

/** What NearMe can still do without a connection: everything already on the device, clearly dated. */
export default function OfflinePage() {
  const online = useUi((s) => s.online);
  const here = useLocation((s) => s.coords);
  const saved = useSavedPlaces();
  const recent = useRecentlyViewed(8);
  const lastArea = useQuery({ queryKey: ['last-known-area'], queryFn: () => placesService.lastKnownArea(), staleTime: 0 });
  const [queued, setQueued] = useState(0);
  useEffect(() => outbox.subscribe(setQueued), []);

  const withDistance = <T extends { lat: number; lon: number }>(p: T) => ({ ...p, distance: distanceMeters(here, p) });
  const savedPlaces = (saved.data ?? []).map((s) => withDistance(s.place));
  const recentPlaces = (recent.data ?? []).map(withDistance);
  const nothing = !savedPlaces.length && !recentPlaces.length && !lastArea.data;

  return (
    <Page className="max-w-[900px]">
      <header className="flex flex-col items-start gap-4 pb-8 pt-8 sm:flex-row sm:items-center lg:pt-12">
        <span className={`grid size-16 shrink-0 place-items-center rounded-[22px] ${online ? 'bg-success-soft text-success' : 'bg-forest text-on-forest'}`}>{online ? <Wifi className="size-8" strokeWidth={1.5} /> : <CloudOff className="size-8" strokeWidth={1.5} />}</span>
        <div className="flex-1">
          <h1 className="display text-[32px] text-ink sm:text-[38px]">{online ? 'You are back online' : 'You are offline'}</h1>
          <p className="mt-1 max-w-xl text-[15px] text-muted-2">{online ? 'Live data is available again.' : 'NearMe still opens. Here is everything kept on this device. Live updates, search and directions return when you reconnect.'}</p>
        </div>
        {online ? (
          <Button asChild>
            <Link to="/">Go to Discover</Link>
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => window.location.reload()}>
            <RefreshCw /> Try again
          </Button>
        )}
      </header>

      {queued > 0 && (
        <Notice tone="warning" className="mb-6">
          {queued} action{queued > 1 ? 's are' : ' is'} waiting to be sent. {queued > 1 ? 'They' : 'It'} will go out automatically when the connection returns.
        </Notice>
      )}

      {nothing && !saved.isPending ? (
        <EmptyState icon={CloudOff} title="Nothing stored yet" description="Places you save or open while online are kept here for next time." />
      ) : (
        <div className="space-y-10">
          {savedPlaces.length > 0 && (
            <section>
              <SectionHeader title="Saved places" subtitle="Always available offline" href="/saved" />
              <div className="grid gap-3 md:grid-cols-2">
                {savedPlaces.slice(0, 8).map((p) => (
                  <CompactPlaceCard key={p.id} place={p} />
                ))}
              </div>
            </section>
          )}

          {recentPlaces.length > 0 && (
            <section>
              <SectionHeader title="Recently viewed" subtitle="Details as they were when you last opened them" />
              <div className="grid gap-3 md:grid-cols-2">
                {recentPlaces.map((p) => (
                  <CompactPlaceCard key={p.id} place={p} showSave={false} />
                ))}
              </div>
            </section>
          )}

          {lastArea.data && (
            <section>
              <SectionHeader title="Last area you browsed" subtitle={`${lastArea.data.places.length.toLocaleString('en-IN')} places, saved ${timeAgo(lastArea.data.fetchedAt)}`} />
              <Notice icon={History}>
                Opening hours and anything “live” may have changed since then. Open the{' '}
                <Link to="/" className="font-medium text-ink underline underline-offset-2">
                  home screen
                </Link>{' '}
                or the{' '}
                <Link to="/map" className="font-medium text-ink underline underline-offset-2">
                  map
                </Link>{' '}
                to browse this stored copy.
              </Notice>
            </section>
          )}

          {!savedPlaces.length && (
            <Notice icon={Bookmark}>Tip: save the places you rely on (your pharmacy, hospital, mechanic) so they are one tap away even without signal.</Notice>
          )}
        </div>
      )}
    </Page>
  );
}
