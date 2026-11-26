export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class OfflineError extends Error {
  constructor() {
    super('You are offline');
    this.name = 'OfflineError';
  }
}

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

function linkSignals(timeoutMs: number, outer?: AbortSignal | null) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
  const onAbort = () => ctrl.abort(outer?.reason);
  if (outer) {
    if (outer.aborted) onAbort();
    else outer.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

export async function fetchWithTimeout(url: string, { timeoutMs = 12000, signal, ...init }: FetchOptions = {}): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError();
  const linked = linkSignals(timeoutMs, signal);
  try {
    const res = await fetch(url, { ...init, signal: linked.signal });
    if (!res.ok) throw new HttpError(`Request failed (${res.status})`, res.status, url);
    return res;
  } finally {
    linked.done();
  }
}

export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const res = await fetchWithTimeout(url, options);
  return (await res.json()) as T;
}

/** Spaces out calls to rate-limited public APIs (Nominatim asks for at most one request per second). */
export function createThrottle(minGapMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let last = 0;
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const next = chain.then(async () => {
      const wait = last + minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await task();
      } finally {
        last = Date.now();
      }
    });
    chain = next.catch(() => undefined);
    return next;
  };
}

export function describeError(error: unknown): string {
  if (error instanceof OfflineError) return 'You are offline. Showing what was saved on this device.';
  if (error instanceof HttpError) {
    if (error.status === 429) return 'The data service is busy right now. Please try again in a moment.';
    if (error.status >= 500) return 'The data service is having trouble. Please try again.';
    return `The request was refused (${error.status}).`;
  }
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'That took too long. Check your connection and try again.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}
