import { Eye, EyeOff, Flag, MapPin, MessageSquareText, SearchX, TextSearch, ThumbsUp, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { RatingStars } from '@/components/common/place-bits';
import { EmptyState, Notice } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Sheet } from '@/components/ui/sheet';
import { CATEGORY_BY_ID } from '@/data/categories';
import { timeAgo } from '@/lib/time';
import { titleCase } from '@/lib/utils';
import { useSettings } from '@/store/settings';
import type { Review } from '@/types';
import { AdminPage, DataTable, Detail, FilterSelect, ModerationBadge, QueryState, RowMenu, SearchField, Toolbar, type Column, type RowAction } from '../components/kit';
import { useLatest, useReviewMutations, useReviews } from '../hooks';

type Filter = 'all' | 'flagged' | 'visible' | 'pending' | 'hidden';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All reviews' },
  { value: 'flagged', label: 'Flagged by readers' },
  { value: 'visible', label: 'Visible' },
  { value: 'pending', label: 'Pending' },
  { value: 'hidden', label: 'Hidden' },
];

function FlagCount({ review }: { review: Review }) {
  if (!review.flagged.length) return <span className="text-[13px] text-muted">None</span>;
  return (
    <Badge tone="warning">
      <Flag aria-hidden /> {review.flagged.length} {review.flagged.length === 1 ? 'flag' : 'flags'}
    </Badge>
  );
}

function ReviewsTable({ reviews }: { reviews: Review[] }) {
  const sampleOn = useSettings((s) => s.sampleData);
  const { setModeration, remove } = useReviewMutations();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [readingId, setReadingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Review | null>(null);
  const reading = useLatest(reviews.find((r) => r.id === readingId) ?? null);
  const deleted = useLatest(deleting);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reviews.filter(
      (r) =>
        (filter === 'all' || (filter === 'flagged' ? r.flagged.length > 0 : r.moderation === filter)) &&
        (!needle || [r.text, r.placeName, r.userName].some((v) => v.toLowerCase().includes(needle))),
    );
  }, [reviews, q, filter]);

  const filtered = q.trim() !== '' || filter !== 'all';

  const toggleAction = (r: Review): RowAction =>
    r.moderation === 'hidden'
      ? { label: 'Restore review', icon: Eye, onSelect: () => setModeration.mutate({ id: r.id, state: 'visible' }) }
      : { label: 'Hide review', icon: EyeOff, onSelect: () => setModeration.mutate({ id: r.id, state: 'hidden' }) };

  const actionsFor = (r: Review): (RowAction | false)[] => [
    { label: 'Read in full', icon: TextSearch, onSelect: () => setReadingId(r.id) },
    { label: 'View place', icon: MapPin, to: `/place/${r.placeId}` },
    { ...toggleAction(r), separated: true },
    r.moderation === 'pending' && { label: 'Approve and show', icon: Eye, onSelect: () => setModeration.mutate({ id: r.id, state: 'visible' }) },
    { label: 'Delete', icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(r) },
  ];

  const body = (r: Review) => (
    <button type="button" onClick={() => setReadingId(r.id)} className="block w-full text-left">
      <span className="flex items-center gap-2">
        <RatingStars value={r.rating} size={13} />
        <span className="tabular text-[12.5px] font-medium text-ink-2">{r.rating.toFixed(1)}</span>
        {r.photos.length > 0 && <span className="text-[12.5px] text-muted-2">· {r.photos.length} {r.photos.length === 1 ? 'photo' : 'photos'}</span>}
      </span>
      <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink">{r.text}</span>
    </button>
  );

  const columns: Column<Review>[] = [
    { id: 'review', header: 'Review', cell: (r) => <div className="max-w-[380px]">{body(r)}</div> },
    {
      id: 'place',
      header: 'Place',
      cell: (r) => (
        <div className="max-w-[190px]">
          <Link to={`/place/${r.placeId}`} className="block truncate font-medium text-ink hover:underline">
            {r.placeName}
          </Link>
          <p className="truncate text-[12.5px] text-muted-2">{CATEGORY_BY_ID[r.categoryId]?.singular ?? 'Place'}</p>
        </div>
      ),
    },
    {
      id: 'author',
      header: 'Author',
      cell: (r) => (
        <div className="max-w-[150px]">
          <p className="truncate text-ink-2">{r.userName}</p>
          {r.userLevel && <p className="truncate text-[12.5px] text-muted-2">{r.userLevel}</p>}
        </div>
      ),
    },
    { id: 'flags', header: 'Flags', cell: (r) => <FlagCount review={r} /> },
    { id: 'state', header: 'State', cell: (r) => <ModerationBadge state={r.moderation} /> },
    { id: 'posted', header: 'Posted', cell: (r) => <span className="tabular whitespace-nowrap text-[13px] text-muted-2">{timeAgo(r.createdAt)}</span> },
    { id: 'actions', header: 'Actions', srOnlyHeader: true, align: 'right', cell: (r) => <RowMenu label={`Actions for the review by ${r.userName}`} actions={actionsFor(r)} className="ml-auto" /> },
  ];

  return (
    <>
      {sampleOn && (
        <Notice tone="sample" className="mb-4">
          Only real reviews are listed. Sample reviews are generated per place and never stored; a flagged sample review appears in{' '}
          <Link to="/admin/moderation" className="font-medium underline underline-offset-2">
            Moderation
          </Link>
          , where it can be hidden.
        </Notice>
      )}

      <Toolbar>
        <SearchField value={q} onChange={setQ} placeholder="Search review text, place or author" label="Search reviews" />
        <FilterSelect label="Show" value={filter} onChange={setFilter} options={FILTERS} />
      </Toolbar>

      <DataTable
        caption="Reviews, flagged first"
        noun={['review', 'reviews']}
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        card={(r) => (
          <div>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">{body(r)}</div>
              <RowMenu label={`Actions for the review by ${r.userName}`} actions={actionsFor(r)} />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <ModerationBadge state={r.moderation} />
              {r.flagged.length > 0 && <FlagCount review={r} />}
            </div>
            <p className="mt-2 text-[12.5px] text-muted-2">
              {r.userName} on{' '}
              <Link to={`/place/${r.placeId}`} className="font-medium text-ink-2 hover:underline">
                {r.placeName}
              </Link>{' '}
              · <span className="tabular">{timeAgo(r.createdAt)}</span>
            </p>
          </div>
        )}
        empty={
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="No reviews match"
              description="Try a different search or filter."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={MessageSquareText} title="No reviews yet" description="Reviews people write appear here, with anything readers have flagged at the top." />
          )
        }
      />

      <Sheet
        open={readingId !== null && reviews.some((r) => r.id === readingId)}
        onOpenChange={(open) => !open && setReadingId(null)}
        title={reading ? `Review of ${reading.placeName}` : 'Review'}
        description={reading ? `By ${reading.userName}, ${timeAgo(reading.createdAt)}${reading.updatedAt ? ` (edited ${timeAgo(reading.updatedAt)})` : ''}` : undefined}
        side="right"
        footer={
          reading && (
            <div className="flex gap-2.5">
              <Button
                variant={reading.moderation === 'hidden' ? 'primary' : 'secondary'}
                className="flex-1"
                loading={setModeration.isPending}
                onClick={() => setModeration.mutate({ id: reading.id, state: reading.moderation === 'hidden' ? 'visible' : 'hidden' })}
              >
                {reading.moderation === 'hidden' ? <Eye /> : <EyeOff />}
                {reading.moderation === 'hidden' ? 'Restore' : reading.moderation === 'pending' ? 'Hide' : 'Hide review'}
              </Button>
              {reading.moderation === 'pending' && (
                <Button className="flex-1" loading={setModeration.isPending} onClick={() => setModeration.mutate({ id: reading.id, state: 'visible' })}>
                  <Eye /> Approve
                </Button>
              )}
              <Button variant="danger-soft" className="flex-1" onClick={() => setDeleting(reading)}>
                <Trash2 /> Delete
              </Button>
            </div>
          )
        }
      >
        {reading && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <RatingStars value={reading.rating} size={16} />
              <span className="tabular text-sm font-semibold text-ink">{reading.rating.toFixed(1)}</span>
              <ModerationBadge state={reading.moderation} />
              {reading.flagged.length > 0 && <FlagCount review={reading} />}
            </div>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{reading.text}</p>
            {reading.photos.length > 0 && (
              <ul className="grid grid-cols-3 gap-2">
                {reading.photos.map((src, i) => (
                  <li key={i}>
                    <img src={src} alt={`Photo ${i + 1} attached to the review`} loading="lazy" className="aspect-square w-full rounded-xl border border-line object-cover" />
                  </li>
                ))}
              </ul>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {Object.entries(reading.aspects).map(([name, value]) => (
                <Detail key={name} label={titleCase(name)}>
                  <span className="tabular">{value} / 5</span>
                </Detail>
              ))}
              <Detail label="Marked helpful">
                <span className="tabular inline-flex items-center gap-1.5">
                  <ThumbsUp className="size-4 text-muted-2" aria-hidden /> {reading.helpful.length}
                </span>
              </Detail>
              <Detail label="Author">
                {reading.userName}
                {reading.userLevel ? `, ${reading.userLevel}` : ''}
              </Detail>
            </dl>
            {reading.reply && (
              <div className="rounded-xl border border-line bg-surface-2 p-3.5">
                <p className="text-[12.5px] text-muted-2">
                  Reply from {reading.reply.by}, {timeAgo(reading.reply.at)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{reading.reply.text}</p>
              </div>
            )}
            <Link to={`/place/${reading.placeId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink hover:underline">
              <MapPin className="size-4" aria-hidden /> Open {reading.placeName}
            </Link>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this review?"
        description={`The review of ${deleted?.placeName ?? 'this place'} by ${deleted?.userName ?? 'its author'} is removed for good, with the points it earned. To keep the record, hide it instead.`}
        confirmLabel="Delete review"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              setReadingId(null);
            },
          })
        }
      />
    </>
  );
}

export default function ReviewsPage() {
  const reviews = useReviews();
  return (
    <AdminPage title="Reviews" subtitle="Every review people have written. Anything readers flagged is listed first.">
      <QueryState query={reviews}>{(data) => <ReviewsTable reviews={data} />}</QueryState>
    </AdminPage>
  );
}
