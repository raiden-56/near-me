import { Lightbulb, RotateCcw, SearchX, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { EmptyState, Notice } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { CATEGORIES, GROUPS, TONES } from '@/data/categories';
import { cn } from '@/lib/utils';
import { effectiveFeaturedIds } from '@/services/admin';
import type { AdminConfig, Category, CategoryGroup, PlaceSuggestion, TagRule } from '@/types';
import { SuggestionList } from '../components/SuggestionList';
import { AdminPage, FilterSelect, Panel, QueryState, SearchField, Toolbar } from '../components/kit';
import { useCategoryMutations, useConfig, useSuggestions } from '../hooks';

type Show = 'all' | 'off' | 'featured';
const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: 'all', label: 'All categories' },
  { value: 'off', label: 'Switched off' },
  { value: 'featured', label: 'Featured' },
];

const VALUE_PREVIEW = 5;

/** One OSM tag rule, written the way mappers write tags: key=value. Read-only. */
function Rule({ rule }: { rule: TagRule }) {
  const [expanded, setExpanded] = useState(false);
  const [key, values, extra] = rule;
  const list = values === '*' ? ['*'] : values;
  const shown = expanded ? list : list.slice(0, VALUE_PREVIEW);
  const hidden = list.length - shown.length;
  return (
    <li className="font-mono text-[12px] leading-relaxed text-ink-2">
      <span className="text-ink">{key}</span>
      <span className="text-muted">=</span>
      {values === '*' ? <span title="Any value">*</span> : shown.join(' | ')}
      {hidden > 0 && (
        <button type="button" onClick={() => setExpanded(true)} className="ml-1.5 rounded font-sans text-[12px] font-medium text-brand-ink hover:underline">
          and {hidden} more
        </button>
      )}
      {extra &&
        Object.entries(extra).map(([k, v]) => (
          <span key={k} className="block pl-3 text-muted-2">
            only when <span className="text-ink">{k}</span>
            <span className="text-muted">=</span>
            {v.slice(0, VALUE_PREVIEW).join(' | ')}
            {v.length > VALUE_PREVIEW && <span title={v.join(', ')}> … ({v.length} values)</span>}
          </span>
        ))}
    </li>
  );
}

function CategoryRow({ category, enabled, featured }: { category: Category; enabled: boolean; featured: boolean }) {
  const { setEnabled, setFeatured } = useCategoryMutations();
  return (
    <li className={cn('grid gap-x-5 gap-y-3 px-5 py-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] md:items-start', !enabled && 'bg-surface-2/60')}>
      <div className="min-w-0">
        <p className={cn('text-[15px] font-semibold', enabled ? 'text-ink' : 'text-muted-2')}>{category.label}</p>
        <p className="text-[12.5px] text-muted-2">Shown as “{category.singular}”</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {!enabled && <Badge tone="danger">Switched off</Badge>}
          {category.nameless && (
            <span title="Places without a name are still listed, for example ATMs and toilets">
              <Badge tone="outline">Lists unnamed places</Badge>
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-1 text-[12.5px] text-muted-2">OpenStreetMap tags</p>
        <ul className="space-y-0.5 break-words">
          {category.rules.map((rule, i) => (
            <Rule key={i} rule={rule} />
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-3 md:justify-end">
        <button
          type="button"
          aria-pressed={featured}
          disabled={setFeatured.isPending}
          onClick={() => setFeatured.mutate({ id: category.id, featured: !featured })}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-colors disabled:opacity-60',
            featured ? 'border-butter bg-butter-soft text-butter-ink' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
          )}
        >
          <Star className="size-4" fill={featured ? 'currentColor' : 'none'} strokeWidth={1.75} aria-hidden />
          <span>
            {featured ? 'Featured' : 'Feature'}
            <span className="sr-only"> {category.label}</span>
          </span>
        </button>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <Switch checked={enabled} disabled={setEnabled.isPending} onCheckedChange={(on) => setEnabled.mutate({ id: category.id, enabled: on })} aria-label={`Show ${category.label} in NearMe`} />
          <span className="w-7" aria-hidden>
            {enabled ? 'On' : 'Off'}
          </span>
        </label>
      </div>
    </li>
  );
}

function GroupSection({ group, categories, config, featuredIds }: { group: CategoryGroup; categories: Category[]; config: AdminConfig; featuredIds: string[] }) {
  const tone = TONES[group.tone];
  const off = categories.filter((c) => config.disabledCategoryIds.includes(c.id)).length;
  return (
    <section aria-labelledby={`group-${group.id}`} className="card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line bg-surface-2/60 px-5 py-3.5">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone.soft)}>
          <Icon name={group.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`group-${group.id}`} className="display-sm text-[19px] text-ink">
            {group.label}
          </h2>
          <p className="truncate text-[13px] text-muted-2">{group.blurb}</p>
        </div>
        <p className="tabular shrink-0 text-right text-[12.5px] text-muted-2">
          {categories.length} {categories.length === 1 ? 'category' : 'categories'}
          {off > 0 && <span className="block text-danger">{off} off</span>}
        </p>
      </header>
      <ul className="divide-y divide-line">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} enabled={!config.disabledCategoryIds.includes(c.id)} featured={featuredIds.includes(c.id)} />
        ))}
      </ul>
    </section>
  );
}

function CategoriesBody({ config, suggestions }: { config: AdminConfig; suggestions: PlaceSuggestion[] }) {
  const { resetFeatured } = useCategoryMutations();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('all');
  const featuredIds = useMemo(() => effectiveFeaturedIds(config), [config]);
  const customFeatured = config.featuredCategoryIds.length > 0;

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CATEGORIES.filter((c) => {
      if (show === 'off' && !config.disabledCategoryIds.includes(c.id)) return false;
      if (show === 'featured' && !featuredIds.includes(c.id)) return false;
      if (!needle) return true;
      return (
        c.label.toLowerCase().includes(needle) ||
        c.singular.toLowerCase().includes(needle) ||
        c.keywords.some((k) => k.includes(needle)) ||
        c.rules.some(([key, values]) => key.includes(needle) || (values !== '*' && values.some((v) => v.includes(needle))))
      );
    });
  }, [q, show, config.disabledCategoryIds, featuredIds]);

  const pending = suggestions.filter((s) => s.status === 'pending');
  const decided = suggestions.filter((s) => s.status !== 'pending').slice(0, 5);
  const offCount = CATEGORIES.filter((c) => config.disabledCategoryIds.includes(c.id)).length;

  return (
    <div className="space-y-4">
      <Panel
        title="Category suggestions"
        subtitle={pending.length ? `${pending.length} waiting for a decision` : 'Ideas for new categories sent in by the community'}
        bodyClassName="px-5 pb-4 pt-3"
      >
        {pending.length ? (
          <SuggestionList suggestions={pending} />
        ) : (
          <p className="flex items-center gap-2.5 rounded-xl border border-dashed border-line-2 px-3.5 py-3 text-sm text-muted-2">
            <Lightbulb className="size-4 shrink-0" strokeWidth={1.75} aria-hidden /> No category suggestions are waiting.
          </p>
        )}
        {decided.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer rounded text-[13px] font-medium text-ink-2 hover:text-ink">Recently decided ({decided.length})</summary>
            <div className="mt-2">
              <SuggestionList suggestions={decided} />
            </div>
          </details>
        )}
        <p className="mt-3 text-[12.5px] text-muted-2">
          Approving records the decision and credits the contributor. The category itself is added to the taxonomy in a release, with its OpenStreetMap tag rules.
        </p>
      </Panel>

      <div>
        <Toolbar className="mb-3">
          <SearchField value={q} onChange={setQ} placeholder="Search categories or OSM tags" label="Search categories" />
          <FilterSelect label="Show" value={show} onChange={setShow} options={SHOW_OPTIONS} />
          <p className="tabular col-span-2 text-[13px] text-muted-2 md:ml-auto">
            {CATEGORIES.length} categories · {offCount} switched off · {featuredIds.length} featured
          </p>
        </Toolbar>

        <Notice className="mb-4" action={customFeatured ? (
          <Button variant="ghost" size="sm" loading={resetFeatured.isPending} onClick={() => resetFeatured.mutate()} className="-my-1 shrink-0">
            <RotateCcw /> Use defaults
          </Button>
        ) : undefined}>
          Switching a category off removes its places from discovery, search and the map straight away. Featured categories are the curated picks;{' '}
          {customFeatured ? 'you have customised the list.' : 'the taxonomy defaults apply until you change one.'}
        </Notice>

        {matches.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={SearchX}
              title="No categories match"
              description="Try a different search, or show all categories."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ('');
                    setShow('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            {GROUPS.map((group) => {
              const categories = matches.filter((c) => c.groupId === group.id);
              return categories.length ? <GroupSection key={group.id} group={group} categories={categories} config={config} featuredIds={featuredIds} /> : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  const config = useConfig();
  const suggestions = useSuggestions('category');
  return (
    <AdminPage title="Categories" subtitle="The taxonomy that turns OpenStreetMap tags into NearMe categories. Tag rules are read-only here.">
      <QueryState query={config}>{(cfg) => <CategoriesBody config={cfg} suggestions={suggestions.data ?? []} />}</QueryState>
    </AdminPage>
  );
}
