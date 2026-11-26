import { ArrowRight, BadgePercent, Clock, LocateFixed, Map as MapIcon, MapPin, Mic, Navigation, Search, Siren, X } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { stagger } from '@/components/common/layout-bits';
import { Button } from '@/components/ui/button';
import { CATEGORY_BY_ID, GROUP_BY_ID, TONES } from '@/data/categories';
import { cn } from '@/lib/utils';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';

/** The prominent "What are you looking for?" entry point. Opens the full search experience. */
export function SmartSearchBar({ className }: { className?: string }) {
  return (
    <Link
      to="/search"
      className={cn(
        'group flex h-14 items-center gap-3 rounded-2xl border border-line-2 bg-surface pl-4 pr-2 shadow-card transition-[border-color,box-shadow] hover:border-muted hover:shadow-lift',
        className,
      )}
    >
      <Search className="size-5 shrink-0 text-ink-2" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[16px] text-muted">What are you looking for?</span>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-2 text-ink-2 transition-colors group-hover:bg-brand-soft group-hover:text-brand-ink" aria-hidden>
        <Mic className="size-[18px]" />
      </span>
    </Link>
  );
}

const QUICK_ACTIONS = [
  { to: '/map?near=1', label: 'Near Me', hint: 'Closest first', icon: Navigation, tile: 'bg-brand text-white', iconWrap: 'bg-white/20' },
  { to: '/search?open=1', label: 'Open Now', hint: 'Serving right now', icon: Clock, tile: 'bg-sage text-sage-ink', iconWrap: 'bg-white/60' },
  { to: '/deals', label: 'Deals', hint: 'Offers nearby', icon: BadgePercent, tile: 'bg-butter text-[#252B26]', iconWrap: 'bg-white/50' },
  { to: '/map', label: 'Explore Map', hint: 'Browse the area', icon: MapIcon, tile: 'bg-forest text-on-forest', iconWrap: 'bg-white/12' },
  { to: '/emergency', label: 'Emergency', hint: 'Help, fast', icon: Siren, tile: 'bg-danger-soft text-danger', iconWrap: 'bg-white/70' },
] as const;

export function QuickActions() {
  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="scroll-row -mx-4 gap-2.5 px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-visible lg:px-0">
      {QUICK_ACTIONS.map((a) => (
        <motion.div key={a.label} variants={stagger.item} className="w-[124px] lg:w-auto">
          <Link to={a.to} className={cn('flex h-[104px] flex-col justify-between rounded-[20px] p-3.5 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97] lg:h-[112px] lg:p-4', a.tile)}>
            <span className={cn('grid size-9 place-items-center rounded-xl', a.iconWrap)}>
              <a.icon className="size-[18px]" strokeWidth={2} aria-hidden />
            </span>
            <span>
              <span className="block text-[15px] font-semibold leading-tight">{a.label}</span>
              <span className="mt-0.5 hidden text-[12.5px] opacity-75 lg:block">{a.hint}</span>
            </span>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function CategoryCard({ categoryId, count, className }: { categoryId: string; count?: number; className?: string }) {
  const cat = CATEGORY_BY_ID[categoryId];
  if (!cat) return null;
  const tone = TONES[GROUP_BY_ID[cat.groupId].tone];
  return (
    <Link to={`/category/${cat.id}`} className={cn('group flex flex-col items-center gap-2 rounded-2xl p-2 text-center transition-colors hover:bg-surface', className)}>
      <span className={cn('grid size-14 place-items-center rounded-[18px] transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-95', tone.soft)}>
        <Icon name={cat.icon} className="size-6" />
      </span>
      <span className="text-[12.5px] font-medium leading-tight text-ink">{cat.label}</span>
      {count != null && <span className="tabular -mt-1.5 text-[11.5px] text-muted">{count} nearby</span>}
    </Link>
  );
}

export function CategoryGrid({ ids, counts }: { ids: readonly string[]; counts?: Record<string, number> }) {
  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-8">
      {ids.map((id) => (
        <motion.div key={id} variants={stagger.item}>
          <CategoryCard categoryId={id} count={counts?.[id]} />
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * First-run invitation to share location, and the fallback messaging when it is denied or
 * unavailable. The app is fully usable either way: this card never blocks anything.
 */
export function LocationPrimer() {
  const { status, source, error, locate } = useLocation();
  const dismissed = useSettings((s) => s.locationPrimerDismissed);
  const set = useSettings((s) => s.set);
  const openPicker = useUi((s) => s.setLocationPicker);

  const problem = status === 'denied' || status === 'unavailable';
  if (source !== 'default' && !problem) return null;
  if (dismissed && !problem) return null;

  return (
    <div className={cn('relative overflow-hidden rounded-3xl border p-5 sm:p-6', problem ? 'border-warning/30 bg-warning-soft' : 'border-line bg-surface shadow-card')}>
      {!problem && (
        <button type="button" onClick={() => set({ locationPrimerDismissed: true })} aria-label="Dismiss" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted-2 hover:bg-bg-2">
          <X className="size-4" />
        </button>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', problem ? 'bg-white/70 text-warning' : 'bg-brand-soft text-brand-ink')}>
          {problem ? <MapPin className="size-6" /> : <LocateFixed className="size-6" />}
        </span>
        <div className="min-w-0 flex-1 pr-6 sm:pr-0">
          <h2 className="display-sm text-xl text-ink">{problem ? (status === 'denied' ? 'Location access is off' : 'We could not find your location') : 'See what is around you'}</h2>
          <p className="mt-1 text-sm text-ink-2">
            {problem
              ? (error ?? 'Choose an area to keep exploring.')
              : 'Share your location for accurate distances and live updates nearby. It stays on this device, and you can always pick an area by hand instead.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {status !== 'denied' && (
            <Button variant="brand" onClick={() => void locate()} loading={status === 'locating'}>
              <LocateFixed /> {problem ? 'Try again' : 'Use my location'}
            </Button>
          )}
          <Button variant="secondary" onClick={() => openPicker(true)}>
            Choose an area
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Small inline link used at the end of horizontal rows. */
export function RowEndLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="group flex w-[150px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-2 text-center text-sm font-medium text-ink-2 transition-colors hover:border-muted hover:text-ink">
      <span className="grid size-11 place-items-center rounded-full bg-bg-2 transition-transform group-hover:translate-x-0.5">
        <ArrowRight className="size-5" />
      </span>
      {label}
    </Link>
  );
}
