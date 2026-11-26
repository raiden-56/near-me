import { ArrowLeft, Building2, EllipsisVertical, Flag, FolderPlus, Globe, MapPinOff, Navigation, PenLine, Pencil, Phone, Plus, Radio, Share2, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@/components/common/Icon';
import { Page, Reveal, ScrollRow, SectionHeader } from '@/components/common/layout-bits';
import { PriceLevel, RatingStars, SaveButton, VerifiedBadge } from '@/components/common/place-bits';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Skeleton } from '@/components/ui/controls';
import { Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { CATEGORY_BY_ID, GROUP_BY_ID, TONES } from '@/data/categories';
import { LiveUpdateCard } from '@/features/community/components/LiveUpdateCard';
import { DealCard, shareLink } from '@/features/deals/components/DealCard';
import { MapView } from '@/features/maps/components/MapView';
import { ReviewsSection } from '@/features/reviews/components/ReviewsSection';
import { CollectionPicker } from '@/features/saved/components/CollectionPicker';
import { useDeals, useLiveFeed } from '@/hooks/useCommunity';
import { useNearbyPlaces, usePlace, usePlaceGallery, usePlaceStats, useVerifiedListing } from '@/hooks/usePlaces';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { appUrl } from '@/lib/env';
import { distanceMeters, formatDistance } from '@/lib/geo';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { analyticsService } from '@/services/analytics';
import { contributeService } from '@/services/contribute';
import { moderationService } from '@/services/moderation';
import { osmUrl } from '@/services/places';
import { savedService } from '@/services/saved';
import { useLocation } from '@/store/location';
import { useUi } from '@/store/ui';
import type { Place, PlacePhoto } from '@/types';
import { PlaceCard } from '../components/PlaceCards';
import { FactGroups, HoursCard, LocationCard, PlaceGallery } from '../components/PlaceSections';
import { placeDescription, placeFacts } from '../lib/placeFacts';

const PROBLEMS = [
  { id: 'closed', label: 'Permanently closed', hint: 'This place no longer exists here' },
  { id: 'edit', label: 'Wrong details', hint: 'Name, hours, phone or location is incorrect' },
  { id: 'duplicate', label: 'Duplicate or not a real place', hint: 'It should not be listed' },
  { id: 'offensive', label: 'Offensive or inappropriate', hint: 'The listing breaks community guidelines' },
] as const;

function ReportProblemSheet({ place, open, onOpenChange }: { place: Place; open: boolean; onOpenChange: (o: boolean) => void }) {
  const requireAuth = useRequireAuth();
  const [kind, setKind] = useState<(typeof PROBLEMS)[number]['id']>('closed');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const send = () =>
    requireAuth('Sign in to report a problem with this place.', async (user) => {
      setBusy(true);
      try {
        const note = details.trim();
        if (kind === 'closed' || kind === 'edit') {
          await contributeService.submit(user, { kind, placeId: place.id, name: place.name, categoryId: place.categoryId, lat: place.lat, lon: place.lon, details: note.length >= 10 ? note : `${PROBLEMS.find((p) => p.id === kind)!.label}. ${note}`.trim().padEnd(10, '.') });
        } else {
          await moderationService.flag(user, { type: 'place', id: place.id, label: place.name }, PROBLEMS.find((p) => p.id === kind)!.label, note);
        }
        toast.success('Thanks, we have it', { description: 'A moderator will review your report.' });
        onOpenChange(false);
        setDetails('');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not send your report.');
      } finally {
        setBusy(false);
      }
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Report a problem" description={place.name} size="sm" footer={<Button className="w-full" onClick={send} loading={busy}>Send report</Button>}>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">What is wrong?</legend>
        {PROBLEMS.map((p) => (
          <label key={p.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors', kind === p.id ? 'border-forest bg-bg-2' : 'border-line hover:bg-surface-2')}>
            <input type="radio" name="problem" className="mt-1 size-4 accent-[#E97845]" checked={kind === p.id} onChange={() => setKind(p.id)} />
            <span>
              <span className="block text-sm font-medium text-ink">{p.label}</span>
              <span className="block text-[12.5px] text-muted-2">{p.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Textarea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 600))} placeholder="Add anything that helps us check (optional)" aria-label="Details" className="mt-3 min-h-[84px]" />
    </Sheet>
  );
}

function PageSkeleton() {
  return (
    <Page className="!px-0 sm:!px-6 lg:!px-10">
      <Skeleton className="aspect-[16/10] w-full rounded-none sm:rounded-3xl lg:aspect-[21/8]" />
      <div className="space-y-3 px-4 pt-5 sm:px-0">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-4 h-12 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    </Page>
  );
}

export default function PlaceDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const here = useLocation((s) => s.coords);
  const openReport = useUi((s) => s.openReport);
  const { place, isLoading, isError, error, isUpgrading, refetch } = usePlace(id);

  const [collecting, setCollecting] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (place) {
      analyticsService.track(place.id, 'view');
      void savedService.refreshSnapshot(place);
    }
  }, [place?.id, place?.detail]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <PageSkeleton />;
  if (isError || !place)
    return (
      <Page>
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} title="We could not open this place" />
        ) : (
          <EmptyState icon={MapPinOff} title="Place not found" description="It may have been removed from the map." action={<Button asChild><Link to="/">Back to Discover</Link></Button>} />
        )}
      </Page>
    );

  return <PlaceView place={place} here={here} isUpgrading={isUpgrading} onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} collecting={collecting} setCollecting={setCollecting} reporting={reporting} setReporting={setReporting} openReport={() => openReport(place)} />;
}

interface ViewProps {
  place: Place;
  here: { lat: number; lon: number };
  isUpgrading: boolean;
  onBack: () => void;
  collecting: boolean;
  setCollecting: (v: boolean) => void;
  reporting: boolean;
  setReporting: (v: boolean) => void;
  openReport: () => void;
}

function PlaceView({ place, here, isUpgrading, onBack, collecting, setCollecting, reporting, setReporting, openReport }: ViewProps) {
  const stats = usePlaceStats(place);
  const listing = useVerifiedListing(place.id);
  const gallery = usePlaceGallery(place);
  const category = CATEGORY_BY_ID[place.categoryId];
  const tone = TONES[GROUP_BY_ID[place.groupId].tone];
  const distance = distanceMeters(here, place);

  const live = useLiveFeed({ center: place, radius: 2000 });
  const reports = live.reports.filter((r) => r.placeId === place.id && r.freshness !== 'expired');
  const { deals, toggleSave } = useDeals({ center: place });
  const placeDeals = deals.filter((d) => d.placeId === place.id);
  const similar = useNearbyPlaces({ center: place, radius: 1200, categoryIds: [place.categoryId] });
  const others = similar.places.filter((p) => p.id !== place.id && p.hasName).slice(0, 8).map((p) => ({ ...p, distance: distanceMeters(here, p) }));

  const facts = useMemo(() => placeFacts(place), [place]);
  const description = listing?.description || placeDescription(place);
  const photos = useMemo<PlacePhoto[] | undefined>(() => {
    const own: PlacePhoto[] = (listing?.photos ?? []).map((url) => ({ url, thumbUrl: url, kind: 'exact', credit: `Photo from ${listing!.name}` }));
    return gallery.data ? [...own, ...(own.length ? gallery.data.filter((p) => p.kind !== 'illustrative') : gallery.data)] : own.length ? own : undefined;
  }, [gallery.data, listing]);

  const share = () => {
    analyticsService.track(place.id, 'share');
    void shareLink({ title: place.name, text: `${place.name} on NearMe`, url: appUrl(`/place/${place.id}`) });
  };
  const directionsHref = `/map?place=${place.id}&lat=${place.lat}&lon=${place.lon}&route=1`;
  const scrollToReviews = () => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const actions = (
    <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
      <Button asChild variant="brand" className="col-span-4 sm:col-span-1">
        <Link to={directionsHref} onClick={() => analyticsService.track(place.id, 'direction')}>
          <Navigation /> Directions
        </Link>
      </Button>
      {place.phone ? (
        <Button asChild variant="secondary">
          <a href={`tel:${place.phone.replace(/[^\d+]/g, '')}`} onClick={() => analyticsService.track(place.id, 'call')}>
            <Phone /> <span className="hidden sm:inline">Call</span>
          </a>
        </Button>
      ) : (
        <Button variant="secondary" disabled title="No phone number listed">
          <Phone /> <span className="hidden sm:inline">Call</span>
        </Button>
      )}
      {place.website && (
        <Button asChild variant="secondary">
          <a href={place.website} target="_blank" rel="noreferrer" onClick={() => analyticsService.track(place.id, 'website')}>
            <Globe /> <span className="hidden sm:inline">Website</span>
          </a>
        </Button>
      )}
      <Button variant="secondary" onClick={scrollToReviews}>
        <Star /> <span className="hidden sm:inline">Review</span>
      </Button>
      <Button variant="secondary" onClick={share}>
        <Share2 /> <span className="hidden sm:inline">Share</span>
      </Button>
      <SaveButton place={place} variant="button" className="hidden sm:flex" onSaved={() => setCollecting(true)} />
    </div>
  );

  const moreMenu = (
    <Menu>
      <MenuTrigger className="grid size-10 place-items-center rounded-full bg-white/92 text-[#252B26] shadow-card backdrop-blur-sm hover:bg-white lg:border lg:border-line lg:bg-surface lg:text-ink lg:shadow-none" aria-label="More actions">
        <EllipsisVertical className="size-[18px]" />
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => setCollecting(true)}>
          <FolderPlus /> Add to collection
        </MenuItem>
        <MenuItem onSelect={openReport}>
          <Radio /> Share a live update
        </MenuItem>
        <MenuItem asChild>
          <Link to={`/contribute?kind=edit&place=${place.id}`}>
            <Pencil /> Suggest an edit
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link to={`/contribute?kind=photo&place=${place.id}`}>
            <Plus /> Add photos
          </Link>
        </MenuItem>
        {!listing && (
          <MenuItem asChild>
            <Link to={`/business/claim?place=${place.id}`}>
              <Building2 /> Claim this business
            </Link>
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem onSelect={() => setReporting(true)}>
          <Flag /> Report a problem
        </MenuItem>
      </MenuContent>
    </Menu>
  );

  return (
    <Page className="!px-0 sm:!px-6 lg:!px-10">
      {/* Cover */}
      <div className="relative lg:pt-6">
        <PlaceGallery place={place} photos={photos} loading={gallery.isPending && !photos} />
        <div className="absolute inset-x-3 top-3 flex items-center justify-between lg:hidden">
          <button type="button" onClick={onBack} aria-label="Go back" className="grid size-10 place-items-center rounded-full bg-white/92 text-[#252B26] shadow-card backdrop-blur-sm">
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex gap-2">
            <SaveButton place={place} className="size-10" onSaved={() => setCollecting(true)} />
            {moreMenu}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-0 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        {/* Main column */}
        <div className="min-w-0">
          <header className="pb-5 pt-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className={cn('mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-medium', tone.soft)}>
                  <Icon name={category?.icon ?? 'MapPin'} className="size-3.5" /> {category?.singular}
                </p>
                <h1 className="display text-[30px] text-ink sm:text-[40px]">{place.name}</h1>
              </div>
              <div className="hidden pt-1 lg:block">{moreMenu}</div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              {stats.rating ? (
                <button type="button" onClick={scrollToReviews} className="flex items-center gap-1.5 hover:underline">
                  <RatingStars value={stats.rating} size={15} />
                  <span className="tabular font-semibold text-ink">{stats.rating.toFixed(1)}</span>
                  <span className="tabular text-muted-2">({stats.reviewCount.toLocaleString('en-IN')})</span>
                </button>
              ) : (
                <button type="button" onClick={scrollToReviews} className="text-muted-2 underline underline-offset-2">
                  No ratings yet
                </button>
              )}
              {stats.isSample && stats.rating && <Badge tone="outline">Sample rating</Badge>}
              <PriceLevel level={stats.priceLevel} />
              <span className="tabular text-muted-2">{formatDistance(distance)} away</span>
              {listing && <VerifiedBadge />}
            </div>
            {place.cuisine && <p className="mt-2 text-sm text-ink-2">{place.cuisine.join(' · ')}</p>}
          </header>

          <div className="pb-6 lg:hidden">{actions}</div>

          <div className="space-y-9">
            {/* Live status: core to the product, so it sits above static details */}
            <section aria-labelledby="live-heading">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 id="live-heading" className="display-sm flex items-center gap-2 text-[22px] text-ink">
                  <Radio className="size-5 text-brand" aria-hidden /> Right now
                </h2>
                <Button size="sm" variant="secondary" onClick={openReport}>
                  <Plus /> Share update
                </Button>
              </div>
              {live.isLoading ? (
                <Skeleton className="h-[88px] rounded-2xl" />
              ) : reports.length ? (
                <div className="space-y-3">
                  {reports.map((r) => (
                    <LiveUpdateCard key={r.id} report={r} showPlace={false} />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-line-2 px-4 py-5 text-sm text-muted-2">
                  No live updates for this place right now. If you are here, tell others about the queue, wait or availability.
                </p>
              )}
            </section>

            {placeDeals.length > 0 && (
              <section>
                <h2 className="display-sm mb-3 text-[22px] text-ink">Offers</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {placeDeals.map((d) => (
                    <DealCard key={d.id} deal={d} onToggleSave={toggleSave} />
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="display-sm mb-3 text-[22px] text-ink">
                About
              </h2>
              {description && <p className="mb-5 max-w-2xl text-[15px] leading-relaxed text-ink-2">{description}</p>}

              {listing && listing.services.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-2.5 text-[15px] font-semibold text-ink">Services</h3>
                  <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                    {listing.services.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="min-w-0">
                          <span className="block text-ink">{s.name}</span>
                          {s.note && <span className="block text-[12.5px] text-muted-2">{s.note}</span>}
                        </span>
                        {s.price && <span className="tabular shrink-0 font-semibold text-ink">{s.price}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {facts.length > 0 ? (
                <FactGroups groups={facts} />
              ) : isUpgrading ? (
                <div className="space-y-2">
                  <Skeleton className="h-11 w-full rounded-xl" />
                  <Skeleton className="h-11 w-full rounded-xl" />
                </div>
              ) : (
                !description && (
                  <Notice>
                    The map does not hold more details for this place yet.{' '}
                    <Link to={`/contribute?kind=edit&place=${place.id}`} className="font-medium text-ink underline underline-offset-2">
                      Add what you know
                    </Link>
                  </Notice>
                )
              )}

              <p className="mt-5 text-[12.5px] text-muted-2">
                {place.source === 'listing' ? 'Details provided by the business.' : 'Details from OpenStreetMap contributors.'} Checked {timeAgo(place.fetchedAt)}.
                {osmUrl(place.id) && (
                  <>
                    {' '}
                    <a href={osmUrl(place.id)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      View source
                    </a>
                  </>
                )}
              </p>
            </section>

            {/* Sidebar content repeats here on phones */}
            <div className="space-y-3 lg:hidden">
              <HoursCard place={place} loading={isUpgrading} />
              <LocationCard place={place} distance={distance} map={(visible) => visible && <MapView center={place} zoom={15.5} places={[place]} selectedId={place.id} interactive={false} label={`Map showing ${place.name}`} />} />
            </div>

            <div id="reviews" className="scroll-mt-24">
              <ReviewsSection place={place} limit={4} />
            </div>

            {others.length > 0 && (
              <Reveal>
                <section>
                  <SectionHeader title={`More ${category?.label.toLowerCase() ?? 'places'} nearby`} href={`/category/${place.categoryId}`} />
                  <ScrollRow>
                    {others.map((p) => (
                      <PlaceCard key={p.id} place={p} className="w-[210px] sm:w-[230px]" />
                    ))}
                  </ScrollRow>
                </section>
              </Reveal>
            )}

            {!listing && place.source !== 'listing' && (
              <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface-2 p-5 sm:flex-row sm:items-center">
                <Building2 className="size-6 shrink-0 text-ink-2" aria-hidden />
                <p className="flex-1 text-sm text-ink-2">
                  <span className="font-semibold text-ink">Is this your business?</span> Claim it to update details, post offers and share live availability.
                </p>
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/business/claim?place=${place.id}`}>Claim listing</Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-[92px] space-y-3 pt-6">
            <div className="card p-4">{actions}</div>
            <HoursCard place={place} loading={isUpgrading} />
            <LocationCard place={place} distance={distance} map={(visible) => visible && <MapView center={place} zoom={15.5} places={[place]} selectedId={place.id} interactive={false} label={`Map showing ${place.name}`} />} />
            {(place.phone || place.website) && (
              <div className="card divide-y divide-line">
                {place.phone && (
                  <a href={`tel:${place.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-surface-2">
                    <Phone className="size-[18px] text-muted-2" /> <span className="tabular">{place.phone}</span>
                  </a>
                )}
                {place.website && (
                  <a href={place.website} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-surface-2">
                    <Globe className="size-[18px] text-muted-2" /> <span className="truncate">{place.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                  </a>
                )}
              </div>
            )}
            <Link to={`/contribute?kind=edit&place=${place.id}`} className="flex items-center justify-center gap-2 py-2 text-[13px] font-medium text-muted-2 hover:text-ink">
              <PenLine className="size-4" /> Suggest an edit
            </Link>
          </div>
        </aside>
      </div>

      <CollectionPicker place={place} open={collecting} onOpenChange={setCollecting} />
      <ReportProblemSheet place={place} open={reporting} onOpenChange={setReporting} />
    </Page>
  );
}
