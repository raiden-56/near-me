import { ArrowUpRight, Navigation } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { PlaceImage } from '@/components/common/PlaceImage';
import { DistanceLabel, OpenStatusLabel, PriceLevel, RatingInline, SaveButton, VerifiedBadge } from '@/components/common/place-bits';
import { Skeleton } from '@/components/ui/controls';
import { CATEGORY_BY_ID, GROUP_BY_ID, TONES } from '@/data/categories';
import { usePlaceStats, useVerifiedListing } from '@/hooks/usePlaces';
import { formatDistance, mapsDirectionsUrl, walkMinutes } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { useLocation } from '@/store/location';
import type { Place, PlaceWithDistance } from '@/types';

type P = Place & { distance?: number };

export const categoryLabel = (place: Place) => {
  const cat = CATEGORY_BY_ID[place.categoryId];
  return place.cuisine?.length ? place.cuisine.slice(0, 2).join(' · ') : (cat?.singular ?? 'Place');
};

const placeHref = (p: Place) => `/place/${p.id}`;

/** Standard vertical card: photo, name, the facts people scan for. */
export const PlaceCard = memo(function PlaceCard({ place, className, eager }: { place: P; className?: string; eager?: boolean }) {
  const stats = usePlaceStats(place);
  const verified = useVerifiedListing(place.id);
  return (
    <Link to={placeHref(place)} className={cn('group block w-[236px] sm:w-[256px]', className)}>
      <div className="relative">
        <PlaceImage place={place} eager={eager} className="aspect-[4/3] rounded-2xl transition-transform duration-500 ease-out group-hover:scale-[1.015]" />
        <SaveButton place={place} className="absolute right-2.5 top-2.5" />
        {verified && <span className="absolute left-2.5 top-2.5 rounded-lg bg-white/92 px-1.5 py-1 backdrop-blur-sm"><VerifiedBadge /></span>}
      </div>
      <div className="px-0.5 pt-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 text-[15px] font-semibold text-ink">{place.name}</h3>
          <RatingInline stats={stats} showCount={false} className="shrink-0 pt-px" />
        </div>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-2">
          {categoryLabel(place)}
          {place.distance != null && <> · {formatDistance(place.distance)}</>}
        </p>
        <div className="mt-1.5 flex items-center gap-2.5">
          <OpenStatusLabel place={place} detail={false} hideUnknown />
          <PriceLevel level={stats.priceLevel} />
        </div>
      </div>
    </Link>
  );
});

/** Large editorial card with the text set over the photograph. */
export const FeaturedPlaceCard = memo(function FeaturedPlaceCard({ place, className, kicker, eager }: { place: P; className?: string; kicker?: string; eager?: boolean }) {
  const stats = usePlaceStats(place);
  return (
    <Link to={placeHref(place)} className={cn('group relative block overflow-hidden rounded-3xl bg-forest', className)}>
      <PlaceImage place={place} large eager={eager} className="absolute inset-0 size-full transition-transform duration-700 ease-out group-hover:scale-[1.03]" iconClassName="size-14" />
      {/* Scrim so white text stays legible on any photo. */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#161a17]/88 via-[#161a17]/25 to-transparent" aria-hidden />
      <SaveButton place={place} className="absolute right-3.5 top-3.5" />
      <div className="relative flex h-full min-h-[300px] flex-col justify-end p-5 text-white sm:min-h-[360px] sm:p-6">
        {kicker && <p className="mb-2 w-fit rounded-md bg-butter px-2 py-0.5 text-[12px] font-semibold text-[#252B26]">{kicker}</p>}
        <h3 className="display text-[26px] sm:text-[32px]">{place.name}</h3>
        <p className="mt-1.5 text-sm text-white/80">
          {categoryLabel(place)}
          {place.distance != null && <> · {formatDistance(place.distance)} away</>}
        </p>
        <div className="mt-3 flex items-center gap-3 text-[13px]">
          {stats.rating && (
            <span className="tabular flex items-center gap-1 font-semibold">
              <span style={{ color: '#F2D98B' }}>★</span> {stats.rating.toFixed(1)}
            </span>
          )}
          <OpenStatusLabel place={place} detail={false} hideUnknown className="[&_span]:!text-white/90" />
          <span className="ml-auto flex items-center gap-1 font-medium opacity-0 transition-opacity group-hover:opacity-100">
            View <ArrowUpRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
});

/** Horizontal row: thumbnail left, details right. Used in lists, search results and map panels. */
export const CompactPlaceCard = memo(function CompactPlaceCard({
  place, className, active, onHover, trailing, showSave = true,
}: {
  place: P;
  className?: string;
  active?: boolean;
  onHover?: (id: string | null) => void;
  trailing?: React.ReactNode;
  showSave?: boolean;
}) {
  const stats = usePlaceStats(place);
  const verified = useVerifiedListing(place.id);
  return (
    <Link
      to={placeHref(place)}
      onMouseEnter={onHover ? () => onHover(place.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      className={cn(
        'group flex gap-3.5 rounded-2xl border bg-surface p-2.5 transition-[border-color,box-shadow] duration-200',
        active ? 'border-brand shadow-lift' : 'border-line hover:border-line-2 hover:shadow-card',
        className,
      )}
    >
      <PlaceImage place={place} className="size-[84px] shrink-0 rounded-xl" iconClassName="size-7" />
      <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
        <div className="flex items-center gap-1.5">
          <h3 className="line-clamp-1 text-[15px] font-semibold text-ink">{place.name}</h3>
          {verified && <VerifiedBadge label={false} />}
        </div>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-2">
          {categoryLabel(place)}
          {place.distance != null && <> · {formatDistance(place.distance)}</>}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <RatingInline stats={stats} />
          <OpenStatusLabel place={place} detail={false} hideUnknown />
          <PriceLevel level={stats.priceLevel} />
        </div>
      </div>
      {trailing ?? (showSave && <SaveButton place={place} variant="plain" className="self-center" />)}
    </Link>
  );
});

/** Image-free card for essentials: what it is, how far, is it open, and one tap to go. */
export const EssentialCard = memo(function EssentialCard({ place, className }: { place: PlaceWithDistance; className?: string }) {
  const here = useLocation((s) => s.coords);
  const cat = CATEGORY_BY_ID[place.categoryId];
  const tone = TONES[GROUP_BY_ID[place.groupId].tone];
  return (
    <div className={cn('card flex w-[220px] flex-col p-4', className)}>
      <div className="flex items-start justify-between">
        <span className={cn('grid size-11 place-items-center rounded-xl', tone.soft)}>
          <Icon name={cat?.icon ?? 'MapPin'} className="size-5" />
        </span>
        <span className="tabular text-right text-[13px] leading-tight text-muted-2">
          <span className="block text-base font-semibold text-ink">{formatDistance(place.distance)}</span>
          {walkMinutes(place.distance)} min walk
        </span>
      </div>
      <Link to={placeHref(place)} className="mt-3.5 block">
        <p className="text-[12.5px] font-medium text-muted-2">{cat?.singular}</p>
        <h3 className="mt-0.5 line-clamp-1 text-[15px] font-semibold text-ink hover:underline">{place.name}</h3>
      </Link>
      <OpenStatusLabel place={place} className="mt-1" />
      <a
        href={mapsDirectionsUrl(place, here)}
        target="_blank"
        rel="noreferrer"
        className="mt-3.5 flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-bg-2 text-[13px] font-medium text-ink transition-colors hover:bg-line"
      >
        <Navigation className="size-3.5" /> Directions
      </a>
    </div>
  );
});

/** Numbered row for ranked lists such as Top Rated. */
export const RankedPlaceRow = memo(function RankedPlaceRow({ place, rank }: { place: P; rank: number }) {
  const stats = usePlaceStats(place);
  return (
    <Link to={placeHref(place)} className="group flex items-center gap-4 py-3.5">
      <span className="display tabular w-7 shrink-0 text-center text-[28px] text-line-2 transition-colors group-hover:text-brand">{rank}</span>
      <PlaceImage place={place} className="size-14 shrink-0 rounded-xl" iconClassName="size-6" />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-1 text-[15px] font-semibold text-ink">{place.name}</h3>
        <p className="line-clamp-1 text-[13px] text-muted-2">
          {categoryLabel(place)}
          {place.distance != null && <> · {formatDistance(place.distance)}</>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <RatingInline stats={stats} showCount={false} className="text-[15px]" />
        {stats.reviewCount > 0 && <p className="tabular text-[12px] text-muted">{stats.reviewCount.toLocaleString('en-IN')} reviews</p>}
      </div>
    </Link>
  );
});

/** Tall portrait card for editorial rows ("Explore this weekend"). */
export const PortraitPlaceCard = memo(function PortraitPlaceCard({ place, note, className }: { place: P; note?: string; className?: string }) {
  return (
    <Link to={placeHref(place)} className={cn('group relative block w-[200px] overflow-hidden rounded-[22px] bg-forest sm:w-[220px]', className)}>
      <PlaceImage place={place} large className="aspect-[3/4] w-full transition-transform duration-700 ease-out group-hover:scale-[1.04]" iconClassName="size-10" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#161a17]/85 via-transparent to-transparent" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        {note && <p className="mb-1 text-[12px] font-medium text-white/75">{note}</p>}
        <h3 className="display-sm line-clamp-2 text-[19px]">{place.name}</h3>
        <DistanceLabel meters={place.distance} className="mt-1 !text-white/75" />
      </div>
    </Link>
  );
});

/* ── Skeletons ──────────────────────────────────────────────────────────── */

export function PlaceCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('w-[236px] sm:w-[256px]', className)}>
      <Skeleton className="aspect-[4/3] rounded-2xl" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3.5 w-1/2" />
    </div>
  );
}

export function CompactCardSkeleton() {
  return (
    <div className="flex gap-3.5 rounded-2xl border border-line bg-surface p-2.5">
      <Skeleton className="size-[84px] shrink-0 rounded-xl" />
      <div className="flex flex-1 flex-col justify-center gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3.5 w-1/3" />
      </div>
    </div>
  );
}
