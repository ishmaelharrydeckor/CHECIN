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
