/**
 * Tiny per-instance cache with a time-to-live, for data that changes rarely
 * (an organization's roster and timezone). Vercel runs many instances and each
 * has its own copy, which is fine: the TTL is short and the data is small.
 * It is a cost saver, never a source of truth, and never holds anything secret.
 */
export interface TtlCache<T> {
  get(key: string, now?: number): T | undefined;
  set(key: string, value: T, now?: number): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
}

export function createTtlCache<T>(ttlMs: number, maxEntries = 500): TtlCache<T> {
  const store = new Map<string, { value: T; at: number }>();
  return {
    get(key, now = Date.now()) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (now - hit.at > ttlMs) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value, now = Date.now()) {
      if (store.size >= maxEntries && !store.has(key)) {
        // Drop the oldest entry (Map keeps insertion order).
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { value, at: now });
    },
    delete(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    size() {
      return store.size;
    },
  };
}

/**
 * A cache for an expensive answer, keyed by who is asking.
 *
 *  - Within `ttlMs` the saved answer is returned and `compute` is NOT called
 *    (so no database reads).
 *  - `fresh: true` (the Refresh button) recomputes, but only if the saved answer is
 *    at least `freshMinAgeMs` old, so a button cannot be hammered to force reads.
 *  - Requests for the same key that arrive while a computation is running share it.
 *  - A failed computation is never cached.
 *
 * The caller chooses the key. For anything role-scoped the key MUST include who the
 * answer is for (see dashboardCacheKey), or one person could be handed another's data.
 */
export function createCachedLoader<T>(ttlMs: number, maxEntries = 200, freshMinAgeMs = 5000) {
  const cache = createTtlCache<{ at: number; value: T }>(ttlMs, maxEntries);
  const inFlight = new Map<string, Promise<T>>();

  return async function load(
    key: string,
    compute: () => Promise<T>,
    opts: { fresh?: boolean; now?: number } = {},
  ): Promise<T> {
    const now = opts.now ?? Date.now();
    const hit = cache.get(key, now);
    if (hit && !(opts.fresh && now - hit.at >= freshMinAgeMs)) return hit.value;

    const running = inFlight.get(key);
    if (running) return running;

    const p = (async () => {
      try {
        const value = await compute();
        cache.set(key, { at: now, value }, now);
        return value;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, p);
    return p;
  };
}
