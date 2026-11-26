import { CornerDownRight, Flag, Pencil, Reply, ThumbsUp } from 'lucide-react';
import { useId, useState } from 'react';
import { RatingStars } from '@/components/common/place-bits';
import { SampleTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/controls';
import { Textarea } from '@/components/ui/field';
import { timeAgo } from '@/lib/time';
import { cn, hash } from '@/lib/utils';
import type { Review } from '@/types';
import { CharCount } from './bits';

const MAX_REPLY = 600;

interface ReviewItemProps {
  review: Review;
  /** Short form for the dashboard: no actions, text clamped. */
  compact?: boolean;
  /** Why this review cannot be replied to, when it cannot. */
  replyBlocked?: string;
  onReply?: (text: string) => Promise<unknown>;
  onReport?: () => void;
  className?: string;
}

/** A customer review as the owner sees it: the review, the public reply, and the two things an owner can do. */
export function ReviewItem({ review, compact, replyBlocked, onReply, onReport, className }: ReviewItemProps) {
  const id = useId();
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const openComposer = () => {
    setText(review.reply?.text ?? '');
    setComposing(true);
  };

  const post = async () => {
    if (!onReply) return;
    setPosting(true);
    try {
      await onReply(text);
      setComposing(false);
    } catch {
      /* the hook has already shown why */
    } finally {
      setPosting(false);
    }
  };

  return (
    <article className={cn('py-4', className)}>
      <header className="flex items-start gap-3">
        <Avatar name={review.userName} hue={hash(review.userName) % 360} size={compact ? 34 : 38} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="text-[15px] font-semibold text-ink">{review.userName}</p>
            {review.userLevel && <span className="text-[12.5px] text-muted-2">{review.userLevel}</span>}
            {review.isSample && <SampleTag />}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <RatingStars value={review.rating} size={13} />
            <span className="text-[12.5px] text-muted-2">
              {timeAgo(review.createdAt)}
              {review.updatedAt ? ' · edited' : ''}
            </span>
          </div>
        </div>
        {!compact && review.helpful.length > 0 && (
          <span className="tabular flex shrink-0 items-center gap-1 pt-0.5 text-[12.5px] text-muted-2" title="People who found this review helpful">
            <ThumbsUp className="size-3.5" aria-hidden /> {review.helpful.length}
          </span>
        )}
      </header>

      <p className={cn('mt-2.5 whitespace-pre-line text-sm leading-relaxed text-ink-2', compact && 'line-clamp-2')}>{review.text}</p>

      {!compact && review.photos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {review.photos.map((src, i) => (
            <li key={i}>
              <img src={src} alt={`Photo ${i + 1} from ${review.userName}'s review`} className="size-20 rounded-xl border border-line object-cover" loading="lazy" />
            </li>
          ))}
        </ul>
      )}

      {review.reply && !composing && (
        <div className={cn('mt-3 flex gap-2.5 rounded-xl bg-bg-2 p-3', compact && 'hidden')}>
          <CornerDownRight className="mt-0.5 size-4 shrink-0 text-muted-2" aria-hidden />
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-muted-2">
              Reply from {review.reply.by} · {timeAgo(review.reply.at)}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink">{review.reply.text}</p>
          </div>
        </div>
      )}

      {compact && review.reply && <p className="mt-1.5 text-[12.5px] text-muted-2">You replied {timeAgo(review.reply.at)}.</p>}

      {!compact && composing && (
        <div className="mt-3">
          <label htmlFor={`${id}-reply`} className="mb-1.5 block text-[13px] font-medium text-ink-2">
            Your public reply
          </label>
          <Textarea
            id={`${id}-reply`}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_REPLY))}
            rows={3}
            autoFocus
            placeholder="Thank them, address what they raised, and keep it short. Everyone can read this."
            className="min-h-[84px]"
          />
          <div className="mt-2 flex items-center gap-2">
            <CharCount value={text} max={MAX_REPLY} />
            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setComposing(false)} disabled={posting}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => void post()} loading={posting} disabled={text.trim().length < 3}>
              {review.reply ? 'Update reply' : 'Post reply'}
            </Button>
          </div>
        </div>
      )}

      {!compact && !composing && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {replyBlocked ? (
            <p className="mr-auto text-[12.5px] text-muted-2">{replyBlocked}</p>
          ) : (
            <Button type="button" variant="soft" size="sm" onClick={openComposer} className="mr-auto">
              {review.reply ? <Pencil /> : <Reply />} {review.reply ? 'Edit reply' : 'Reply'}
            </Button>
          )}
          {onReport && (
            <Button type="button" variant="ghost" size="sm" onClick={onReport}>
              <Flag /> Report
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
