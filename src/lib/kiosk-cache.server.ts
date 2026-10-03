import type { LocationHours } from "./attendance-windows";

/**
 * Per-instance cache for the data /api/kiosk/token needs on every poll.
 *
 * Without it each poll cost 4 Firestore reads (kiosk, location, org, recent
 * scan). Everything except the recent-scan check changes rarely, so we keep it
 * in memory for a short TTL. Vercel runs many instances and each has its own
 * cache, which is fine: the data is tiny and the TTL is short.
 *
 * Trade-off (SYSTEM-DESIGN.md, D2): revoking a kiosk can take up to
 * KIOSK_CACHE_TTL_MS to stop an instance that already cached it. A *re-pair*
 * is picked up immediately because a secret mismatch forces a reload.
 */
export const KIOSK_CACHE_TTL_MS = 60_000;
const MAX_ENTRIES = 1000;

export interface KioskCacheEntry {
  loadedAt: number;
  orgId: string;
  secretHash: string;
  locationName: string;
  hours: LocationHours;
  timezone: string;
}

const cache = new Map<string, KioskCacheEntry>();

/** Returns a cached entry only if it is still fresh. */
export function getCachedKiosk(
  locationId: string,
  now: number = Date.now(),
): KioskCacheEntry | null {
  const entry = cache.get(locationId);
  if (!entry) return null;
  if (now - entry.loadedAt > KIOSK_CACHE_TTL_MS) {
    cache.delete(locationId);
    return null;
  }
  return entry;
}

export function setCachedKiosk(locationId: string, entry: KioskCacheEntry): void {
  // Bound memory: location ids come from unauthenticated requests, but only
  // existing kiosks are ever stored, so this is a safety net, not a hot path.
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(locationId, entry);
}

export function invalidateKiosk(locationId: string): void {
  cache.delete(locationId);
}

/** Test helper. */
export function clearKioskCache(): void {
  cache.clear();
}

/** How soon the kiosk should ask again (ms). Server decides; the kiosk only obeys. */
export const POLL_MS_ACTIVE = 4000; // around reporting / closing time: fast greeting
export const POLL_MS_IDLE = 12000; // never slower: the QR token must be refreshed in time

export function pollIntervalFor(mode: "check_in" | "check_out" | "idle"): number {
  return mode === "idle" ? POLL_MS_IDLE : POLL_MS_ACTIVE;
}
