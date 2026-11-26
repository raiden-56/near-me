import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpLeft, Clock, History, Map as MapIcon, MapPin, Mic, Search, SearchX, TrendingUp, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@/components/common/Icon';
import { Page } from '@/components/common/layout-bits';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { Badge, Chip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CATEGORY_BY_ID, HOME_CATEGORY_IDS } from '@/data/categories';
import { useDebounced } from '@/hooks/useDebounced';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { formatDistance, formatRadius, distanceMeters } from '@/lib/geo';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { geocodingService } from '@/services/geocoding';
import { DEFAULT_FILTERS, describeIntent, localSuggestions, parseIntent, popularSearches, RELATED_LABELS, type SearchFilters, type SortKey } from '@/services/search';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { FilterBar, FilterControls } from '../components/Filters';
import { ResultsList } from '../components/ResultsList';
import { usePlaceResults } from '../hooks/useSearch';

function useFiltersFromUrl(): [SearchFilters, (f: SearchFilters) => void] {
  const [params] = useSearchParams();
  const radius = useLocation((s) => s.radius);
  const [filters, setFilters] = useState<SearchFilters>(() => ({
    ...DEFAULT_FILTERS,
    radius,
    openNow: params.get('open') === '1',
    sort: (['relevance', 'distance', 'rating', 'price'] as SortKey[]).includes(params.get('sort') as SortKey) ? (params.get('sort') as SortKey) : 'relevance',
  }));
  return [filters, setFilters];
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const browseAll = !q && (params.get('open') === '1' || params.has('sort'));
  const [text, setText] = useState(q);
  const [focused, setFocused] = useState(!q && !browseAll);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(text, 280);

  const here = useLocation((s) => s.coords);
  const area = useLocation((s) => s.area);
  const setManual = useLocation((s) => s.setManual);
  const online = useUi((s) => s.online);
  const { recentSearches, addSearch, removeSearch, clearSearches } = useSettings();
  const [filters, setFilters] = useFiltersFromUrl();

  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (!q && !browseAll) inputRef.current?.focus();
  }, [q, browseAll]);

  const submit = (value: string) => {
    const query = value.trim();
    if (!query) return;
    addSearch(query);
    setText(query);
    setFocused(false);
    inputRef.current?.blur();
    const next = new URLSearchParams(params);
    next.set('q', query);
    setParams(next, { replace: Boolean(q) });
  };

  const voice = useVoiceSearch((spoken) => submit(spoken));
  useEffect(() => {
    if (voice.error) {
      toast.error(voice.error);
      voice.clearError();
    }
  }, [voice]);
  const onMic = () => {
    if (!voice.supported) return toast('Voice search is not available in this browser', { description: 'Try Chrome, Edge or Safari, or type your search instead.' });
    if (voice.listening) voice.stop();
    else voice.start();
  };

  /* ── Suggestions while typing ─────────────────────────────────────── */
  const showSuggestions = focused && text.trim() !== q.trim();
  const local = useMemo(() => localSuggestions(text, recentSearches), [text, recentSearches]);
  const remote = useQuery({
    queryKey: ['search-suggest', debounced.trim().toLowerCase(), Math.round(here.lat * 20), Math.round(here.lon * 20)],
    queryFn: ({ signal }) => geocodingService.search(debounced, here, 5, signal),
    enabled: showSuggestions && online && debounced.trim().length >= 3,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const landmarks = (remote.data ?? []).filter((r) => distanceMeters(here, r) < 80_000).slice(0, 4);

  /* ── Results ──────────────────────────────────────────────────────── */
  const intent = useMemo(() => parseIntent(q), [q]);
  // Apply what the query asked for ("open now", "cheap", "best") to the filters once per query.
  useEffect(() => {
    if (!q) return;
    setFilters({
      ...filters,
      openNow: intent.openNow || filters.openNow,
      available: intent.availableNow || intent.lowQueue,
      // "near me" needs no special sort: relevance already weighs distance heavily.
      sort: intent.topRated ? 'rating' : intent.cheap ? 'price' : 'relevance',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = Boolean(q) || browseAll;
  const res = usePlaceResults({ intent: q ? intent : undefined, filters, enabled: active });
  const related = intent.categoryIds.slice(1).map((id) => RELATED_LABELS[id] ?? CATEGORY_BY_ID[id]?.label).filter(Boolean);
  const mapHref = `/map?${new URLSearchParams({ ...(intent.categoryIds[0] ? { cat: intent.categoryIds[0] } : {}), ...(q ? { q } : {}) }).toString()}`;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(text);
  };

  return (
    <Page>
      {/* Search field */}
      <div className="sticky top-0 z-10 -mx-4 bg-bg/92 px-4 pb-3 pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-[68px] lg:mx-0 lg:px-0 lg:pt-6">
        <form onSubmit={onSubmit} role="search" className="flex items-center gap-2">
          <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Go back" className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-bg-2 lg:hidden">
            <ArrowLeft className="size-5" />
          </button>
          <motion.div layout className={cn('relative flex h-[52px] flex-1 items-center rounded-2xl border bg-surface transition-[border-color,box-shadow]', focused ? 'border-brand shadow-lift ring-3 ring-brand/12' : 'border-line-2 shadow-card')}>
            <Search className="ml-4 size-5 shrink-0 text-ink-2" aria-hidden />
            <input
              ref={inputRef}
              value={voice.listening && voice.interim ? voice.interim : text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder={voice.listening ? 'Listening…' : 'What are you looking for?'}
              aria-label="Search places, services and landmarks"
              autoComplete="off"
              enterKeyHint="search"
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-[16px] text-ink outline-none placeholder:text-muted"
            />
            {text && (
              <button type="button" onClick={() => { setText(''); inputRef.current?.focus(); }} aria-label="Clear search" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-2 hover:bg-bg-2">
                <X className="size-[18px]" />
              </button>
            )}
            <button
              type="button"
              onClick={onMic}
              aria-label={voice.listening ? 'Stop listening' : 'Search by voice'}
              aria-pressed={voice.listening}
              className={cn('relative mr-1.5 grid size-10 shrink-0 place-items-center rounded-xl transition-colors', voice.listening ? 'bg-brand text-white' : 'text-ink-2 hover:bg-bg-2')}
            >
              {voice.listening && <span className="absolute inset-0 animate-ping rounded-xl bg-brand/40 motion-reduce:hidden" />}
              <Mic className="relative size-[18px]" />
            </button>
          </motion.div>
          {focused && q && (
            <button type="button" onClick={() => { setText(q); setFocused(false); }} className="shrink-0 px-1 text-sm font-medium text-ink-2">
              Cancel
            </button>
          )}
        </form>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {showSuggestions && text.trim() ? (
          /* ── Typing: suggestions ── */
          <motion.div key="suggest" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="mx-auto max-w-2xl lg:mx-0">
            <ul className="divide-y divide-line">
              <li>
                <button type="button" onClick={() => submit(text)} className="flex w-full items-center gap-3.5 py-3 text-left">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-forest text-on-forest">
                    <Search className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
                    Search for <span className="font-semibold">“{text.trim()}”</span>
                  </span>
                </button>
              </li>
              {local.map((s) => (
                <li key={`${s.kind}-${s.label}`}>
                  <button type="button" onClick={() => submit(s.query)} className="group flex w-full items-center gap-3.5 py-2.5 text-left">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-2 text-ink-2">
                      <Icon name={s.icon} className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{s.label}</span>
                      {s.detail && <span className="block truncate text-[13px] text-muted-2">{s.detail}</span>}
                    </span>
                    <ArrowUpLeft className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </button>
                </li>
              ))}
              {landmarks.map((r) => (
                <li key={r.id}>
                  <div className="flex items-center gap-3.5 py-2.5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sage text-sage-ink">
                      <MapPin className="size-[18px]" />
                    </span>
                    <Link to={r.osmRef && /^[nwr]\d+$/.test(r.osmRef) ? `/place/${r.osmRef}` : `/map?lat=${r.lat}&lon=${r.lon}`} className="min-w-0 flex-1" onClick={() => addSearch(r.name)}>
                      <span className="block truncate text-[15px] font-medium text-ink">{r.name}</span>
                      <span className="block truncate text-[13px] text-muted-2">{[r.kind, r.detail, formatDistance(distanceMeters(here, r))].filter(Boolean).join(' · ')}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setManual({ name: r.name, detail: r.detail, lat: r.lat, lon: r.lon, city: r.city, countryCode: r.countryCode });
                        toast.success(`Now exploring around ${r.name}`);
                        navigate('/');
                      }}
                      className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-brand-ink hover:bg-brand-soft"
                    >
                      Explore here
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {!online && <p className="pt-3 text-[13px] text-muted-2">Landmark suggestions need a connection. Category and recent searches still work.</p>}
          </motion.div>
        ) : !active ? (
          /* ── Idle: history and ideas ── */
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="mx-auto max-w-2xl space-y-8 pt-2 lg:mx-0">
            {recentSearches.length > 0 && (
              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="display-sm text-lg text-ink">Recent searches</h2>
                  <button type="button" onClick={clearSearches} className="text-[13px] font-medium text-muted-2 hover:text-ink">
                    Clear all
                  </button>
                </div>
                <ul>
                  {recentSearches.slice(0, 6).map((r) => (
                    <li key={r} className="flex items-center">
                      <button type="button" onClick={() => submit(r)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
                        <History className="size-[18px] shrink-0 text-muted-2" aria-hidden />
                        <span className="truncate text-[15px] text-ink">{r}</span>
                      </button>
                      <button type="button" onClick={() => removeSearch(r)} aria-label={`Remove ${r} from history`} className="grid size-9 place-items-center rounded-full text-muted hover:bg-bg-2 hover:text-ink">
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="display-sm mb-3 flex items-center gap-2 text-lg text-ink">
                <TrendingUp className="size-[18px] text-brand" aria-hidden /> Popular searches
              </h2>
              <div className="flex flex-wrap gap-2">
                {popularSearches().map((p) => (
                  <Chip key={p} onClick={() => submit(p)}>
                    {p}
                  </Chip>
                ))}
              </div>
            </section>

            <section>
              <h2 className="display-sm mb-3 text-lg text-ink">Browse a category</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {HOME_CATEGORY_IDS.map((id) => {
                  const c = CATEGORY_BY_ID[id]!;
                  return (
                    <Link key={id} to={`/category/${id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2">
                      <span className="grid size-9 place-items-center rounded-lg bg-bg-2 text-ink-2">
                        <Icon name={c.icon} className="size-[18px]" />
                      </span>
                      <span className="text-[15px] font-medium text-ink">{c.label}</span>
                    </Link>
                  );
                })}
              </div>
              <Link to="/categories" className="mt-3 inline-block text-[13px] font-semibold text-brand-ink hover:underline">
                View all categories
              </Link>
            </section>

            <p className="text-[13px] leading-relaxed text-muted-2">
              Try plain language: “medical store open now”, “petrol pump with low queue”, “gym under ₹2000” or “parking near a mall”.
            </p>
          </motion.div>
        ) : (
          /* ── Results ── */
          <motion.div key={`results-${q}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="lg:grid lg:grid-cols-[250px_1fr] lg:gap-10">
            <aside className="hidden lg:block">
              <div className="sticky top-[160px] rounded-2xl border border-line bg-surface p-5">
                <FilterControls filters={filters} onChange={setFilters} />
                <Button variant="ghost" size="sm" className="mt-5 w-full" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
                  Reset filters
                </Button>
              </div>
            </aside>

            <div className="min-w-0">
              <div className="flex items-end justify-between gap-4 pb-3 pt-1">
                <div className="min-w-0">
                  <h1 className="display-sm text-[22px] text-ink sm:text-[26px]">{q ? describeIntent(intent) : filters.openNow ? 'Open right now' : 'Places around you'}</h1>
                  <p className="mt-0.5 text-sm text-muted-2">
                    {res.isLoading ? 'Searching…' : `${res.results.length.toLocaleString('en-IN')} result${res.results.length === 1 ? '' : 's'}`} {res.anchor ? `near ${res.anchor.label}` : `within ${formatRadius(filters.radius)} of ${area}`}
                  </p>
                </div>
                <Button asChild variant="secondary" size="sm" className="shrink-0">
                  <Link to={mapHref}>
                    <MapIcon /> Map
                  </Link>
                </Button>
              </div>

              <FilterBar filters={filters} onChange={setFilters} className="pb-3" />

              <div className="space-y-2.5 pb-3">
                {intent.corrected && (
                  <Notice>
                    Showing results for <span className="font-semibold text-ink">{intent.corrected.to}</span>. You typed “{intent.corrected.from}”.
                  </Notice>
                )}
                {related.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-2">
                    Also showing
                    {related.map((r) => (
                      <Badge key={r} tone="sage">
                        {r}
                      </Badge>
                    ))}
                  </div>
                )}
                {intent.landmark && !res.anchor && !res.isLoading && <Notice tone="warning">We could not find “{intent.landmark}” nearby, so these are results around {area}.</Notice>}
                {filters.openNow && res.hiddenUnknownHours > 0 && (
                  <Notice icon={Clock}>
                    {res.hiddenUnknownHours} more place{res.hiddenUnknownHours === 1 ? ' has' : 's have'} no opening hours listed and {res.hiddenUnknownHours === 1 ? 'is' : 'are'} hidden while “Open now” is on.
                  </Notice>
                )}
                {res.truncated && <Notice>Showing places within {formatRadius(res.coveredRadius)}. Pick a category or a smaller radius for complete results further out.</Notice>}
                {!online && res.fetchedAt > 0 && <Notice>Offline results from {timeAgo(res.fetchedAt)}. Opening status may have changed.</Notice>}
              </div>

              {res.isError ? (
                <ErrorState error={res.error} onRetry={() => void res.refetch()} />
              ) : !res.isLoading && res.results.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title={res.total > 0 ? 'Nothing matches these filters' : `No results for “${q || 'this search'}”`}
                  description={res.total > 0 ? `${res.total} place${res.total === 1 ? '' : 's'} nearby would match with fewer filters.` : 'Check the spelling, widen the distance, or try a category instead. Coverage depends on what has been mapped in OpenStreetMap.'}
                  action={
                    <>
                      {res.total > 0 ? <Button onClick={() => setFilters({ ...DEFAULT_FILTERS, radius: filters.radius })}>Clear filters</Button> : <Button onClick={() => setFilters({ ...filters, radius: Math.min(10000, filters.radius * 2.5) })}>Search wider</Button>}
                      <Button variant="secondary" asChild>
                        <Link to="/contribute?kind=missing">Report a missing place</Link>
                      </Button>
                    </>
                  }
                />
              ) : (
                <ResultsList places={res.results} loading={res.isLoading} columns={2} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}
