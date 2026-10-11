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
  /**
   * Show "Welcome, {name}" on the tablet after a scan. Off by default: the phone is the
   * confirmation, and the greeting costs a database read on every kiosk poll
   * (docs/SCALE-PLAN.md, S3/S4).
   */
  greeting: boolean;
  /** The tablet's private live-greeting channel address, if it has one yet (see kiosk-channel.ts). */
  channelId?: string;
  /** When that address was created (ms). Used to replace it daily; see kiosk-channel.ts. */
  channelRotatedAt?: number;
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
export const POLL_MS_FALLBACK = 4000; // asking for scans because the live connection is down
export const POLL_MS_NORMAL = 12000; // only the QR code needs refreshing; never slower (the token goes stale)

export function pollIntervalFor(inFallback: boolean): number {
  return inFallback ? POLL_MS_FALLBACK : POLL_MS_NORMAL;
}
