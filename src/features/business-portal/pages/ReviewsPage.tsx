import { MessageSquare, MessagesSquare, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { RatingStars } from '@/components/common/place-bits';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { SampleTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton, Tabs } from '@/components/ui/controls';
import { Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { FLAG_REASONS } from '@/services/moderation';
import { reviewsService } from '@/services/reviews';
import type { Review } from '@/types';
import { Panel, PortalPage } from '../components/bits';
import { ReviewItem } from '../components/ReviewItem';
import { usePortal } from '../context';
import { useFlagReview, useListingReviews, useReplyToReview } from '../hooks';

type Filter = 'all' | 'waiting' | 'replied';

function ReportSheet({ review, onClose, onSubmit, busy }: { review: Review | null; onClose: () => void; onSubmit: (reason: string, note: string) => void; busy: boolean }) {
  const [reason, setReason] = useState<string>(FLAG_REASONS[0]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!review) return;
    setReason(FLAG_REASONS[0]);
    setNote('');
  }, [review]);

  return (
    <Sheet
      open={Boolean(review)}
      onOpenChange={(open) => !open && onClose()}
      title="Report this review"
      description="A moderator will look at it. Reviews are only removed when they break the community guidelines, not because they are negative."
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={() => onSubmit(reason, note)} loading={busy}>
            Send report
          </Button>
        </div>
      }
    >
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">What is wrong with it?</legend>
        <div className="space-y-1.5">
          {FLAG_REASONS.map((r) => (
            <label
              key={r}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand',
                reason === r ? 'border-forest bg-surface font-medium text-ink' : 'border-line text-ink-2 hover:bg-surface-2',
              )}
            >
              <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="sr-only" />
              <span className={cn('grid size-[18px] shrink-0 place-items-center rounded-full border-2', reason === r ? 'border-forest' : 'border-line-2')} aria-hidden>
                {reason === r && <span className="size-2 rounded-full bg-forest" />}
              </span>
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="report-note" className="mb-1.5 mt-4 block text-[13px] font-medium text-ink-2">
        Add a detail <span className="font-normal text-muted">(optional)</span>
      </label>
      <Textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} rows={3} className="min-h-[76px]" placeholder="Anything that helps the moderator understand." />
    </Sheet>
  );
}

export default function ReviewsPage() {
  const { listing } = usePortal();
  const reviews = useListingReviews(listing.id);
  const reply = useReplyToReview();
  const flag = useFlagReview();
  const [filter, setFilter] = useState<Filter>('all');
  const [reporting, setReporting] = useState<Review | null>(null);

  const all = reviews.data ?? [];
  const summary = useMemo(() => reviewsService.summarize(all), [all]);
  const real = all.filter((r) => !r.isSample);
  const waiting = real.filter((r) => !r.reply);
  const replied = all.filter((r) => r.reply);
  const hasSamples = all.some((r) => r.isSample);
  const verified = listing.verification === 'verified';
  const shown = filter === 'waiting' ? waiting : filter === 'replied' ? replied : all;
  const maxCount = Math.max(1, ...summary.histogram);

  const blockedReason = (review: Review): string | undefined => {
    if (review.isSample) return 'Sample review, shown as an example. Replies are for real reviews.';
    if (!verified) return 'Replies unlock once your listing is verified.';
    return undefined;
  };

  return (
    <PortalPage title="Reviews" subtitle="What customers say about you, and your chance to answer. Replies are public.">
      {reviews.isPending ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading reviews">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : reviews.isError ? (
        <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} title="We could not load your reviews" />
      ) : all.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={MessagesSquare}
            title="No reviews yet"
            description="Reviews appear here as customers write them. A complete, verified listing with photos is the best way to earn the first one."
            action={
              <Button asChild variant="secondary">
                <Link to="/business">Check your profile strength</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {hasSamples && (
            <Notice tone="sample">
              Some of these are <SampleTag className="mx-0.5" /> reviews: example content NearMe shows until real reviews arrive. They are included in the summary below, cannot be replied to, and disappear when sample data is switched off in Settings.
            </Notice>
          )}
          {!verified && (
            <Notice
              action={
                <Link to="/business/verification" className="shrink-0 text-[13px] font-semibold text-brand-ink underline-offset-4 hover:underline">
                  Verification
                </Link>
              }
            >
              You can read reviews now. Replying as the business unlocks once your listing is verified.
            </Notice>
          )}

          <Panel>
            <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-10">
              <div>
                <p className="flex items-baseline gap-2">
                  <span className="text-[44px] font-semibold leading-none text-ink">{summary.average?.toFixed(1) ?? '–'}</span>
                  <span className="text-sm text-muted-2">out of 5</span>
                </p>
                {summary.average != null && <RatingStars value={summary.average} size={18} className="mt-2" />}
                <p className="mt-2 text-sm text-muted-2">
                  {summary.count} review{summary.count === 1 ? '' : 's'}
                  {waiting.length > 0 && ` · ${waiting.length} waiting for a reply`}
                </p>
              </div>
              <div>
                <ul className="space-y-1.5" aria-label="Reviews by star rating">
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const count = summary.histogram[stars - 1] ?? 0;
                    return (
                      <li key={stars} className="flex items-center gap-3 text-[13px]">
                        <span className="tabular flex w-7 shrink-0 items-center gap-1 text-ink-2">
                          {stars} <Star className="size-3" style={{ color: '#D9A521' }} fill="currentColor" strokeWidth={0} aria-hidden />
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-2" aria-hidden>
                          <span className="block h-full rounded-full" style={{ width: `${(count / maxCount) * 100}%`, background: '#D9A521' }} />
                        </span>
                        <span className="tabular w-8 shrink-0 text-right text-muted-2">{count}</span>
                      </li>
                    );
                  })}
                </ul>
                {summary.aspects.length > 0 && (
                  <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3 text-[13px]">
                    {summary.aspects.map((a) => (
                      <div key={a.name} className="flex items-baseline gap-1.5">
                        <dt className="text-muted-2">{a.name}</dt>
                        <dd className="tabular font-semibold text-ink">{a.average.toFixed(1)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          </Panel>

          <Panel bodyClassName="pt-3 sm:pt-4">
            <Tabs
              value={filter}
              onChange={setFilter}
              tabs={[
                { value: 'all', label: 'All', count: all.length },
                { value: 'waiting', label: 'Waiting for a reply', count: waiting.length },
                { value: 'replied', label: 'Replied', count: replied.length },
              ]}
            />
            {shown.length === 0 ? (
              <EmptyState
                compact
                icon={MessageSquare}
                title={filter === 'waiting' ? 'You are all caught up' : 'No replies yet'}
                description={filter === 'waiting' ? 'Every real review has a reply.' : 'Reviews you reply to are listed here.'}
              />
            ) : (
              <div className="divide-y divide-line">
                {shown.map((review) => (
                  <ReviewItem
                    key={review.id}
                    review={review}
                    replyBlocked={blockedReason(review)}
                    onReply={(text) => reply.mutateAsync({ id: listing.id, reviewId: review.id, text })}
                    onReport={() => setReporting(review)}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      <ReportSheet
        review={reporting}
        busy={flag.isPending}
        onClose={() => setReporting(null)}
        onSubmit={(reason, note) => {
          if (!reporting) return;
          flag.mutate({ id: listing.id, review: reporting, reason, note: note.trim() || undefined }, { onSuccess: () => setReporting(null) });
        }}
      />
    </PortalPage>
  );
}
