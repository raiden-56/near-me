import { BadgeCheck, Bookmark, Navigation, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, type MouseEvent } from 'react';
import { useIsSaved, useToggleSaved } from '@/hooks/useSaved';
import { formatDistance } from '@/lib/geo';
import { getOpenStatus } from '@/lib/openingHours';
import { cn, compactNumber } from '@/lib/utils';
import type { OpenStatus, Place, PlaceStats } from '@/types';

export function RatingStars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-px', className)} role="img" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-line-2" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="text-butter-ink dark:text-butter" style={{ width: size, height: size, color: '#D9A521' }} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Compact "4.4 (238)" rating. Renders nothing when a place has no ratings yet. */
export function RatingInline({ stats, className, showCount = true }: { stats: PlaceStats; className?: string; showCount?: boolean }) {
  if (!stats.rating) return null;
  return (
    <span className={cn('tabular inline-flex items-center gap-1 text-[13px] font-semibold text-ink', className)} title={stats.isSample ? 'Sample rating' : undefined}>
      <Star className="size-3.5" style={{ color: '#D9A521' }} fill="currentColor" strokeWidth={0} aria-hidden />
      {stats.rating.toFixed(1)}
      {showCount && stats.reviewCount > 0 && <span className="font-normal text-muted">({compactNumber(stats.reviewCount)})</span>}
    </span>
  );
}

export function PriceLevel({ level, className }: { level: number | null; className?: string }) {
  if (!level) return null;
  return (
    <span className={cn('text-[13px] tracking-tight', className)} aria-label={`Price level ${level} of 4`}>
      <span className="text-ink-2">{'₹'.repeat(level)}</span>
      <span className="text-line-2">{'₹'.repeat(4 - level)}</span>
    </span>
  );
}

const STATE_STYLE: Record<OpenStatus['state'], string> = {
  open: 'text-success',
  closing_soon: 'text-warning',
  closed: 'text-danger',
  unknown: 'text-muted',
};

export function useOpenStatus(place: Pick<Place, 'openingHours'>): OpenStatus {
  // Recomputed at most once a minute per render pass; cheap enough to do inline.
  const minute = Math.floor(Date.now() / 60_000);
  return useMemo(() => getOpenStatus(place.openingHours), [place.openingHours, minute]);
}

export function OpenStatusLabel({ place, detail = true, className, hideUnknown }: { place: Pick<Place, 'openingHours'>; detail?: boolean; className?: string; hideUnknown?: boolean }) {
  const status = useOpenStatus(place);
  if (status.state === 'unknown' && hideUnknown) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px]', className)}>
      {status.state !== 'unknown' && <span className={cn('size-1.5 rounded-full bg-current', STATE_STYLE[status.state])} aria-hidden />}
      <span className={cn('font-medium', STATE_STYLE[status.state])}>{status.label}</span>
      {detail && status.detail && <span className="text-muted-2">· {status.detail}</span>}
    </span>
  );
}

export function DistanceLabel({ meters, className, icon }: { meters: number | undefined; className?: string; icon?: boolean }) {
  if (meters == null) return null;
  return (
    <span className={cn('tabular inline-flex items-center gap-1 text-[13px] text-muted-2', className)}>
      {icon && <Navigation className="size-3" aria-hidden />}
      {formatDistance(meters)}
    </span>
  );
}

export function VerifiedBadge({ className, label = true }: { className?: string; label?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[12.5px] font-medium text-success', className)} title="This business has been verified by NearMe">
      <BadgeCheck className="size-4" aria-hidden />
      {label && 'Verified'}
    </span>
  );
}

interface SaveButtonProps {
  place: Place;
  variant?: 'overlay' | 'plain' | 'button';
  className?: string;
  onSaved?: () => void;
}

export function SaveButton({ place, variant = 'overlay', className, onSaved }: SaveButtonProps) {
  const saved = useIsSaved(place.id);
  const toggle = useToggleSaved(place, onSaved);
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void toggle();
  };
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.86 }}
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${place.name} from saved` : `Save ${place.name}`}
      className={cn(
        'grid shrink-0 place-items-center transition-colors',
        variant === 'overlay' && 'size-9 rounded-full bg-white/92 text-[#252B26] shadow-card backdrop-blur-sm hover:bg-white',
        variant === 'plain' && 'size-9 rounded-full text-muted-2 hover:bg-bg-2 hover:text-ink',
        variant === 'button' && 'h-11 gap-2 rounded-xl border border-line-2 bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2 flex items-center',
        className,
      )}
    >
      <motion.span key={String(saved)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 18 }} className="grid place-items-center">
        <Bookmark className={cn('size-[18px]', saved && 'text-brand')} fill={saved ? 'currentColor' : 'none'} strokeWidth={1.9} aria-hidden />
      </motion.span>
      {variant === 'button' && (saved ? 'Saved' : 'Save')}
    </motion.button>
  );
}
