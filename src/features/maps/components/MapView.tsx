import { GeoJSONSource, Map as MapLibre, Marker, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { MapPinOff } from 'lucide-react';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { CATEGORY_BY_ID, GROUP_BY_ID, TONES } from '@/data/categories';
import { circlePolygon } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { useSettings } from '@/store/settings';
import type { LatLon, Place, ReportView } from '@/types';
import { loadMapStyle, styleFont } from '../lib/mapStyle';
import { loadPins, PIN_PIXEL_RATIO, pinId } from '../lib/pins';

// MapLibre 6 resolves its worker relative to its own module URL, which bundlers rewrite.
// Vite bundles the worker for us and hands back its final URL.
setWorkerUrl(workerUrl);

export interface MapHandle {
  flyTo: (point: LatLon, zoom?: number) => void;
  fitRadius: (center: LatLon, radius: number) => void;
  fitRoute: (line: GeoJSON.LineString) => void;
  zoomBy: (delta: number) => void;
  getCenter: () => LatLon | null;
}

interface MapViewProps {
  ref?: Ref<MapHandle>;
  center: LatLon;
  zoom?: number;
  places: Place[];
  selectedId?: string | null;
  highlightedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** The user's actual position (GPS). Drawn as a pulsing dot. */
  userLocation?: LatLon | null;
  /** Search radius ring around `radiusCenter`. */
  radius?: number;
  radiusCenter?: LatLon;
  reports?: ReportView[];
  onSelectReport?: (report: ReportView) => void;
  route?: GeoJSON.LineString | null;
  /** Fired after the user pans or zooms (not for programmatic moves). */
  onUserMove?: (center: LatLon, zoom: number) => void;
  /** Bottom padding in px for camera moves, so sheets do not cover the target. */
  bottomInset?: number;
  interactive?: boolean;
  className?: string;
  label?: string;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const LEVEL_COLOR: Record<ReportView['level'], string> = { good: '#4C8B5A', moderate: '#B9852C', bad: '#B4524A', info: '#6C6F68' };

const toFeatures = (places: Place[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: places.map((p) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    properties: { id: p.id, name: p.hasName ? p.name : '', icon: pinId(p.categoryId) },
  })),
});

function selectedElement(place: Place): HTMLElement {
  const tone = TONES[GROUP_BY_ID[CATEGORY_BY_ID[place.categoryId]?.groupId ?? 'daily'].tone];
  const el = document.createElement('div');
  el.className = 'nm-pin';
  el.innerHTML = `<div style="position:relative;display:grid;place-items:center;width:46px;height:46px;animation:nm-pop .32s cubic-bezier(.22,1.4,.36,1)">
    <span style="position:absolute;inset:6px;border-radius:999px;background:${tone.hex};opacity:.28;animation:var(--animate-ring)"></span>
    <span style="position:relative;width:26px;height:26px;border-radius:999px;background:${tone.hex};border:4px solid #fff;box-shadow:0 4px 14px rgb(37 43 38 / .4)"></span>
  </div>`;
  return el;
}

/**
 * The map surface. Owns the MapLibre instance and keeps it in sync with React props; everything
 * around it (controls, cards, sheets) is ordinary React rendered on top by the page.
 */
export function MapView({
  ref, center, zoom = 14, places, selectedId, highlightedId, onSelect, userLocation, radius, radiusCenter, reports, onSelectReport, route, onUserMove,
  bottomInset = 0, interactive = true, className, label = 'Map of nearby places',
}: MapViewProps) {
  const theme = useSettings((s) => s.theme);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Latest props for use inside long-lived map callbacks.
  const latest = useRef({ places, onSelect, onUserMove, onSelectReport, bottomInset });
  latest.current = { places, onSelect, onUserMove, onSelectReport, bottomInset };

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (p, z) => mapRef.current?.flyTo({ center: [p.lon, p.lat], zoom: z ?? Math.max(mapRef.current.getZoom(), 15), padding: { bottom: latest.current.bottomInset, top: 0, left: 0, right: 0 }, duration: 900, essential: false }),
      fitRadius: (c, r) => {
        const ring = circlePolygon(c, r, 8).geometry.coordinates[0]!;
        const lons = ring.map((x) => x[0]!);
        const lats = ring.map((x) => x[1]!);
        mapRef.current?.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: { top: 70, bottom: 40 + latest.current.bottomInset, left: 30, right: 30 }, duration: 700 });
      },
      fitRoute: (line) => {
        const lons = line.coordinates.map((x) => x[0]!);
        const lats = line.coordinates.map((x) => x[1]!);
        mapRef.current?.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: { top: 90, bottom: 60 + latest.current.bottomInset, left: 50, right: 50 }, duration: 800 });
      },
      zoomBy: (d) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: 280 }),
      getCenter: () => {
        const c = mapRef.current?.getCenter();
        return c ? { lat: c.lat, lon: c.lng } : null;
      },
    }),
    [],
  );

  /* ── Create the map (once per theme) ─────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    let map: MapLibre | null = null;
    setReady(false);
    setFailed(false);

    void (async () => {
      let style: StyleSpecification;
      try {
        style = await loadMapStyle(theme);
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled || !container.current) return;

      map = new MapLibre({
        container: container.current,
        style,
        center: [center.lon, center.lat],
        zoom,
        minZoom: 3,
        maxZoom: 19,
        attributionControl: { compact: true },
        interactive,
        dragRotate: false,
        pitchWithRotate: false,
        fadeDuration: 150,
      });
      map.touchZoomRotate?.disableRotation();
      mapRef.current = map;
      const font = styleFont(style, true);

      map.on('load', async () => {
        if (cancelled || !map) return;
        // Start with the attribution collapsed to its "i" button so it never covers controls on a phone.
        const attribution = container.current?.querySelector('.maplibregl-ctrl-attrib');
        attribution?.classList.remove('maplibregl-compact-show');
        attribution?.removeAttribute('open');
        try {
          for (const pin of await loadPins()) if (!map.hasImage(pin.id)) map.addImage(pin.id, pin.data, { pixelRatio: PIN_PIXEL_RATIO });
        } catch {
          /* pins are decorative: clusters and circles still work without them */
        }
        if (cancelled) return;

        map.addSource('radius', { type: 'geojson', data: EMPTY });
        map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#E97845', 'fill-opacity': 0.05 } });
        map.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#E97845', 'line-opacity': 0.55, 'line-width': 1.5, 'line-dasharray': [3, 3] } });

        map.addSource('route', { type: 'geojson', data: EMPTY });
        map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8 } });
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#252B26', 'line-width': 4.5 } });

        map.addSource('places', { type: 'geojson', data: toFeatures(latest.current.places), cluster: true, clusterRadius: 44, clusterMaxZoom: 15 });
        map.addLayer({
          id: 'clusters', type: 'circle', source: 'places', filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#252B26',
            'circle-radius': ['step', ['get', 'point_count'], 15, 12, 18, 40, 22, 120, 27],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3,
            'circle-opacity': 0.94,
          },
        });
        map.addLayer({
          id: 'cluster-count', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': font, 'text-size': 12.5, 'text-allow-overlap': true },
          paint: { 'text-color': '#ffffff' },
        });
        map.addLayer({
          id: 'place-pins', type: 'symbol', source: 'places', filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-allow-overlap': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.72, 16, 1],
            'text-field': ['step', ['zoom'], '', 15.6, ['get', 'name']],
            'text-font': font,
            'text-size': 11.5,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-optional': true,
            'text-max-width': 9,
          },
          paint: { 'text-color': theme === 'dark' ? '#F1EFE8' : '#353B36', 'text-halo-color': theme === 'dark' ? '#151916' : '#F5F3ED', 'text-halo-width': 1.5 },
        });

        map.on('click', 'place-pins', (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) latest.current.onSelect?.(id);
        });
        map.on('click', 'clusters', async (e) => {
          const feature = e.features?.[0];
          const clusterId = feature?.properties?.cluster_id as number | undefined;
          if (clusterId == null || !map) return;
          const source = map.getSource('places') as GeoJSONSource;
          const target = await source.getClusterExpansionZoom(clusterId);
          const [lng, lat] = (feature!.geometry as GeoJSON.Point).coordinates as [number, number];
          map.easeTo({ center: [lng, lat], zoom: Math.min(target + 0.4, 18), duration: 450 });
        });
        map.on('click', (e) => {
          if (!map!.queryRenderedFeatures(e.point, { layers: ['place-pins', 'clusters'] }).length) latest.current.onSelect?.(null);
        });
        for (const layer of ['place-pins', 'clusters']) {
          map.on('mouseenter', layer, () => (map!.getCanvas().style.cursor = 'pointer'));
          map.on('mouseleave', layer, () => (map!.getCanvas().style.cursor = ''));
        }
        map.on('moveend', (e) => {
          // Only react to gestures: programmatic camera moves carry no original event.
          if (!(e as { originalEvent?: unknown }).originalEvent || !map) return;
          const c = map.getCenter();
          latest.current.onUserMove?.({ lat: c.lat, lon: c.lng }, map.getZoom());
        });

        setReady(true);
      });

      map.on('error', (e) => {
        // Missing tiles while offline are expected; only a style that never loads is fatal.
        if (!map?.isStyleLoaded() && /style|Failed to fetch/i.test(String(e.error?.message ?? ''))) setFailed(true);
      });
    })();

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    if (container.current) ro.observe(container.current);

    return () => {
      cancelled = true;
      ro.disconnect();
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once per theme; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, interactive]);

  /* ── Keep sources in sync ─────────────────────────────────────────── */
  useEffect(() => {
    if (ready) (mapRef.current?.getSource('places') as GeoJSONSource | undefined)?.setData(toFeatures(places));
  }, [places, ready]);

  useEffect(() => {
    if (!ready) return;
    const data = radius && radiusCenter ? { type: 'FeatureCollection' as const, features: [circlePolygon(radiusCenter, radius)] } : EMPTY;
    (mapRef.current?.getSource('radius') as GeoJSONSource | undefined)?.setData(data);
  }, [radius, radiusCenter?.lat, radiusCenter?.lon, ready]);

  useEffect(() => {
    if (!ready) return;
    const data: GeoJSON.FeatureCollection = route ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: route }] } : EMPTY;
    (mapRef.current?.getSource('route') as GeoJSONSource | undefined)?.setData(data);
  }, [route, ready]);

  /* ── HTML markers: user, selection, hover, live updates ───────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !userLocation) return;
    const el = document.createElement('div');
    el.className = 'nm-user-dot';
    el.setAttribute('aria-label', 'Your location');
    const marker = new Marker({ element: el }).setLngLat([userLocation.lon, userLocation.lat]).addTo(map);
    return () => void marker.remove();
  }, [userLocation?.lat, userLocation?.lon, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const place = selectedId ? places.find((p) => p.id === selectedId) : undefined;
    if (!ready || !map || !place) return;
    const marker = new Marker({ element: selectedElement(place) }).setLngLat([place.lon, place.lat]).addTo(map);
    return () => void marker.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const place = highlightedId && highlightedId !== selectedId ? places.find((p) => p.id === highlightedId) : undefined;
    if (!ready || !map || !place) return;
    const el = document.createElement('div');
    el.style.cssText = 'width:38px;height:38px;border-radius:999px;border:3px solid #E97845;background:rgb(233 120 69 / .18);pointer-events:none';
    const marker = new Marker({ element: el }).setLngLat([place.lon, place.lat]).addTo(map);
    return () => void marker.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedId, selectedId, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !reports?.length) return;
    const markers = reports.slice(0, 30).map((r) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'nm-live-dot';
      el.style.background = LEVEL_COLOR[r.level];
      el.style.cursor = 'pointer';
      el.setAttribute('aria-label', `Live update: ${r.title}`);
      el.title = r.title;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        latest.current.onSelectReport?.(r);
      });
      // Offset so a place's live dot sits on the shoulder of its pin instead of hiding it.
      return new Marker({ element: el, offset: r.placeId ? [13, -13] : [0, 0] }).setLngLat([r.lon, r.lat]).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [reports, ready]);

  return (
    <div className={cn('relative size-full overflow-hidden bg-bg-2', className)}>
      <style>{'@keyframes nm-pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}'}</style>
      {/* MapLibre forces `position: relative` on its container, so size it explicitly rather than with inset. */}
      <div ref={container} className="size-full" role="application" aria-label={label} />
      {!ready && !failed && <div className="skeleton absolute inset-0 rounded-none" aria-hidden />}
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-bg-2 p-6 text-center">
          <div>
            <MapPinOff className="mx-auto size-8 text-muted-2" strokeWidth={1.5} aria-hidden />
            <p className="display-sm mt-3 text-lg text-ink">The map could not load</p>
            <p className="mt-1 max-w-xs text-sm text-muted-2">Check your connection. You can still browse every result in the list view.</p>
          </div>
        </div>
      )}
    </div>
  );
}
