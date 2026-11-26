import { useEffect, useRef, useState } from 'react';
import { CATEGORY_BY_ID, GROUP_BY_ID, TONES } from '@/data/categories';
import { usePlaceCover } from '@/hooks/usePlaces';
import { canLoadImage, IMAGE_TIMEOUT_MS, isRemoteImage, reportImage } from '@/lib/imageHealth';
import { cn, hash } from '@/lib/utils';
import type { Place, PlacePhoto } from '@/types';
import { Icon } from './Icon';

/**
 * Designed cover used when no photograph is available: the category colour, a soft contour
 * pattern unique to the place, and the category icon. Never a grey placeholder box.
 */
export function CategoryCover({ categoryId, seed, className, iconClassName }: { categoryId: string; seed: string; className?: string; iconClassName?: string }) {
  const cat = CATEGORY_BY_ID[categoryId];
  const tone = TONES[GROUP_BY_ID[cat?.groupId ?? 'daily'].tone];
  const h = hash(seed);
  const x = 20 + (h % 60);
  const y = 15 + ((h >> 8) % 70);
  return (
    <div
      className={cn('relative grid place-items-center overflow-hidden', className)}
      style={{
        backgroundColor: tone.softHex,
        backgroundImage: `repeating-radial-gradient(circle at ${x}% ${y}%, transparent 0 13px, ${tone.hex}14 13px 14px)`,
      }}
      aria-hidden
    >
      <Icon name={cat?.icon ?? 'MapPin'} className={cn('size-9', iconClassName)} style={{ color: tone.hex }} strokeWidth={1.5} />
    </div>
  );
}

interface PhotoProps {
  photo: PlacePhoto | null;
  alt: string;
  categoryId: string;
  seed: string;
  className?: string;
  large?: boolean;
  eager?: boolean;
  iconClassName?: string;
}

/** Photo with a gentle reveal on load and a designed fallback when it is missing or fails. */
export function Photo({ photo, alt, categoryId, seed, className, large, eager, iconClassName }: PhotoProps) {
  const src = photo ? (large ? photo.url : photo.thumbUrl) : null;
  // Decided once per source: if the photo host is currently refusing requests, do not even try.
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(() => (src && canLoadImage(src) ? 'loading' : 'failed'));
  const img = useRef<HTMLImageElement>(null);
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setState(src && canLoadImage(src) ? 'loading' : 'failed');
  }

  // A throttled image can hang rather than fail. Give it a deadline, counted only once the
  // browser has actually started fetching it (lazy images below the fold do not count).
  // Bundled photos come from the app itself and need no deadline.
  useEffect(() => {
    if (state !== 'loading' || !src || !isRemoteImage(src)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(() => {
        // A hidden tab does not fetch lazy images at all: that is not the host being slow.
        if (document.hidden) return arm();
        reportImage(src, false);
        setState('failed');
      }, IMAGE_TIMEOUT_MS);
    };
    const el = img.current;
    if (eager || !el || !('IntersectionObserver' in window)) {
      arm();
      return () => clearTimeout(timer);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          io.disconnect();
          arm();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [state, src, eager]);

  if (!src || state === 'failed') return <CategoryCover categoryId={categoryId} seed={seed} className={className} iconClassName={iconClassName} />;

  return (
    <div className={cn('relative overflow-hidden bg-bg-2', className)}>
      {state === 'loading' && <div className="skeleton absolute inset-0 rounded-none" />}
      <img
        ref={img}
        key={src}
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => {
          reportImage(src, true);
          setState('ready');
        }}
        onError={() => {
          reportImage(src, false);
          setState('failed');
        }}
        className={cn('size-full object-cover transition-[opacity,transform] duration-700 ease-out', state === 'ready' ? 'scale-100 opacity-100' : 'scale-[1.04] opacity-0')}
      />
    </div>
  );
}

export function PlaceImage({ place, className, large, eager, iconClassName }: { place: Place; className?: string; large?: boolean; eager?: boolean; iconClassName?: string }) {
  const cover = usePlaceCover(place);
  return <Photo photo={cover} alt={cover?.kind === 'illustrative' ? '' : place.name} categoryId={place.categoryId} seed={place.id} className={className} large={large} eager={eager} iconClassName={iconClassName} />;
}
