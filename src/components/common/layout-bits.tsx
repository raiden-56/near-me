import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';

/** Standard page width and gutters. `wide` is for map-like or dashboard pages. */
export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('mx-auto w-full px-4 pb-8 sm:px-6 lg:px-10', wide ? 'max-w-[1400px]' : 'max-w-[1180px]', className)}>{children}</div>;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Where the back arrow goes. Omit to step back in history; pass false to hide it. */
  back?: string | false;
  actions?: ReactNode;
  className?: string;
  eyebrow?: string;
}

/** Title block for inner pages: back arrow on phones, editorial heading on every size. */
export function PageHeader({ title, subtitle, back, actions, className, eyebrow }: PageHeaderProps) {
  const navigate = useNavigate();
  const goBack = () => (typeof back === 'string' ? navigate(back) : window.history.length > 1 ? navigate(-1) : navigate('/'));
  return (
    <header className={cn('flex items-start gap-3 pb-5 pt-4 lg:pt-8', className)}>
      {back !== false && (
        <button type="button" onClick={goBack} aria-label="Go back" className="-ml-1.5 mt-0.5 grid size-10 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink">
          <ArrowLeft className="size-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="mb-1 text-[13px] font-medium text-brand-ink">{eyebrow}</p>}
        <h1 className="display text-[28px] text-ink sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-muted-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
    </header>
  );
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, href, linkLabel = 'See all', action, className }: SectionHeaderProps) {
  return (
    <div className={cn('mb-3.5 flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="display-sm text-[22px] text-ink sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-2">{subtitle}</p>}
      </div>
      {action ??
        (href && (
          <Link to={href} className="group flex shrink-0 items-center gap-1 pb-0.5 text-[13px] font-medium text-brand-ink">
            {linkLabel}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ))}
    </div>
  );
}

/** Horizontal scroller: swipe on touch, arrow buttons on pointer devices. Bleeds to the page edge on phones. */
export function ScrollRow({ children, className, innerClassName, label }: { children: ReactNode; className?: string; innerClassName?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);

  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <div className={cn('group/row relative', className)}>
      <div ref={ref} onScroll={update} aria-label={label} className={cn('scroll-row -mx-4 gap-3.5 px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0', innerClassName)}>
        {children}
      </div>
      {(['start', 'end'] as const).map((side) => (
        <button
          key={side}
          type="button"
          aria-label={side === 'start' ? 'Scroll back' : 'Scroll forward'}
          onClick={() => scroll(side === 'start' ? -1 : 1)}
          className={cn(
            'absolute top-[38%] z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-ink shadow-lift transition-opacity duration-200 hover:bg-surface-2 lg:grid',
            side === 'start' ? '-left-4' : '-right-4',
            edges[side] ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover/row:opacity-100',
          )}
        >
          {side === 'start' ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
        </button>
      ))}
    </div>
  );
}

/** Fade-and-rise when a block scrolls into view. Runs once; skipped for reduced motion. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered entrance for a small set of children (category tiles, quick actions). */
export const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } } },
  item: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } },
};
