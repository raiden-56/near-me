import { Map as MapIcon, MapPinOff, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { CATEGORY_BY_ID, categoriesIn, GROUP_BY_ID, TONES } from '@/data/categories';
import { NotFound } from '@/app/router/RouteStates';
import { FilterBar, FilterControls } from '@/features/search/components/Filters';
import { ResultsList } from '@/features/search/components/ResultsList';
import { usePlaceResults } from '@/features/search/hooks/useSearch';
import { formatRadius } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { DEFAULT_FILTERS, type SearchFilters } from '@/services/search';
import { useLocation } from '@/store/location';
import { useUi } from '@/store/ui';

/** Categories where price and rating filters do not apply. */
const UTILITY = new Set(['atms', 'parking', 'public-toilets', 'courier', 'police', 'fire-stations', 'banks', 'ev-charging']);

export default function CategoryPage() {
  const { id = '' } = useParams();
  const category = CATEGORY_BY_ID[id];
  const radius = useLocation((s) => s.radius);
  const area = useLocation((s) => s.area);
  const openReport = useUi((s) => s.openReport);
  const [filters, setFilters] = useState<SearchFilters>({ ...DEFAULT_FILTERS, sort: 'distance', radius });
  const res = usePlaceResults({ categoryIds: category ? [category.id] : undefined, filters, enabled: Boolean(category) });

  if (!category) return <NotFound />;
  const group = GROUP_BY_ID[category.groupId];
  const tone = TONES[group.tone];
  const utility = UTILITY.has(category.id);
  const siblings = categoriesIn(category.groupId).filter((c) => c.id !== category.id);
  const flags = { showPrice: !utility, showRating: !utility };

  return (
    <Page>
      <PageHeader
        eyebrow={group.label}
        title={category.label}
        subtitle={res.isLoading ? `Looking around ${area}…` : `${res.results.length.toLocaleString('en-IN')} within ${formatRadius(filters.radius)} of ${area}`}
        back="/categories"
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to={`/map?cat=${category.id}`}>
              <MapIcon /> <span className="hidden sm:inline">View on map</span>
              <span className="sm:hidden">Map</span>
            </Link>
          </Button>
        }
      />

      <div className="lg:grid lg:grid-cols-[250px_1fr] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-[92px] space-y-5">
            <div className="rounded-2xl border border-line bg-surface p-5">
              <FilterControls filters={filters} onChange={setFilters} {...flags} />
            </div>
            <nav aria-label={`More in ${group.label}`} className="rounded-2xl border border-line bg-surface p-3">
              <p className="px-2 pb-1.5 pt-1 text-[13px] font-semibold text-ink">More in {group.label}</p>
              {siblings.map((c) => (
                <Link key={c.id} to={`/category/${c.id}`} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink">
                  <Icon name={c.icon} className="size-4" /> {c.label}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          <FilterBar filters={filters} onChange={setFilters} className="pb-3" {...flags} />

          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:hidden">
            {siblings.map((c) => (
              <Link key={c.id} to={`/category/${c.id}`} className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium', tone.soft)}>
                <Icon name={c.icon} className="size-4" /> {c.label}
              </Link>
            ))}
          </div>

          <div className="space-y-2.5 pb-3">
            {filters.openNow && res.hiddenUnknownHours > 0 && <Notice>{res.hiddenUnknownHours} without listed hours hidden while “Open now” is on.</Notice>}
            {res.truncated && <Notice>Showing {category.label.toLowerCase()} within {formatRadius(res.coveredRadius)}.</Notice>}
          </div>

          {res.isError ? (
            <ErrorState error={res.error} onRetry={() => void res.refetch()} />
          ) : !res.isLoading && res.results.length === 0 ? (
            <EmptyState
              icon={MapPinOff}
              title={res.total > 0 ? 'Nothing matches these filters' : `No ${category.label.toLowerCase()} mapped within ${formatRadius(filters.radius)}`}
              description={res.total > 0 ? 'Loosen the filters to see more.' : 'NearMe uses OpenStreetMap, where some kinds of services are not mapped everywhere yet. Widen the distance, or add one you know.'}
              action={
                <>
                  {res.total > 0 ? (
                    <Button onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: 'distance', radius: filters.radius })}>Clear filters</Button>
                  ) : (
                    <Button onClick={() => setFilters({ ...filters, radius: Math.min(10000, Math.max(filters.radius * 2.5, 5000)) })}>Search wider</Button>
                  )}
                  <Button variant="secondary" asChild>
                    <Link to={`/contribute?kind=add&category=${category.id}`}>
                      <Plus /> Add a place
                    </Link>
                  </Button>
                </>
              }
            />
          ) : (
            <ResultsList places={res.results} loading={res.isLoading} columns={2} />
          )}

          {!res.isLoading && res.results.length > 0 && (
            <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl bg-sage/55 p-5 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-ink-2">
                <span className="font-semibold text-ink">Been to one of these just now?</span> A quick update about the queue or availability helps the next person decide.
              </p>
              <Button size="sm" onClick={() => openReport()}>
                <Plus /> Share an update
              </Button>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
