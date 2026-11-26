import { ArrowRight, BadgePercent, Bookmark, Check, ChartLine, ExternalLink, Eye, MessagesSquare, Navigation, Phone, Radio, Search, Star } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { SampleTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { CATEGORY_BY_ID } from '@/data/categories';
import { greeting, MIN, timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { listingPlaceId, offerState } from '@/services/businessPortal';
import { reviewsService } from '@/services/reviews';
import { Panel, PortalPage, StatTile } from '../components/bits';
import { ChartLegend, TrendLines, type SeriesDef } from '../components/charts';
import { ReviewItem } from '../components/ReviewItem';
import { VerificationSummary } from '../components/Verification';
import { usePortal } from '../context';
import { useInsights, useListingDeals, useListingReviews } from '../hooks';
import { AVAILABILITY_META } from '../lib/availability';
import { profileCompletion } from '../lib/completion';
import { METRICS, toSeries } from '../lib/insights';

const TREND_SERIES: SeriesDef[] = [
  { key: 'view', label: METRICS.view.label, color: METRICS.view.color },
  { key: 'impression', label: METRICS.impression.label, color: METRICS.impression.color, dashed: true },
];

/** Profile completion as a ring. The percentage inside is the value; the ring only repeats it. */
function CompletionRing({ percent }: { percent: number }) {
  const r = 34;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative size-[88px] shrink-0" role="img" aria-label={`Profile ${percent}% complete`}>
      <svg viewBox="0 0 88 88" className="size-full -rotate-90" aria-hidden>
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={percent >= 100 ? 'var(--success)' : 'var(--brand)'}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, percent) / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[19px] font-semibold text-ink" aria-hidden>
        {percent}%
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { listing, user } = usePortal();
  const month = useInsights(listing.id, 30);
  const fortnight = useInsights(listing.id, 14);
  const reviews = useListingReviews(listing.id);
  const deals = useListingDeals(listing.id);
  const expiryMinutes = useLocalDb((s) => s.config.expiryMinutes.availability);

  const completion = useMemo(() => profileCompletion(listing), [listing]);
  const reviewList = reviews.data ?? [];
  const rating = useMemo(() => reviewsService.summarize(reviewList), [reviewList]);
  const ratingIsSample = reviewList.length > 0 && reviewList.every((r) => r.isSample);
  const ratingHasSample = reviewList.some((r) => r.isSample);

  const offers = deals.data ?? [];
  const activeOffers = offers.filter((d) => offerState(d) === 'active').length;
  const scheduledOffers = offers.filter((d) => offerState(d) === 'scheduled').length;

  const cat = CATEGORY_BY_ID[listing.categoryId];
  const isPublic = Boolean(listing.placeId) || listing.verification === 'verified';
  const verified = listing.verification === 'verified';

  // A status older than a live update's lifetime is no longer what customers see.
  const status = listing.availability;
  const statusCurrent = Boolean(status && Date.now() - status.updatedAt < expiryMinutes * MIN);

  const totals = month.insights?.totals;
  const kpis = [
    { key: 'view', label: 'Views', icon: Eye, value: totals?.view },
    { key: 'impression', label: 'Search impressions', icon: Search, value: totals?.impression },
    { key: 'direction', label: 'Direction requests', icon: Navigation, value: totals?.direction },
    { key: 'call', label: 'Calls', icon: Phone, value: totals?.call },
    { key: 'save', label: 'Saves', icon: Bookmark, value: totals?.save },
  ] as const;

  const trend = fortnight.insights ? toSeries(fortnight.insights.daily).points : [];
  const trendEmpty = Boolean(fortnight.insights && !fortnight.insights.hasData);

  return (
    <PortalPage
      title={listing.name || 'Your business'}
      eyebrow={`${greeting()}, ${user.name.split(' ')[0]}`}
      subtitle={[cat?.singular, listing.address].filter(Boolean).join(' · ') || 'Finish setting up your listing to appear in NearMe.'}
      actions={
        <>
          {isPublic && (
            <Button variant="secondary" asChild>
              <Link to={`/place/${listingPlaceId(listing)}`}>
                <ExternalLink /> View in NearMe
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link to="/business/availability">
              <Radio /> Update availability
            </Link>
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {listing.verification === 'draft' && (
          <Notice
            tone="warning"
            action={
              <Button size="sm" asChild className="shrink-0">
                <Link to={`/business/onboarding?listing=${listing.id}`}>
                  Continue setup <ArrowRight />
                </Link>
              </Button>
            }
          >
            <span className="font-semibold text-ink">This listing is still a draft.</span> Customers cannot see it yet. Finish the setup and send it for verification.
          </Notice>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr]">
          <Panel title="Profile strength">
            <div className="flex items-center gap-4">
              <CompletionRing percent={completion.percent} />
              <p className="text-sm text-ink-2">
                {completion.remaining.length === 0
                  ? 'Everything customers look for is filled in.'
                  : `${completion.remaining.length} thing${completion.remaining.length === 1 ? '' : 's'} left. Complete listings are opened and saved more often.`}
              </p>
            </div>
            {completion.remaining.length === 0 ? (
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-success">
                <Check className="size-4" aria-hidden /> Your profile is complete
              </p>
            ) : (
              <ul className="mt-4 space-y-1">
                {completion.remaining.slice(0, 4).map((item) => (
                  <li key={item.key}>
                    <Link to={item.to} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-bg-2">
                      <span className="size-4 shrink-0 rounded-full border-2 border-line-2" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{item.label}</span>
                        <span className="block truncate text-[12.5px] text-muted-2">{item.hint}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
                {completion.remaining.length > 4 && <li className="px-2 pt-1 text-[12.5px] text-muted-2">and {completion.remaining.length - 4} more</li>}
              </ul>
            )}
          </Panel>

          <Panel title="Verification">
            <VerificationSummary listing={listing} />
          </Panel>

          <Panel title="Live availability">
            {status && statusCurrent ? (
              <>
                <p className="flex items-center gap-2 text-[17px] font-semibold text-ink">
                  <span className={cn('size-2.5 rounded-full', AVAILABILITY_META[status.status].dot)} aria-hidden />
                  {AVAILABILITY_META[status.status].label}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {status.waitMinutes ? `About ${status.waitMinutes} min wait. ` : ''}
                  {status.note}
                </p>
                <p className="mt-2 text-[13px] text-muted-2">
                  Set {timeAgo(status.updatedAt)}
                  {verified ? '' : ' · shared once you are verified'}.
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-2">
                {status ? 'Your last status has expired, so customers see your regular hours.' : 'No status set. Customers see your regular opening hours.'}
              </p>
            )}
            <Link to="/business/availability" className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
              {status && statusCurrent ? 'Change status' : 'Set a status'} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </Panel>
        </div>

        <section aria-labelledby="kpi-heading">
          <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="kpi-heading" className="display-sm text-[22px] text-ink">
                Last 30 days
              </h2>
              <p className="mt-0.5 text-sm text-muted-2">
                {month.isSample ? (
                  <>
                    Nothing has been tracked yet, so these are <SampleTag className="mx-0.5" /> figures showing what this will look like.
                  </>
                ) : (
                  'How customers found and used your listing.'
                )}
              </p>
            </div>
            <Link to="/business/analytics" className="group flex items-center gap-1 text-[13px] font-medium text-brand-ink">
              All insights <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>

          {month.isError ? (
            <div className="card">
              <ErrorState compact error={month.error} onRetry={() => void month.refetch()} title="We could not load your numbers" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {kpis.map((k) =>
                month.isLoading ? (
                  <Skeleton key={k.key} className="h-[104px] rounded-2xl" />
                ) : (
                  <StatTile key={k.key} label={k.label} icon={k.icon} value={(k.value ?? 0).toLocaleString('en-IN')} sample={month.isSample} />
                ),
              )}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile
              to="/business/reviews"
              label="Rating"
              icon={Star}
              value={reviews.isPending ? '…' : (rating.average?.toFixed(1) ?? '–')}
              sample={ratingIsSample}
              hint={
                reviews.isPending
                  ? 'Loading reviews'
                  : rating.count === 0
                    ? 'No reviews yet'
                    : `${rating.count} review${rating.count === 1 ? '' : 's'}${ratingHasSample && !ratingIsSample ? ', including sample reviews' : ''}`
              }
            />
            <StatTile
              to="/business/offers"
              label="Active offers"
              icon={BadgePercent}
              value={deals.isPending ? '…' : activeOffers}
              hint={deals.isPending ? 'Loading offers' : scheduledOffers > 0 ? `${scheduledOffers} scheduled` : verified ? 'None scheduled' : 'Unlocks after verification'}
            />
            <StatTile to="/business/photos" label="Photos" value={listing.photos.length} hint={listing.photos.length ? 'The first one is your cover' : 'Add one to stand out'} className="col-span-2 lg:col-span-1" />
          </div>
        </section>

        <Panel
          title="Views and search impressions"
          description="The last 14 days."
          action={
            <Link to="/business/analytics" className="group flex items-center gap-1 pt-1 text-[13px] font-medium text-brand-ink">
              Open insights <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          }
        >
          {fortnight.isLoading ? (
            <Skeleton className="h-[260px] rounded-xl" />
          ) : fortnight.isError ? (
            <ErrorState compact error={fortnight.error} onRetry={() => void fortnight.refetch()} title="We could not load the chart" />
          ) : trendEmpty ? (
            <EmptyState
              compact
              icon={ChartLine}
              title="Nothing to chart yet"
              description="This fills in as customers find and open your listing. Only real interactions are counted."
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <ChartLegend series={TREND_SERIES} kind="line" />
                {fortnight.isSample && <SampleTag label="Sample data" />}
              </div>
              <TrendLines data={trend} series={TREND_SERIES} summary="Line chart of daily views and search impressions over the last 14 days. The same figures are on the insights screen as a table." />
            </>
          )}
        </Panel>

        <Panel
          title="Recent reviews"
          action={
            reviewList.length > 0 && (
              <Link to="/business/reviews" className="group flex items-center gap-1 pt-1 text-[13px] font-medium text-brand-ink">
                All reviews <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            )
          }
          bodyClassName="pt-1 sm:pt-2"
        >
          {reviews.isPending ? (
            <div className="space-y-3 pt-3" aria-busy="true" aria-label="Loading reviews">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : reviews.isError ? (
            <ErrorState compact error={reviews.error} onRetry={() => void reviews.refetch()} title="We could not load your reviews" />
          ) : reviewList.length === 0 ? (
            <EmptyState compact icon={MessagesSquare} title="No reviews yet" description="When customers review your business, the latest ones show up here." />
          ) : (
            <div className="divide-y divide-line">
              {reviewList.slice(0, 3).map((review) => (
                <ReviewItem key={review.id} review={review} compact />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </PortalPage>
  );
}
