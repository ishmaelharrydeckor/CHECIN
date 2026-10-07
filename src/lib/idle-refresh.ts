/**
 * When should a dashboard that refreshes itself actually refresh?
 *
 * A manager who leaves the tab open all day used to cost a database read every
 * 2 minutes, forever, even with nobody looking. Now it refreshes only while the
 * tab is visible AND the person has touched the page in the last 10 minutes.
 * Coming back (any mouse move, key, touch or scroll) refreshes immediately.
 *
 * Pure functions, so the rule can be tested.
 */

/** No mouse, key, touch or scroll for this long = the person has walked away. */
export const IDLE_AFTER_MS = 10 * 60_000;

/** How often an active, visible dashboard refreshes itself. */
export const POLL_EVERY_MS = 2 * 60_000;

export function isIdle(
  lastActivityMs: number,
  nowMs: number,
  idleAfterMs: number = IDLE_AFTER_MS,
): boolean {
  return nowMs - lastActivityMs >= idleAfterMs;
}

export function shouldPoll(input: {
  visible: boolean;
  lastActivityMs: number;
  nowMs: number;
  idleAfterMs?: number;
}): boolean {
  if (!input.visible) return false;
  return !isIdle(input.lastActivityMs, input.nowMs, input.idleAfterMs);
}

/** On returning to a visible tab: refresh if the numbers are older than one poll interval. */
export function shouldRefreshOnReturn(lastFetchMs: number, nowMs: number): boolean {
  return nowMs - lastFetchMs >= POLL_EVERY_MS;
}
