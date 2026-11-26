import { ArrowDownUp, Check, Clock, SlidersHorizontal, Star, Zap } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider, Switch } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/sheet';
import { RADIUS_OPTIONS } from '@/features/discovery/components/LocationPicker';
import { formatRadius } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { DEFAULT_FILTERS, type SearchFilters, type SortKey } from '@/services/search';

export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'distance', label: 'Nearest' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price', label: 'Lowest price' },
];

export const countActive = (f: SearchFilters, base = DEFAULT_FILTERS) =>
  Number(f.openNow) + Number(f.available) + Number(f.minRating > 0) + Number(f.price.length > 0) + Number(f.radius !== base.radius) + Number(f.sort !== base.sort);

interface FilterProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  /** Hide controls that make no sense for the current list (e.g. price for ATMs). */
  showPrice?: boolean;
  showRating?: boolean;
  showAvailability?: boolean;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

/** The full set of filter controls. Rendered in a sidebar on desktop and in a sheet on phones. */
export function FilterControls({ filters, onChange, showPrice = true, showRating = true, showAvailability = true }: FilterProps) {
  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });
  const custom = !RADIUS_OPTIONS.includes(filters.radius);
  const [customOpen, setCustomOpen] = useState(custom);

  return (
    <div className="space-y-6">
      <Group title="Sort by">
        <div className="grid grid-cols-2 gap-2">
          {SORTS.filter((s) => showPrice || s.value !== 'price').map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={filters.sort === s.value}
              onClick={() => set({ sort: s.value })}
              className={cn(
                'flex h-10 items-center justify-between rounded-[10px] border px-3 text-[13px] font-medium transition-colors',
                filters.sort === s.value ? 'border-forest bg-forest text-on-forest' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
              )}
            >
              {s.label}
              {filters.sort === s.value && <Check className="size-4" aria-hidden />}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Availability">
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium text-ink">Open now</span>
              <span className="block text-[12.5px] text-muted-2">Only places with listed hours that are open</span>
            </span>
            <Switch checked={filters.openNow} onCheckedChange={(v) => set({ openNow: v })} aria-label="Open now" />
          </label>
          {showAvailability && (
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium text-ink">Available right now</span>
                <span className="block text-[12.5px] text-muted-2">A current live update says it is free or the queue is short</span>
              </span>
              <Switch checked={filters.available} onCheckedChange={(v) => set({ available: v })} aria-label="Available right now" />
            </label>
          )}
        </div>
      </Group>

      <Group title="Distance">
        <div className="flex flex-wrap gap-2">
          {RADIUS_OPTIONS.map((r) => (
            <Chip
              key={r}
              active={filters.radius === r && !customOpen}
              onClick={() => {
                setCustomOpen(false);
                set({ radius: r });
              }}
            >
              {formatRadius(r)}
            </Chip>
          ))}
          <Chip active={customOpen} onClick={() => setCustomOpen(true)}>
            Custom
          </Chip>
        </div>
        {customOpen && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[13px]">
              <span className="text-muted-2">Within</span>
              <span className="tabular font-semibold text-ink">{formatRadius(filters.radius)}</span>
            </div>
            <Slider aria-label="Custom radius" min={300} max={15000} step={100} value={[filters.radius]} onValueChange={([v]) => set({ radius: v ?? filters.radius })} />
          </div>
        )}
      </Group>

      {showRating && (
        <Group title="Rating">
          <div className="flex flex-wrap gap-2">
            {[0, 3.5, 4, 4.5].map((r) => (
              <Chip key={r} active={filters.minRating === r} onClick={() => set({ minRating: r })}>
                {r === 0 ? (
                  'Any'
                ) : (
                  <>
                    <Star className="!size-3.5" fill="#D9A521" strokeWidth={0} /> {r}+
                  </>
                )}
              </Chip>
            ))}
          </div>
        </Group>
      )}

      {showPrice && (
        <Group title="Price">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((level) => {
              const active = filters.price.includes(level);
              return (
                <Chip key={level} active={active} className="flex-1 justify-center" onClick={() => set({ price: active ? filters.price.filter((p) => p !== level) : [...filters.price, level] })} aria-label={`Price level ${level}`}>
                  {'₹'.repeat(level)}
                </Chip>
              );
            })}
          </div>
        </Group>
      )}
    </div>
  );
}

/** Horizontal quick filters plus a button that opens everything in a sheet. */
export function FilterBar({ filters, onChange, className, ...flags }: FilterProps & { className?: string }) {
  const [open, setOpen] = useState(false);
  const active = countActive(filters);
  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });
  const nextSort = () => {
    const list = SORTS.filter((s) => flags.showPrice !== false || s.value !== 'price');
    set({ sort: list[(list.findIndex((s) => s.value === filters.sort) + 1) % list.length]!.value });
  };

  return (
    <>
      <div className={cn('no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0', className)}>
        <Chip active={active > 0} onClick={() => setOpen(true)} className="lg:hidden">
          <SlidersHorizontal /> Filters{active > 0 && <span className="tabular">· {active}</span>}
        </Chip>
        <Chip active={filters.openNow} onClick={() => set({ openNow: !filters.openNow })}>
          <Clock /> Open now
        </Chip>
        <Chip onClick={nextSort} active={filters.sort !== 'relevance'}>
          <ArrowDownUp /> {SORTS.find((s) => s.value === filters.sort)!.label}
        </Chip>
        {flags.showAvailability !== false && (
          <Chip active={filters.available} onClick={() => set({ available: !filters.available })}>
            <Zap /> Available now
          </Chip>
        )}
        {flags.showRating !== false && (
          <Chip active={filters.minRating >= 4} onClick={() => set({ minRating: filters.minRating >= 4 ? 0 : 4 })}>
            <Star /> 4.0+
          </Chip>
        )}
        {RADIUS_OPTIONS.slice(0, 4).map((r) => (
          <Chip key={r} active={filters.radius === r} onClick={() => set({ radius: r })}>
            {formatRadius(r)}
          </Chip>
        ))}
      </div>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Filters"
        size="sm"
        footer={
          <div className="flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
              Reset
            </Button>
            <Button className="flex-[2]" onClick={() => setOpen(false)}>
              Show results
            </Button>
          </div>
        }
      >
        <FilterControls filters={filters} onChange={onChange} {...flags} />
      </Sheet>
    </>
  );
}
