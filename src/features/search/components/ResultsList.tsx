import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { CompactCardSkeleton, CompactPlaceCard } from '@/features/businesses/components/PlaceCards';
import { cn } from '@/lib/utils';
import type { PlaceWithDistance } from '@/types';

const PAGE = 18;

/**
 * Results rendered in pages as the user scrolls. Hundreds of places can match a wide search;
 * mounting them all at once would be slow on a phone.
 */
export function ResultsList({
  places, loading, className, columns = 2, activeId, onHover,
}: {
  places: PlaceWithDistance[];
  loading?: boolean;
  className?: string;
  columns?: 1 | 2 | 3;
  activeId?: string | null;
  onHover?: (id: string | null) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const signature = places.length ? `${places[0]!.id}:${places.length}` : 'empty';

  useEffect(() => setShown(PAGE), [signature]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && setShown((n) => n + PAGE), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [signature, shown >= places.length]);

  const grid = cn('grid gap-3', columns === 2 && 'md:grid-cols-2', columns === 3 && 'md:grid-cols-2 xl:grid-cols-3', className);

  if (loading) {
    return (
      <div className={grid} aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <CompactCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className={grid}>
        {places.slice(0, shown).map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(i % PAGE, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}>
            <CompactPlaceCard place={p} active={activeId === p.id} onHover={onHover} />
          </motion.div>
        ))}
      </div>
      {shown < places.length && <div ref={sentinel} className="h-10" aria-hidden />}
    </>
  );
}
