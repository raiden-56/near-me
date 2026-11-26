/**
 * Circuit breaker for remote images. Photo hosts rate-limit hot-linking (Wikimedia answers 429
 * when one network asks for too many thumbnails), and a rate-limited image can hang for a long
 * time before it fails. When a host keeps failing we stop asking it for a few minutes and show
 * the designed cover straight away, instead of leaving cards on a loading shimmer.
 */

const FAILURES_TO_OPEN = 4;
const OPEN_MS = 3 * 60_000;
/** How long a single image may take before it counts as failed. */
export const IMAGE_TIMEOUT_MS = 8000;

interface HostState {
  failures: number;
  blockedUntil: number;
}

const hosts = new Map<string, HostState>();

const hostOf = (url: string): string | null => {
  try {
    const u = new URL(url, window.location.href);
    // Images served by the app itself (or inlined) are never throttled.
    return u.origin === window.location.origin || u.protocol === 'data:' || u.protocol === 'blob:' ? null : u.host;
  } catch {
    return null;
  }
};

/** True for images served by another host: the only ones that can be throttled or hang. */
export const isRemoteImage = (url: string): boolean => hostOf(url) !== null;

export function canLoadImage(url: string): boolean {
  const host = hostOf(url);
  if (!host) return true;
  const state = hosts.get(host);
  return !state || Date.now() >= state.blockedUntil;
}

export function reportImage(url: string, ok: boolean) {
  const host = hostOf(url);
  if (!host) return;
  const state = hosts.get(host) ?? { failures: 0, blockedUntil: 0 };
  if (ok) {
    state.failures = 0;
    state.blockedUntil = 0;
  } else if (++state.failures >= FAILURES_TO_OPEN) {
    state.blockedUntil = Date.now() + OPEN_MS;
    state.failures = 0;
  }
  hosts.set(host, state);
}
