import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EllipsisVertical, Flag, MessageSquareReply, MessageSquareText, Pencil, PenLine, ThumbsUp, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { RatingStars } from '@/components/common/place-bits';
import { EmptyState } from '@/components/common/states';
import { SampleTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, Menu, MenuContent, MenuItem, MenuTrigger, Skeleton } from '@/components/ui/controls';
import { Select } from '@/components/ui/field';
import { ConfirmDialog, Sheet } from '@/components/ui/sheet';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { timeAgo } from '@/lib/time';
import { cn, hash } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { FLAG_REASONS } from '@/services/moderation';
import { reviewsService } from '@/services/reviews';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import type { Place, Review } from '@/types';
import { ReviewComposer } from './ReviewComposer';

type Sort = 'recent' | 'helpful' | 'high' | 'low';

export function useReviews(place: Place | undefined) {
  const sample = useSettings((s) => s.sampleData);
  // Local writes change these; they are part of the key so the list refreshes on its own.
  const count = useLocalDb((s) => s.reviews.length);
  return useQuery({
    queryKey: ['reviews', place?.id, sample, count],
    queryFn: () => reviewsService.listForPlace(place!, sample),
    enabled: Boolean(place),
    staleTime: 0,
  });
}

function ReviewCard({ review, onEdit }: { review: Review; onEdit: () => void }) {
  const user = useAuth((s) => s.user);
  const requireAuth = useRequireAuth();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState<string>(FLAG_REASONS[0]);
  const [expanded, setExpanded] = useState(false);
  const mine = user?.id === review.userId;
  const liked = Boolean(user && review.helpful.includes(user.id));
  const long = review.text.length > 320;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['reviews'] });

  const helpful = () =>
    requireAuth('Sign in to mark reviews as helpful.', async (u) => {
      try {
        await reviewsService.toggleHelpful(u, review);
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'That did not work.');
      }
    });

  const remove = async () => {
    if (!user) return;
    await reviewsService.remove(user, review.id);
    setConfirm(false);
    refresh();
    void qc.invalidateQueries({ queryKey: ['contributions'] });
    toast('Review deleted');
  };

  const flag = () =>
    requireAuth('Sign in to report a review.', async (u) => {
      const created = await reviewsService.flag(u, review, reason);
      setFlagging(false);
      toast.success(created ? 'Reported to moderators' : 'You already reported this review');
    });

  return (
    <article className="py-5">
      <div className="flex items-start gap-3">
        <Avatar name={review.userName} hue={hash(review.userId) % 360} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-semibold text-ink">{mine ? 'You' : review.userName}</p>
            {review.isSample && <SampleTag />}
          </div>
          <p className="text-[12.5px] text-muted-2">
            {review.userLevel ?? 'Explorer'} · {timeAgo(review.createdAt)}
            {review.updatedAt && ' · edited'}
          </p>
        </div>
        <Menu>
          <MenuTrigger className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted-2 hover:bg-bg-2 hover:text-ink" aria-label="Review options">
            <EllipsisVertical className="size-[18px]" />
          </MenuTrigger>
          <MenuContent>
            {mine ? (
              <>
                <MenuItem onSelect={onEdit}>
                  <Pencil /> Edit review
                </MenuItem>
                <MenuItem destructive onSelect={() => setConfirm(true)}>
                  <Trash2 /> Delete review
                </MenuItem>
              </>
            ) : (
              <MenuItem onSelect={() => setFlagging(true)}>
                <Flag /> Report review
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <RatingStars value={review.rating} size={15} />
        <span className="tabular text-[13px] font-semibold text-ink">{review.rating}.0</span>
      </div>

      <p className={cn('mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-2', !expanded && long && 'line-clamp-4')}>{review.text}</p>
      {long && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-[13px] font-semibold text-ink underline underline-offset-2">
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

      {Object.keys(review.aspects).length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-2">
          {Object.entries(review.aspects).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1">
              <dt>{k}</dt>
              <dd className="tabular font-semibold text-ink-2">{v}/5</dd>
            </div>
          ))}
        </dl>
      )}

      {review.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {review.photos.map((src, i) => (
            <a key={i} href={src} target="_blank" rel="noreferrer" className="shrink-0">
              <img src={src} alt={`Photo ${i + 1} from ${review.userName}`} loading="lazy" className="size-24 rounded-xl object-cover" />
            </a>
          ))}
        </div>
      )}

      {review.reply && (
        <div className="mt-3 rounded-xl bg-bg-2 p-3.5">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
            <MessageSquareReply className="size-3.5" aria-hidden /> Reply from the business · {timeAgo(review.reply.at)}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{review.reply.text}</p>
        </div>
      )}

      <button
        type="button"
        onClick={helpful}
        disabled={mine}
        aria-pressed={liked}
        className={cn('mt-3 flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors disabled:opacity-50', liked ? 'border-brand/40 bg-brand-soft text-brand-ink' : 'border-line-2 text-ink-2 hover:bg-surface-2')}
      >
        <ThumbsUp className="size-3.5" aria-hidden /> Helpful
        {review.helpful.length > 0 && <span className="tabular">· {review.helpful.length}</span>}
      </button>

      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete your review?" description="This removes your rating and text from this place. You can write a new one later." confirmLabel="Delete" destructive onConfirm={remove} />
      <Sheet open={flagging} onOpenChange={setFlagging} title="Report this review" description="Tell moderators what is wrong with it." size="sm" footer={<Button className="w-full" onClick={flag}>Send report</Button>}>
        <Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
          {FLAG_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Sheet>
    </article>
  );
}

/** Rating summary, the reader's own review entry point, and the review list. */
export function ReviewsSection({ place, limit, className }: { place: Place; limit?: number; className?: string }) {
  const user = useAuth((s) => s.user);
  const requireAuth = useRequireAuth();
  const { data: reviews, isPending } = useReviews(place);
  const [sort, setSort] = useState<Sort>('recent');
  const [composing, setComposing] = useState(false);

  const mine = useMemo(() => reviews?.find((r) => r.userId === user?.id) ?? null, [reviews, user]);
  const summary = useMemo(() => reviewsService.summarize(reviews ?? []), [reviews]);
  const anySample = reviews?.some((r) => r.isSample);
  const sorted = useMemo(() => {
    const list = [...(reviews ?? [])];
    if (sort === 'helpful') list.sort((a, b) => b.helpful.length - a.helpful.length);
    else if (sort === 'high') list.sort((a, b) => b.rating - a.rating || b.createdAt - a.createdAt);
    else if (sort === 'low') list.sort((a, b) => a.rating - b.rating || b.createdAt - a.createdAt);
    else list.sort((a, b) => Number(b.userId === user?.id) - Number(a.userId === user?.id) || b.createdAt - a.createdAt);
    return limit ? list.slice(0, limit) : list;
  }, [reviews, sort, limit, user]);

  const write = () => requireAuth('Sign in to rate and review this place.', () => setComposing(true));
  const max = Math.max(1, ...summary.histogram);

  return (
    <section className={className} aria-labelledby="reviews-heading">
      <div className="flex items-end justify-between gap-3">
        <h2 id="reviews-heading" className="display-sm text-[22px] text-ink">
          Reviews
        </h2>
        <Button size="sm" variant={mine ? 'secondary' : 'primary'} onClick={write}>
          <PenLine /> {mine ? 'Edit your review' : 'Write a review'}
        </Button>
      </div>

      {isPending ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : !reviews?.length ? (
        <EmptyState compact icon={MessageSquareText} title="No reviews yet" description="Be the first to share what this place is like." action={<Button onClick={write}>Write the first review</Button>} />
      ) : (
        <>
          <div className="mt-4 grid gap-5 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-[auto_1fr] sm:gap-8">
            <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-1.5">
              <p className="display tabular text-[52px] leading-none text-ink">{summary.average?.toFixed(1)}</p>
              <div>
                <RatingStars value={summary.average ?? 0} size={16} />
                <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-2">
                  {summary.count} review{summary.count === 1 ? '' : 's'} shown {anySample && <SampleTag label="Includes samples" />}
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5" aria-label="Rating distribution">
                {[5, 4, 3, 2, 1].map((n) => (
                  <div key={n} className="flex items-center gap-2 text-[12.5px] text-muted-2">
                    <span className="tabular w-2.5">{n}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-[#D9A521] transition-[width] duration-500" style={{ width: `${(summary.histogram[n - 1]! / max) * 100}%` }} />
                    </div>
                    <span className="tabular w-5 text-right">{summary.histogram[n - 1]}</span>
                  </div>
                ))}
              </div>
              {summary.aspects.length > 0 && (
                <dl className="space-y-1.5">
                  {summary.aspects.map((a) => (
                    <div key={a.name} className="flex items-center justify-between text-[13px]">
                      <dt className="text-muted-2">{a.name}</dt>
                      <dd className="tabular font-semibold text-ink">{a.average.toFixed(1)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-[13px] text-muted-2">One review per person per place.</p>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort reviews" className="h-9 w-40 text-[13px]">
              <option value="recent">Most recent</option>
              <option value="helpful">Most helpful</option>
              <option value="high">Highest rated</option>
              <option value="low">Lowest rated</option>
            </Select>
          </div>

          <div className="divide-y divide-line">
            {sorted.map((r) => (
              <ReviewCard key={r.id} review={r} onEdit={() => setComposing(true)} />
            ))}
          </div>

          {limit && reviews.length > limit && (
            <Button asChild variant="secondary" className="mt-2 w-full">
              <Link to={`/place/${place.id}/reviews`}>See all {reviews.length} reviews</Link>
            </Button>
          )}
        </>
      )}

      {user && <ReviewComposer open={composing} onOpenChange={setComposing} place={place} user={user} existing={mine} />}
    </section>
  );
}
