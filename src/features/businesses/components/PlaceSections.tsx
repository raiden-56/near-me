import { ChevronDown, Clock, ExternalLink, ImageOff, MapPin, Navigation } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { CategoryCover, Photo } from '@/components/common/PlaceImage';
import { OpenStatusLabel } from '@/components/common/place-bits';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/sheet';
import { formatDistance, walkMinutes } from '@/lib/geo';
import { weekTable } from '@/lib/openingHours';
import { cn } from '@/lib/utils';
import type { Place, PlacePhoto } from '@/types';
import type { FactGroup } from '../lib/placeFacts';

const KIND_LABEL: Record<PlacePhoto['kind'], string | null> = { exact: null, nearby: 'Photo taken nearby', illustrative: 'Illustrative photo' };

/** Cover gallery: swipeable on phones, a mosaic on wide screens. Every photo states what it is. */
export function PlaceGallery({ place, photos, loading }: { place: Place; photos: PlacePhoto[] | undefined; loading: boolean }) {
  const [active, setActive] = useState<PlacePhoto | null>(null);
  const [index, setIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  if (loading) return <Skeleton className="aspect-[16/10] w-full rounded-none sm:rounded-3xl lg:aspect-[21/9]" />;
  if (!photos?.length) return <CategoryCover categoryId={place.categoryId} seed={place.id} className="aspect-[16/10] w-full sm:rounded-3xl lg:aspect-[21/8]" iconClassName="size-16" />;

  const tag = (p: PlacePhoto) =>
    KIND_LABEL[p.kind] && (
      <span className="absolute bottom-2.5 left-2.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">{KIND_LABEL[p.kind]}</span>
    );

  return (
    <>
      {/* Phones and tablets: swipe */}
      <div className="relative lg:hidden">
        <div
          ref={scroller}
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto sm:rounded-3xl"
        >
          {photos.map((p, i) => (
            <button key={p.thumbUrl} type="button" onClick={() => setActive(p)} className="relative aspect-[16/10] w-full shrink-0 snap-center" aria-label={`Open photo ${i + 1} of ${photos.length}`}>
              <Photo photo={p} alt={p.kind === 'exact' ? place.name : ''} categoryId={place.categoryId} seed={place.id} large eager={i === 0} className="size-full" />
              {tag(p)}
            </button>
          ))}
        </div>
        {photos.length > 1 && <span className="tabular absolute bottom-2.5 right-2.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">{index + 1} / {photos.length}</span>}
      </div>

      {/* Desktop: mosaic */}
      <div className={cn('hidden h-[380px] gap-2 overflow-hidden rounded-3xl lg:grid', photos.length >= 3 ? 'grid-cols-[2fr_1fr] grid-rows-2' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
        {photos.slice(0, 3).map((p, i) => (
          <button key={p.thumbUrl} type="button" onClick={() => setActive(p)} className={cn('group relative overflow-hidden', photos.length >= 3 && i === 0 && 'row-span-2')} aria-label={`Open photo ${i + 1}`}>
            <Photo photo={p} alt={p.kind === 'exact' ? place.name : ''} categoryId={place.categoryId} seed={place.id} large eager={i === 0} className="size-full transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
            {tag(p)}
            {i === 2 && photos.length > 3 && <span className="absolute inset-0 grid place-items-center bg-black/45 text-sm font-semibold text-white">+{photos.length - 3} more</span>}
          </button>
        ))}
      </div>

      <Sheet open={Boolean(active)} onOpenChange={(o) => !o && setActive(null)} title={active?.title ?? place.name} size="lg" hideTitle bodyClassName="!px-0 !pb-0">
        {active && (
          <figure>
            <img src={active.url} alt={active.title ?? place.name} className="max-h-[68dvh] w-full bg-bg-2 object-contain" referrerPolicy="no-referrer" />
            <figcaption className="space-y-1 px-5 py-4 text-[13px] text-muted-2">
              {KIND_LABEL[active.kind] && (
                <Badge tone="butter">{active.kind === 'nearby' ? 'Taken near this place, not necessarily of it' : 'Represents this kind of place, not this business'}</Badge>
              )}
              {active.title && <p className="text-sm font-medium text-ink">{active.title}</p>}
              <p>
                {active.credit}
                {active.sourceUrl && (
                  <>
                    {' · '}
                    <a href={active.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-2">
                      Source <ExternalLink className="size-3" />
                    </a>
                  </>
                )}
              </p>
            </figcaption>
          </figure>
        )}
      </Sheet>
    </>
  );
}

/** Today's status with the whole week one tap away. */
export function HoursCard({ place, loading }: { place: Place; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const table = weekTable(place.openingHours);
  return (
    <div className="card p-4">
      <button type="button" onClick={() => table && setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 text-left" disabled={!table}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-2 text-ink-2">
          <Clock className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-muted-2">Opening hours</span>
          {loading && !place.openingHours ? <Skeleton className="mt-1 h-4 w-32" /> : <OpenStatusLabel place={place} className="text-[15px]" />}
        </span>
        {table && <ChevronDown className={cn('size-5 text-muted-2 transition-transform', open && 'rotate-180')} />}
      </button>

      <AnimatePresence initial={false}>
        {open && table && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <table className="mt-3 w-full border-t border-line text-sm">
              <tbody>
                {table.map((d) => (
                  <tr key={d.day} className={cn(d.isToday && 'font-semibold text-ink')}>
                    <th scope="row" className="py-1.5 text-left font-[inherit] text-ink-2">
                      {d.day}
                      {d.isToday && <span className="ml-1.5 text-[11.5px] font-medium text-brand-ink">Today</span>}
                    </th>
                    <td className={cn('tabular py-1.5 text-right', d.closed ? 'text-danger' : 'text-ink-2')}>{d.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      {!table && place.openingHours && <p className="mt-2 border-t border-line pt-2 text-[13px] text-ink-2">As listed: {place.openingHours}</p>}
      {!place.openingHours && !loading && (
        <p className="mt-2 border-t border-line pt-2 text-[13px] text-muted-2">
          Not listed on the map yet.{' '}
          <Link to={`/contribute?kind=edit&place=${place.id}`} className="font-medium text-ink underline underline-offset-2">
            Add the hours
          </Link>
        </p>
      )}
    </div>
  );
}

/** Category-specific facts built from the place's map tags. */
export function FactGroups({ groups }: { groups: FactGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.title}>
          <h3 className="mb-2.5 text-[15px] font-semibold text-ink">{g.title}</h3>
          {g.layout === 'chips' ? (
            <ul className="flex flex-wrap gap-2">
              {g.facts.map((f) => (
                <li key={f.label} className={cn('inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-[13px]', f.tone === 'bad' ? 'border-danger/25 bg-danger-soft text-danger' : f.tone === 'good' ? 'border-line bg-surface text-ink' : 'border-line bg-bg-2 text-ink-2')}>
                  <Icon name={f.icon} className={cn('size-4', f.tone === 'good' && 'text-success')} />
                  {f.label}
                </li>
              ))}
            </ul>
          ) : (
            <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {g.facts.map((f) => (
                <div key={f.label} className="flex items-center gap-3 px-4 py-3">
                  <Icon name={f.icon} className="size-[18px] shrink-0 text-muted-2" />
                  <dt className="w-28 shrink-0 text-[13px] text-muted-2">{f.label}</dt>
                  <dd className="min-w-0 flex-1 text-sm text-ink">
                    {f.href ? (
                      <a href={f.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
                        {f.value} <ExternalLink className="size-3.5" />
                      </a>
                    ) : (
                      f.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </div>
  );
}

/** Address with a small map that only boots when scrolled into view. */
export function LocationCard({ place, distance, map }: { place: Place; distance?: number; map: (visible: boolean) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="card overflow-hidden">
      <div ref={ref} className="relative h-44 bg-bg-2">
        {map(visible)}
        <Link to={`/map?place=${place.id}&lat=${place.lat}&lon=${place.lon}`} className="absolute inset-0" aria-label="Open on the map" />
      </div>
      <div className="flex items-start gap-3 p-4">
        <MapPin className="mt-0.5 size-5 shrink-0 text-muted-2" aria-hidden />
        <div className="min-w-0 flex-1">
          {place.address ? <p className="text-sm text-ink">{place.address}</p> : <p className="text-sm text-muted-2">Street address not listed on the map{place.locality ? ` · ${place.locality}` : ''}.</p>}
          {distance != null && (
            <p className="tabular mt-1 flex items-center gap-1.5 text-[13px] text-muted-2">
              <Navigation className="size-3.5" aria-hidden /> {formatDistance(distance)} away · about {walkMinutes(distance)} min on foot
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function NoPhotosNote() {
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted-2">
      <ImageOff className="size-4" aria-hidden /> No photos of this place yet.
    </p>
  );
}
