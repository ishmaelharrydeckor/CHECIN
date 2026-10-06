/**
 * What the kiosk should show when power or internet is unreliable.
 *
 * The check-in code the tablet displays is only valid for a short time after the server
 * made it (between 15 and 30 seconds, depending on when in the 15 s window it was made).
 * If the tablet loses its connection, the picture on screen keeps looking alive while it
 * quietly stops working, and people scan a dead code. So: once the last successful refresh
 * is older than QR_STALE_AFTER_MS, the code is hidden and the screen says it is waiting.
 *
 * Pure functions, so the rule can be tested.
 */

/** Longer than the slowest normal refresh (12 s plus network time), shorter than the code's life. */
export const QR_STALE_AFTER_MS = 20_000;

export type KioskStatus =
  /** First request still in flight. */
  | "starting"
  /** A fresh code is on screen. */
  | "live"
  /** Cannot reach the server (power or internet). The code is hidden. */
  | "offline"
  /** The server rejected this tablet's secret (re-paired or revoked). Needs a person. */
  | "credentials";

export function isQrStale(
  lastSuccessMs: number | null,
  nowMs: number,
  staleAfterMs: number = QR_STALE_AFTER_MS,
): boolean {
  if (lastSuccessMs === null) return true;
  return nowMs - lastSuccessMs >= staleAfterMs;
}

export function kioskStatus(input: {
  lastSuccessMs: number | null;
  nowMs: number;
  failures: number;
  credentialError: boolean;
}): KioskStatus {
  if (input.credentialError) return "credentials";
  if (input.lastSuccessMs === null) return input.failures > 0 ? "offline" : "starting";
  return isQrStale(input.lastSuccessMs, input.nowMs) ? "offline" : "live";
}

const BACKOFF_MS = [3000, 5000, 8000, 12000, 15000];

/**
 * How long to wait before the next try after `failures` failed tries in a row. Quick at first so a
 * brief blip heals fast, then slower so a long outage is not hammered. Never above 15 s.
 */
export function retryDelayMs(failures: number): number {
  if (failures <= 0) return BACKOFF_MS[0];
  return BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1];
}
