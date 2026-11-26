import { LayoutGrid, List, Map as MapIcon, MapPinOff, RefreshCw, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { Chip } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/sheet';
import { browsableGroups, CATEGORY_BY_ID, categoriesIn } from '@/data/categories';
import { LiveUpdateCard } from '@/features/community/components/LiveUpdateCard';
import { FilterBar } from '@/features/search/components/Filters';
import { ResultsList } from '@/features/search/components/ResultsList';
import { usePlaceResults } from '@/features/search/hooks/useSearch';
import { useLiveFeed } from '@/hooks/useCommunity';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { usePlace } from '@/hooks/usePlaces';
import { distanceMeters, formatRadius } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { analyticsService } from '@/services/analytics';
import { getKnownPlace } from '@/services/places';
import { DEFAULT_FILTERS, describeIntent, parseIntent, type SearchFilters } from '@/services/search';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import type { LatLon, Place, ReportView } from '@/types';
import { MapControls, PlacePreview, RoutePanel, useRoute } from '../components/MapOverlays';
import { MapView, type MapHandle } from '../components/MapView';

const QUICK_CATEGORIES = ['restaurants', 'cafes', 'medical-stores', 'petrol-pumps', 'atms', 'supermarkets', 'hospitals', 'parking', 'ev-charging', 'parks', 'gyms'];
const zoomForRadius = (r: number) => 14.75 - Math.log2(r / 1000);

export default function MapPage() {
  const [params, setParams] = useSearchParams();
  const desktop = useIsDesktop();
  const mapRef = useRef<MapHandle>(null);

  const { coords: here, source, status, radius: preferredRadius, area, locate } = useLocation();
  const mode = useSettings((s) => s.travelMode);

  const urlPoint = useMemo<LatLon | null>(() => {
    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    return params.has('lat') && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    // Only read on first render: afterwards the map owns its centre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [center, setCenter] = useState<LatLon>(urlPoint ?? here);
  const [following, setFollowing] = useState(!urlPoint);
  const [pending, setPending] = useState<LatLon | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('place'));
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [showLive, setShowLive] = useState(true);
  const [allCats, setAllCats] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportView | null>(null);
  const [routeTo, setRouteTo] = useState<Place | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({ ...DEFAULT_FILTERS, radius: preferredRadius, sort: params.get('near') ? 'distance' : 'relevance' });

  const cat = params.get('cat') ?? '';
  const q = params.get('q') ?? '';
  const category = CATEGORY_BY_ID[cat];
  const intent = useMemo(() => (q && !category ? parseIntent(q) : undefined), [q, category]);

  // Keep the search centred on the user until they explicitly search another area.
  useEffect(() => {
    if (following) setCenter(here);
  }, [following, here]);

  const res = usePlaceResults({ categoryIds: category ? [category.id] : undefined, intent, filters, center });
  const live = useLiveFeed({ center, radius: Math.max(filters.radius, 2000) });
  const liveReports = useMemo(() => live.reports.filter((r) => r.freshness !== 'expired' && distanceMeters(center, r) <= filters.radius * 1.2), [live.reports, center, filters.radius]);
  const reportByPlace = useMemo(() => new Map(liveReports.filter((r) => r.placeId).map((r) => [r.placeId!, r])), [liveReports]);

  // A place opened by link may not be in memory yet: load it by id.
  const linked = usePlace(selectedId ?? undefined);
  const selected = useMemo<(Place & { distance?: number }) | undefined>(() => {
    if (!selectedId) return undefined;
    const hit = res.results.find((p) => p.id === selectedId);
    if (hit) return hit;
    const known = getKnownPlace(selectedId) ?? linked.place;
    return known ? { ...known, distance: distanceMeters(here, known) } : undefined;
  }, [selectedId, res.results, here, linked.place]);

  // "Directions" on a place page arrives here with ?route=1.
  const wantsRoute = useRef(params.get('route') === '1');
  useEffect(() => {
    if (wantsRoute.current && selected) {
      wantsRoute.current = false;
      setRouteTo(selected);
    }
  }, [selected]);

  // Markers: the result set, plus the selected place if a filter would otherwise hide it.
  const markerPlaces = useMemo<Place[]>(() => (selected && !res.results.some((p) => p.id === selected.id) ? [...res.results, selected] : res.results), [res.results, selected]);

  const route = useRoute(here, routeTo, mode);
  useEffect(() => {
    if (route.data) mapRef.current?.fitRoute(route.data.geometry);
  }, [route.data]);

  // Frame the search area whenever it changes.
  const frameKey = `${center.lat.toFixed(4)},${center.lon.toFixed(4)},${filters.radius}`;
  useEffect(() => {
    const t = setTimeout(() => !routeTo && mapRef.current?.fitRadius(center, filters.radius), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  const select = useCallback(
    (id: string | null, fly = false) => {
      setSelectedId(id);
      if (!id) return;
      const place = res.results.find((p) => p.id === id) ?? getKnownPlace(id);
      if (place && fly) mapRef.current?.flyTo(place, 16);
      setView('map');
    },
    [res.results],
  );

  const setCategory = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('cat', id);
    else next.delete('cat');
    next.delete('q');
    setParams(next, { replace: true });
    setSelectedId(null);
    setAllCats(false);
  };

  const searchHere = () => {
    if (!pending) return;
    setFollowing(false);
    setCenter(pending);
    setPending(null);
    setSelectedId(null);
  };

  const goToMe = async () => {
    if (source !== 'gps') {
      const ok = await locate();
      if (!ok) return;
    }
    setFollowing(true);
    setPending(null);
    const now = useLocation.getState().coords;
    setCenter(now);
    mapRef.current?.flyTo(now, 15.5);
  };

  const startDirections = (place: Place) => {
    analyticsService.track(place.id, 'direction');
    setRouteTo(place);
  };

  const title = category?.label ?? (intent ? describeIntent(intent) : 'Everything nearby');
  const countLabel = res.isLoading ? 'Looking…' : `${res.results.length.toLocaleString('en-IN')} place${res.results.length === 1 ? '' : 's'} within ${formatRadius(filters.radius)}`;

  const categoryChips = (
    <div className="no-scrollbar flex gap-2 overflow-x-auto">
      <Chip active={!category && !q} onClick={() => setCategory('')}>
        All
      </Chip>
      {q && !category && (
        <Chip active onClick={() => setCategory('')}>
          <Search /> “{q}”
        </Chip>
      )}
      {category && !QUICK_CATEGORIES.includes(category.id) && (
        <Chip active>
          <Icon name={category.icon} /> {category.label}
        </Chip>
      )}
      {QUICK_CATEGORIES.map((id) => {
        const c = CATEGORY_BY_ID[id]!;
        return (
          <Chip key={id} active={cat === id} onClick={() => setCategory(cat === id ? '' : id)}>
            <Icon name={c.icon} /> {c.label}
          </Chip>
        );
      })}
      <Chip onClick={() => setAllCats(true)}>
        <LayoutGrid /> More
      </Chip>
    </div>
  );

  const listBody = res.isError ? (
    <ErrorState error={res.error} onRetry={() => void res.refetch()} compact />
  ) : !res.isLoading && res.results.length === 0 ? (
    <EmptyState
      compact
      icon={MapPinOff}
      title="Nothing found in this area"
      description={res.total > 0 ? 'Places here are hidden by your filters.' : 'Try a wider radius, another category, or move the map and search that area.'}
      action={
        <button type="button" onClick={() => setFilters({ ...DEFAULT_FILTERS, radius: Math.min(10000, filters.radius * 2.5) })} className="text-sm font-semibold text-brand-ink hover:underline">
          Search wider
        </button>
      }
    />
  ) : (
    <ResultsList places={res.results} loading={res.isLoading} columns={1} activeId={selectedId} onHover={desktop ? setHoverId : undefined} />
  );

  const listHeader = (
    <div className="space-y-3">
      <div>
        <h1 className="display-sm text-[22px] text-ink">{title}</h1>
        <p className="text-[13px] text-muted-2">
          {countLabel}
          {!following && ' of the area you searched'}
        </p>
      </div>
      {categoryChips}
      <FilterBar filters={filters} onChange={setFilters} className="!mx-0 !px-0" />
      {res.truncated && <Notice>Showing places within {formatRadius(res.coveredRadius)}. Choose a category for full results further out.</Notice>}
    </div>
  );

  return (
    <div className="relative h-full overflow-hidden lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      {/* Desktop: results panel beside the map */}
      <aside className="hidden h-full min-h-0 flex-col border-r border-line bg-bg lg:flex">
        <div className="border-b border-line p-5 pb-4">{listHeader}</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{listBody}</div>
      </aside>

      <div className="relative h-full min-h-0">
        <MapView
          ref={mapRef}
          center={center}
          zoom={zoomForRadius(filters.radius)}
          places={markerPlaces}
          selectedId={selectedId}
          highlightedId={hoverId}
          onSelect={(id) => select(id)}
          userLocation={source === 'gps' ? here : null}
          radius={filters.radius}
          radiusCenter={center}
          reports={showLive ? liveReports : undefined}
          onSelectReport={(r) => (r.placeId ? select(r.placeId, true) : setActiveReport(r))}
          route={routeTo ? (route.data?.geometry ?? null) : null}
          onUserMove={(c) => setPending(distanceMeters(c, center) > Math.max(250, filters.radius * 0.35) ? c : null)}
          bottomInset={!desktop && selected ? 230 : 0}
        />

        {/* Phone: search and category chips over the map */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2.5 bg-gradient-to-b from-bg/85 to-transparent p-3 pb-6 lg:hidden">
          <Link to={`/search${q ? `?q=${encodeURIComponent(q)}` : ''}`} className="pointer-events-auto flex h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-[15px] text-muted shadow-lift">
            <Search className="size-[18px] text-ink-2" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{q || `Search around ${area}`}</span>
          </Link>
          <div className="pointer-events-auto">{categoryChips}</div>
        </div>

        {/* "Search this area" after the map is moved */}
        <AnimatePresence>
          {pending && !routeTo && (
            <motion.button
              type="button"
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              onClick={searchHere}
              className="absolute left-1/2 top-[124px] z-10 flex h-10 -translate-x-1/2 items-center gap-2 rounded-full bg-forest px-4 text-[13px] font-semibold text-on-forest shadow-float lg:top-4"
            >
              <RefreshCw className="size-4" /> Search this area
            </motion.button>
          )}
        </AnimatePresence>

        <MapControls
          className={cn('absolute right-3 z-10 transition-[bottom] duration-300', selected && !desktop ? 'bottom-[250px]' : 'bottom-[76px]', 'lg:bottom-6 lg:right-5')}
          onZoom={(d) => mapRef.current?.zoomBy(d)}
          onLocate={goToMe}
          locating={status === 'locating'}
          live={showLive}
          onToggleLive={() => setShowLive((v) => !v)}
        />

        {/* Route panel */}
        <AnimatePresence>
          {routeTo && (
            <RoutePanel
              to={routeTo}
              route={route}
              onClose={() => {
                setRouteTo(null);
                mapRef.current?.fitRadius(center, filters.radius);
              }}
              className="absolute inset-x-3 top-3 z-20 lg:left-5 lg:right-auto lg:top-5 lg:w-[360px]"
            />
          )}
        </AnimatePresence>

        {/* Selected place */}
        <AnimatePresence>
          {selected && !routeTo && (
            <PlacePreview
              place={selected}
              report={reportByPlace.get(selected.id)}
              onClose={() => setSelectedId(null)}
              onDirections={() => startDirections(selected)}
              className="absolute inset-x-3 bottom-3 z-20 lg:bottom-6 lg:left-5 lg:right-auto lg:w-[400px]"
            />
          )}
        </AnimatePresence>

        {/* Phone: map / list switch */}
        {!selected && !routeTo && (
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 lg:hidden">
            <Segmented
              aria-label="View"
              className="shadow-float ring-1 ring-line"
              value={view}
              onChange={setView}
              options={[
                { value: 'map', label: 'Map', icon: <MapIcon /> },
                { value: 'list', label: `List${res.results.length ? ` · ${res.results.length}` : ''}`, icon: <List /> },
              ]}
            />
          </div>
        )}

        {/* Phone: list view of the same results */}
        <AnimatePresence>
          {view === 'list' && !desktop && (
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.22 }} className="absolute inset-0 z-[15] overflow-y-auto bg-bg px-4 pb-24 pt-4">
              {listHeader}
              <div className="pt-4">{listBody}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* All categories */}
      <Sheet open={allCats} onOpenChange={setAllCats} title="Show on the map" description="Pick one category to focus the map." size="lg">
        <div className="space-y-6">
          {browsableGroups.map((g) => (
            <section key={g.id}>
              <h3 className="mb-2 text-[13px] font-semibold text-ink-2">{g.label}</h3>
              <div className="flex flex-wrap gap-2">
                {categoriesIn(g.id).map((c) => (
                  <Chip key={c.id} active={cat === c.id} onClick={() => setCategory(c.id)}>
                    <Icon name={c.icon} /> {c.label}
                  </Chip>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Sheet>

      {/* Area-level live update (traffic, outage …) picked on the map */}
      <Sheet open={Boolean(activeReport)} onOpenChange={(o) => !o && setActiveReport(null)} title="Live update" size="sm" hideTitle>
        {activeReport && <LiveUpdateCard report={activeReport} className="border-0 p-0 shadow-none" />}
      </Sheet>
    </div>
  );
}
