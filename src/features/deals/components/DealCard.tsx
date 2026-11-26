import { Bookmark, Clock, Megaphone, Share2 } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@/components/common/Icon';
import { SampleTag } from '@/components/ui/badge';
import { CATEGORY_BY_ID, GROUP_BY_ID, TONES } from '@/data/categories';
import { appUrl } from '@/lib/env';
import { formatDistance } from '@/lib/geo';
import { timeLeft } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { DealView } from '@/services/deals';

export async function shareLink(data: { title: string; text?: string; url: string }) {
  try {
    if (navigator.share) {
      await navigator.share(data);
      return;
    }
    await navigator.clipboard.writeText(data.url);
    toast.success('Link copied');
  } catch (e) {
    // The user closing the share sheet is not an error.
    if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error('Could not share this.');
  }
}

/** Ticket-style deal card: the offer on a coloured stub, the details beside it. */
export const DealCard = memo(function DealCard({ deal, onToggleSave, className }: { deal: DealView; onToggleSave: (id: string) => void; className?: string }) {
  const cat = CATEGORY_BY_ID[deal.categoryId];
  const tone = TONES[GROUP_BY_ID[deal.groupId].tone];
  const urgent = deal.endsAt - Date.now() < 36 * 3_600_000;

  return (
    <article className={cn('relative flex overflow-hidden rounded-2xl border bg-surface shadow-card', deal.promoted ? 'border-butter' : 'border-line', className)}>
      <Link to={`/place/${deal.placeId}`} className="flex w-[104px] shrink-0 flex-col items-center justify-center gap-2 px-2 py-4 text-center" style={{ backgroundColor: tone.softHex }} aria-label={`${deal.badge} at ${deal.placeName}`}>
        <Icon name={cat?.icon ?? 'BadgePercent'} className="size-5" style={{ color: tone.hex }} />
        <span className="display text-[19px] leading-[1.05] text-[#252B26]">{deal.badge}</span>
      </Link>
      {/* Perforation between stub and body */}
      <span className="absolute left-[104px] top-0 h-full border-l border-dashed border-line-2" aria-hidden />
      <span className="absolute left-[97px] -top-2 size-3.5 rounded-full border border-line bg-bg" aria-hidden />
      <span className="absolute left-[97px] -bottom-2 size-3.5 rounded-full border border-line bg-bg" aria-hidden />

      <div className="flex min-w-0 flex-1 flex-col p-3.5 pl-4">
        <div className="flex items-center gap-2">
          {deal.promoted && (
            <span className="inline-flex items-center gap-1 rounded-md bg-butter px-1.5 py-0.5 text-[11px] font-semibold text-[#252B26]" title="This business paid to feature this offer">
              <Megaphone className="size-3" aria-hidden /> Promoted
            </span>
          )}
          {deal.isSample && <SampleTag />}
        </div>
        <Link to={`/place/${deal.placeId}`} className="mt-1 block">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{deal.title}</h3>
          <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-2">
            {deal.placeName} · {formatDistance(deal.distance)}
          </p>
        </Link>
        <div className="mt-auto flex items-center gap-1 pt-2.5">
          <span className={cn('tabular flex items-center gap-1 text-[12.5px] font-medium', urgent ? 'text-danger' : 'text-muted-2')}>
            <Clock className="size-3.5" aria-hidden /> {timeLeft(deal.endsAt)}
          </span>
          <button
            type="button"
            onClick={() => shareLink({ title: `${deal.badge} at ${deal.placeName}`, text: deal.title, url: appUrl(`/place/${deal.placeId}`) })}
            aria-label="Share deal"
            className="ml-auto grid size-8 place-items-center rounded-full text-muted-2 hover:bg-bg-2 hover:text-ink"
          >
            <Share2 className="size-4" />
          </button>
          <button type="button" onClick={() => onToggleSave(deal.id)} aria-pressed={deal.saved} aria-label={deal.saved ? 'Remove saved deal' : 'Save deal'} className="grid size-8 place-items-center rounded-full text-muted-2 hover:bg-bg-2 hover:text-ink">
            <Bookmark className={cn('size-4', deal.saved && 'text-brand')} fill={deal.saved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </article>
  );
});
