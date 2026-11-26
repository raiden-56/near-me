import { Bell, MapPinOff, Plus, Radio, RefreshCw } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { Page, Reveal, ScrollRow, SectionHeader } from '@/components/common/layout-bits';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { Avatar, Skeleton } from '@/components/ui/controls';
import { Button } from '@/components/ui/button';
import { CATEGORIES, HOME_CATEGORY_IDS } from '@/data/categories';
import {
  CompactPlaceCard, EssentialCard, FeaturedPlaceCard, PlaceCard, PlaceCardSkeleton, PortraitPlaceCard, RankedPlaceRow,
} from '@/features/businesses/components/PlaceCards';
import { LiveUpdateCard } from '@/features/community/components/LiveUpdateCard';
import { DealCard } from '@/features/deals/components/DealCard';
import { useDeals, useLiveFeed } from '@/hooks/useCommunity';
import { useEnrichPlaces, useNearbyPlaces, useRecentlyViewed, useStatsGetter } from '@/hooks/usePlaces';
import { formatRadius } from '@/lib/geo';
import { greeting, timeAgo } from '@/lib/time';
import { useLocalDb } from '@/services/backend/localDb';
import { notificationsService } from '@/services/notifications';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { CategoryGrid, LocationPrimer, QuickActions, RowEndLink, SmartSearchBar } from '../components/DiscoverBits';
import { LocationSelector } from '../components/LocationPicker';
import { buildSections, weekendHeading } from '../lib/sections';

const DISCOVER_RADIUS = 2000;

/** Phone header: where you are, notifications and your avatar. Desktop uses the top bar instead. */
function NearMeHeader() {
  const user = useAuth((s) => s.user);
  const unread = useLocalDb((s) => s.notifications.filter((n) => !n.read).length);
  return (
    <div className="flex items-center gap-3 pt-3 lg:hidden">
      <LocationSelector className="flex-1" />
      <Link to="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2">
        <Bell className="size-[19px]" strokeWidth={1.75} />
        {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-brand ring-2 ring-surface" />}
      </Link>
      <Link to={user ? '/profile' : '/login'} aria-label={user ? 'Your profile' : 'Sign in'} className="shrink-0">
        {user ? <Avatar name={user.name} hue={user.avatarHue} size={40} /> : <span className="grid size-10 place-items-center rounded-full bg-forest text-[13px] font-semibold text-on-forest">Hi</span>}
      </Link>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex gap-3.5 overflow-hidden">
      {[0, 1, 2, 3, 4].map((i) => (
        <PlaceCardSkeleton key={i} className="shrink-0" />
      ))}
    </div>
  );
}

export default function DiscoverPage() {
  const user = useAuth((s) => s.user);
  const area = useLocation((s) => s.area);
  const sample = useSettings((s) => s.sampleData);
  const prefs = useSettings((s) => s.notifications);
  const openReport = useUi((s) => s.openReport);
  const online = useUi((s) => s.online);

  const nearby = useNearbyPlaces({ radius: DISCOVER_RADIUS });
  const { places } = nearby;
  // Upgrade the closest places to full details so "Open right now" has real opening hours.
  useEnrichPlaces(places, 45, !nearby.isLoading && !nearby.hasRichData && !nearby.isEnriching);

  const stats = useStatsGetter();
  const sections = useMemo(() => buildSections(places, stats, sample), [places, stats, sample]);
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of places) for (const id of p.categoryIds) out[id] = (out[id] ?? 0) + 1;
    return out;
  }, [places]);

  const live = useLiveFeed();
  const { deals, toggleSave } = useDeals();
  const recent = useRecentlyViewed(8);

  useEffect(() => {
    if (sample && places.length) void notificationsService.seedSamples(places, prefs);
  }, [sample, places, prefs]);

  // Admins can choose which categories lead the home screen and switch categories off.
  const featured = useLocalDb((s) => s.config.featuredCategoryIds);
  const disabled = useLocalDb((s) => s.config.disabledCategoryIds);
  const homeCategories = useMemo(
    () => (featured.length ? featured : [...HOME_CATEGORY_IDS]).filter((id) => CATEGORIES.some((c) => c.id === id) && !disabled.includes(id)).slice(0, 8),
    [featured, disabled],
  );

  const firstName = user?.name.split(' ')[0];
  const [hero, ...popularRest] = sections.popular;
  const weekend = weekendHeading();
  const liveTeaser = live.reports.filter((r) => r.freshness !== 'expired').slice(0, 3);

  return (
    <Page>
      <NearMeHeader />

      {/* Greeting and search */}
      <section className="pb-6 pt-6 lg:pt-10">
        <p className="text-[15px] text-muted-2">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </p>
        <h1 className="display mt-1 max-w-3xl text-[34px] text-ink sm:text-[44px] lg:text-[52px]">
          Everything around <span className="text-brand">{area}</span>
        </h1>
        <div className="mt-5 max-w-2xl lg:hidden">
          <SmartSearchBar />
        </div>
      </section>

      <div className="space-y-10 lg:space-y-14">
        <LocationPrimer />

        <QuickActions />

        <section aria-labelledby="cat-heading">
          <SectionHeader title="Browse by category" href="/categories" linkLabel={`All ${CATEGORIES.length - 2} categories`} />
          <h2 id="cat-heading" className="sr-only">
            Categories
          </h2>
          <CategoryGrid ids={homeCategories} counts={places.length ? counts : undefined} />
        </section>

        {nearby.isError ? (
          <ErrorState error={nearby.error} onRetry={() => void nearby.refetch()} title="We could not load places around you" />
        ) : nearby.isLoading ? (
          <section aria-busy="true" aria-label="Loading places">
            <Skeleton className="mb-4 h-7 w-56" />
            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
              <Skeleton className="h-[300px] rounded-3xl sm:h-[360px]" />
              <div className="hidden flex-col gap-3 lg:flex">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-[104px] rounded-2xl" />
                ))}
              </div>
            </div>
            <Skeleton className="mb-4 mt-10 h-7 w-44" />
            <RowSkeleton />
          </section>
        ) : places.length === 0 ? (
          <EmptyState
            icon={MapPinOff}
            title={`Nothing mapped within ${formatRadius(DISCOVER_RADIUS)} yet`}
            description="This area has few places on OpenStreetMap. Try another area, or help by adding one."
            action={
              <>
                <Button onClick={() => useUi.getState().setLocationPicker(true)}>Choose another area</Button>
                <Button variant="secondary" asChild>
                  <Link to="/contribute">Add a place</Link>
                </Button>
              </>
            }
          />
        ) : (
          <>
            {nearby.fromCache && !online && (
              <Notice icon={RefreshCw}>Showing places saved on this device, last updated {timeAgo(nearby.fetchedAt)}. Opening hours and live updates may be out of date.</Notice>
            )}

            {/* Popular: editorial hero with a supporting list */}
            {hero && (
              <Reveal>
                <section>
                  <SectionHeader title="Popular around you" subtitle={`${places.length.toLocaleString('en-IN')} places within ${formatRadius(DISCOVER_RADIUS)}`} href="/search?sort=rating" />
                  <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                    <FeaturedPlaceCard place={hero} kicker={sample ? 'Most loved nearby' : 'Notable nearby'} eager />
                    <div className="hidden flex-col gap-3 lg:flex">
                      {popularRest.slice(0, 3).map((p) => (
                        <CompactPlaceCard key={p.id} place={p} className="flex-1 items-center" />
                      ))}
                    </div>
                  </div>
                  <ScrollRow className="mt-4 lg:hidden" label="More popular places">
                    {popularRest.map((p) => (
                      <PlaceCard key={p.id} place={p} />
                    ))}
                  </ScrollRow>
                </section>
              </Reveal>
            )}

            {/* NearMe Live teaser */}
            <Reveal>
              <section className="rounded-[28px] bg-sage/55 p-4 sm:p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-sage-ink">
                      <Radio className="size-4" aria-hidden /> NearMe Live
                    </p>
                    <h2 className="display-sm mt-1 text-[22px] text-ink sm:text-2xl">Happening around you now</h2>
                  </div>
                  <Button size="sm" variant="primary" onClick={() => openReport()} className="shrink-0">
                    <Plus /> Share update
                  </Button>
                </div>
                {live.isLoading ? (
                  <div className="grid gap-3 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-[92px] rounded-2xl" />
                    ))}
                  </div>
                ) : liveTeaser.length ? (
                  <div className="grid gap-3 lg:grid-cols-3">
                    {liveTeaser.map((r) => (
                      <LiveUpdateCard key={r.id} report={r} variant="compact" />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl bg-surface/70 px-4 py-5 text-sm text-ink-2">No live updates nearby right now. Seen a queue, a closure or a free parking spot? Be the first to share it.</p>
                )}
                <Link to="/live" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-sage-ink hover:underline">
                  Open the live feed
                </Link>
              </section>
            </Reveal>

            {/* Open right now */}
            <Reveal>
              <section>
                <SectionHeader title="Open right now" subtitle="Based on listed opening hours" href="/search?open=1" />
                {sections.openNow.length ? (
                  <ScrollRow label="Open right now">
                    {sections.openNow.map((p) => (
                      <PlaceCard key={p.id} place={p} />
                    ))}
                    <RowEndLink to="/search?open=1" label="All open places" />
                  </ScrollRow>
                ) : nearby.isEnriching || sections.withHours === 0 ? (
                  <RowSkeleton />
                ) : (
                  <p className="rounded-2xl border border-dashed border-line-2 px-4 py-6 text-sm text-muted-2">Nothing with listed hours is open nearby at the moment.</p>
                )}
              </section>
            </Reveal>

            {/* Essentials */}
            {sections.essentials.length > 0 && (
              <Reveal>
                <section>
                  <SectionHeader title="Nearby essentials" subtitle="The closest of each, when you need it" href="/emergency" linkLabel="Emergency services" />
                  <ScrollRow label="Nearby essentials">
                    {sections.essentials.map((p) => (
                      <EssentialCard key={p.id} place={p} />
                    ))}
                  </ScrollRow>
                </section>
              </Reveal>
            )}

            {/* Deals */}
            {deals.length > 0 && (
              <Reveal>
                <section>
                  <SectionHeader title="Deals near you" subtitle="Offers from businesses in your area" href="/deals" />
                  <ScrollRow label="Deals near you">
                    {deals.slice(0, 8).map((d) => (
                      <DealCard key={d.id} deal={d} onToggleSave={toggleSave} className="w-[330px]" />
                    ))}
                  </ScrollRow>
                </section>
              </Reveal>
            )}

            {/* Top rated and local favourites, side by side on wide screens */}
            {(sections.topRated.length > 0 || sections.favorites.length > 0) && (
              <Reveal>
                <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-8">
                  {sections.topRated.length > 0 && (
                    <section>
                      <SectionHeader title="Top rated" subtitle="Highest scores from the community" href="/search?sort=rating" />
                      <div className="card divide-y divide-line px-4">
                        {sections.topRated.map((p, i) => (
                          <RankedPlaceRow key={p.id} place={p} rank={i + 1} />
                        ))}
                      </div>
                    </section>
                  )}
                  {sections.favorites.length > 0 && (
                    <section>
                      <SectionHeader title="Local favorites" subtitle="Independent spots people keep returning to" />
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        {sections.favorites.map((p) => (
                          <CompactPlaceCard key={p.id} place={p} />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </Reveal>
            )}

            {/* Trending */}
            {sections.trending.length > 0 && (
              <Reveal>
                <section>
                  <SectionHeader title="Trending places" subtitle="Getting more attention than usual this week" />
                  <ScrollRow label="Trending places">
                    {sections.trending.map((p) => (
                      <PlaceCard key={p.id} place={p} />
                    ))}
                  </ScrollRow>
                </section>
              </Reveal>
            )}

            {/* Weekend */}
            {sections.weekend.length > 0 && (
              <Reveal>
                <section>
                  <SectionHeader title={weekend.title} subtitle={weekend.subtitle} href="/events" linkLabel="Local events" />
                  <ScrollRow label={weekend.title}>
                    {sections.weekend.map((p) => (
                      <PortraitPlaceCard key={p.id} place={p} note={CATEGORIES.find((c) => c.id === p.categoryId)?.singular} />
                    ))}
                  </ScrollRow>
                </section>
              </Reveal>
            )}

            {/* New places */}
            {sections.newPlaces.length > 0 && (
              <Reveal>
                <section>
                  <SectionHeader title="New places" subtitle="Most recently added to the map around you" />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {sections.newPlaces.slice(0, 6).map((p) => (
                      <CompactPlaceCard key={p.id} place={p} />
                    ))}
                  </div>
                </section>
              </Reveal>
            )}
          </>
        )}

        {/* Recently viewed */}
        {recent.data && recent.data.length > 0 && (
          <Reveal>
            <section>
              <SectionHeader title="Recently viewed" subtitle="Kept on this device, available offline" />
              <ScrollRow label="Recently viewed">
                {recent.data.map((p) => (
                  <PlaceCard key={p.id} place={p} className="w-[200px] sm:w-[220px]" />
                ))}
              </ScrollRow>
            </section>
          </Reveal>
        )}
      </div>
    </Page>
  );
}
