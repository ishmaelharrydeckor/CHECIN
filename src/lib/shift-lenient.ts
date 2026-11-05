/**
 * Pure decision rules for Lenient scan mode (task 3.1, phase 3b; see
 * docs/SHIFTS-DESIGN.md, the "Strict or Lenient" and "Refused-scans list" rows).
 *
 * - Inside the shift's scan window: recorded and counted as normal, in both modes.
 * - Outside the window, Strict: refused (not recorded). This is the existing behaviour.
 * - Outside the window, Lenient: recorded as a normal check-in marked
 *   "outside shift window", with no late / early judgement, and NOT counted:
 *   it never starts or ends the shift, never changes the direction of the
 *   person's next scan, and never changes their hours.
 * - Both modes write one short refused-scan note for an outside-window scan.
 *
 * No Firebase, no clock reads. The integrator connects these to the scan route
 * and the summary builder.
 *
 * Note: shift-engine.ts also exports a `classifyScan` (it chooses the shift).
 * They are different functions; import this one with an alias where both are
 * needed, e.g. `import { classifyScan as classifyLenientScan } from "./shift-lenient.ts"`.
 */
import type { ScanType } from "./attendance-day.ts";
import type { ScanMode } from "./shift-requests.ts";

export interface ScanClassification {
  record: boolean; // write a clock event
  counted: boolean; // the event counts toward direction, first-in, last-out and hours
  note: boolean; // write one refused-scan note
}

/** The minimum an event needs for these rules. Other fields are kept as they are. */
export interface DayEvent {
  type: ScanType; // "in" or "out"
  outsideWindow?: boolean; // true only for a Lenient scan outside the shift window
}

/**
 * Decides what happens to one scan.
 *
 * `mode` comes from the organization setting. Anything other than "lenient"
 * (missing, misspelled) is treated as "strict", the design's default.
 * `insideWindow` must be a real boolean; anything else is a caller mistake and throws.
 */
export function classifyScan(input: { mode: ScanMode | string | undefined; insideWindow: boolean }): ScanClassification {
  if (!input || typeof input !== "object") {
    throw new TypeError("classifyScan needs { mode, insideWindow }.");
  }
  if (typeof input.insideWindow !== "boolean") {
    throw new TypeError("insideWindow must be true or false.");
  }

  if (input.insideWindow) {
    return { record: true, counted: true, note: false };
  }
  if (input.mode === "lenient") {
    return { record: true, counted: false, note: true };
  }
  return { record: false, counted: false, note: true };
}

/**
 * A day's events, oldest first, without the ones that do not count
 * (marked `outsideWindow: true`). Order is kept; the input is not changed.
 * Only exactly `true` marks an event as outside; a missing flag means it counts.
 * Entries that are not objects are dropped.
 */
export function countedEvents<T extends DayEvent>(events: readonly T[]): T[] {
  if (!Array.isArray(events)) {
    throw new TypeError("countedEvents needs an array of events.");
  }
  return events.filter(
    (e): e is T => e !== null && typeof e === "object" && e.outsideWindow !== true,
  );
}

/**
 * Direction of the person's next scan, from a day's events (oldest first).
 * Uses counted events only: the last counted "in" means the next scan is "out";
 * otherwise (no counted events, or the last counted one was "out") it is "in".
 * Same rule as nextTypeFromSummary in daily-summary.ts.
 */
export function nextDirection(events: readonly DayEvent[]): ScanType {
  const counted = countedEvents(events);
  for (let i = counted.length - 1; i >= 0; i--) {
    const type = counted[i].type;
    if (type === "in") return "out";
    if (type === "out") return "in";
  }
  return "in";
}