import { env } from '@/lib/env';
import { fetchJson } from '@/lib/http';
import type { LatLon, RouteResult, TravelMode } from '@/types';

interface OsrmStep {
  distance: number;
  name: string;
  maneuver: { type: string; modifier?: string };
}

interface OsrmResponse {
  code: string;
  message?: string;
  routes?: { distance: number; duration: number; geometry: GeoJSON.LineString; legs: { steps: OsrmStep[] }[] }[];
}

function instruction(step: OsrmStep): string {
  const { type, modifier } = step.maneuver;
  const road = step.name ? ` onto ${step.name}` : '';
  switch (type) {
    case 'depart':
      return `Head out${step.name ? ` on ${step.name}` : ''}`;
    case 'arrive':
      return 'You have arrived';
    case 'roundabout':
    case 'rotary':
      return `Take the roundabout${road}`;
    case 'merge':
      return `Merge${road}`;
    case 'fork':
      return `Keep ${modifier?.includes('left') ? 'left' : 'right'}${road}`;
    case 'end of road':
      return `At the end of the road turn ${modifier ?? 'ahead'}${road}`;
    case 'continue':
    case 'new name':
      return `Continue${step.name ? ` on ${step.name}` : ' straight'}`;
    default:
      if (modifier === 'straight') return `Continue straight${road}`;
      if (modifier === 'uturn') return 'Make a U-turn';
      return modifier ? `Turn ${modifier}${road}` : `Continue${road}`;
  }
}

/** Typical urban speeds, used to keep estimates realistic where the public router is optimistic. */
const SPEED_FLOOR_KMH: Record<TravelMode, number> = { car: 0, bike: 0, foot: 0 };

export const routingService = {
  async route(from: LatLon, to: LatLon, mode: TravelMode = 'car', signal?: AbortSignal): Promise<RouteResult> {
    const base = env.osrmUrl.replace('{profile}', mode);
    const coords = `${from.lon.toFixed(6)},${from.lat.toFixed(6)};${to.lon.toFixed(6)},${to.lat.toFixed(6)}`;
    const json = await fetchJson<OsrmResponse>(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`, {
      timeoutMs: 12000,
      signal,
    });
    const route = json.routes?.[0];
    if (json.code !== 'Ok' || !route) throw new Error(json.message ?? 'No route found between these points.');
    const floor = SPEED_FLOOR_KMH[mode];
    return {
      mode,
      distance: route.distance,
      duration: floor ? Math.max(route.duration, (route.distance / 1000 / floor) * 3600) : route.duration,
      geometry: route.geometry,
      steps: route.legs
        .flatMap((l) => l.steps)
        .filter((s) => s.distance > 0 || s.maneuver.type === 'arrive')
        .map((s) => ({ instruction: instruction(s), distance: s.distance, name: s.name })),
    };
  },
};
