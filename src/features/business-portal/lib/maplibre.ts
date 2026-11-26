import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre 6 resolves its worker relative to its own module URL, which bundlers rewrite.
// Vite bundles the worker and hands back its final URL (the consumer map does the same).
setWorkerUrl(workerUrl);

/**
 * The pieces of MapLibre the portal needs. Imported dynamically by the location form, so the
 * library is only downloaded when a map is actually shown and a failure to load it is recoverable.
 */
export { MapLibreMap, Marker, NavigationControl };
