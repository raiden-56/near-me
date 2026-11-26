import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { Input } from '@/components/ui/field';
import { CATEGORIES, GROUPS } from '@/data/categories';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';

/** Searchable category picker, grouped the same way customers browse. One choice. */
export function CategoryPicker({ value, onChange, className }: { value: string; onChange: (categoryId: string) => void; className?: string }) {
  const [query, setQuery] = useState('');
  const disabled = useLocalDb((s) => s.config.disabledCategoryIds);

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    return GROUPS.filter((g) => g.id !== 'safety')
      .map((group) => ({
        group,
        items: CATEGORIES.filter(
          (c) =>
            c.groupId === group.id &&
            // A category an admin switched off stays selectable only if this listing already uses it.
            (!disabled.includes(c.id) || c.id === value) &&
            (!term ||
              c.label.toLowerCase().includes(term) ||
              c.singular.toLowerCase().includes(term) ||
              group.label.toLowerCase().includes(term) ||
              c.keywords.some((k) => k.includes(term))),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [query, disabled, value]);

  return (
    <div className={className}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, e.g. bakery, salon, bike repair" aria-label="Search categories" className="pl-10" />
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-2">
          Nothing matches “{query}”. Try a broader word, or pick the closest category and describe the rest in your description.
        </p>
      ) : (
        <div role="group" aria-label="Business category" className="mt-5 space-y-6">
          {groups.map(({ group, items }) => (
            <div key={group.id}>
              <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
                <Icon name={group.icon} className="size-4 text-muted-2" />
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((c) => {
                  const active = c.id === value;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange(c.id)}
                      className={cn(
                        'flex min-h-[52px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-[border-color,background-color,transform] active:scale-[0.98]',
                        active ? 'border-forest bg-surface font-semibold text-ink shadow-card' : 'border-line bg-surface font-medium text-ink-2 hover:border-line-2 hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      <Icon name={c.icon} className={cn('size-[18px] shrink-0', active ? 'text-brand' : 'text-muted-2')} />
                      <span className="min-w-0 flex-1 leading-tight">{c.singular}</span>
                      {active && <Check className="size-4 shrink-0 text-ink" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
