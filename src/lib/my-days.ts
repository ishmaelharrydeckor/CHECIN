/**
 * "My timesheet": a person's own recent days, worked out on the server from their daily
 * summaries (see daily-summary.ts), in the ORGANIZATION's timezone. The screen only displays
 * what this returns; it never adds up hours or decides which day an event belongs to.
 *
 * Pure functions, no Firebase and no path aliases, so they can be unit tested directly.
 */
import { dayKey, formatClock } from "./attendance-day.ts";
import { addDays } from "./attendance-today.ts";
import { summaryDocId } from "./daily-summary.ts";

/** How many days the "My page" timesheet shows (today included). */
export const MY_DAYS = 7;

/** The summary document ids to read: today and the six days before it, newest first. */
export function recentSummaryIds(employeeId: string, timezone: string, now: number = Date.now()): string[] {
  const today = dayKey(now, timezone);
  if (!today) return [];
  const ids: string[] = [];
  for (let i = 0; i < MY_DAYS; i += 1) ids.push(summaryDocId(employeeId, addDays(today, -i)));
  return ids;
}

export interface MyDay {
  dayKey: string;
  /** "08:14" in the organization's timezone. */
  firstIn: string | null;
  lastOut: string | null;
  minutesWorked: number;
  late: boolean;
  earlyDeparture: boolean;
  /** Checked in and not out right now (today only). */
  stillIn: boolean;
  /** A past day that ended while the person was still checked in (a forgotten check-out). */
  noCheckOut: boolean;
}

interface SummaryLike {
  orgId?: unknown;
  employeeId?: unknown;
  dayKey?: unknown;
  firstIn?: unknown;
  lastOut?: unknown;
  state?: unknown;
  minutesWorked?: unknown;
  late?: unknown;
  earlyDeparture?: unknown;
}

/**
 * Turns the summary documents that exist into display rows, newest first. A document that
 * belongs to somebody else, or another organization, is dropped (defence in depth: the ids
 * were built from the caller's own uid, but this is the last check before anything is shown).
 */
export function buildMyDays(
  summaries: readonly SummaryLike[],
  ctx: { employeeId: string; orgId: string; timezone: string; now?: number },
): MyDay[] {
  const today = dayKey(ctx.now ?? Date.now(), ctx.timezone);
  const rows: MyDay[] = [];
  for (const s of summaries) {
    if (!s || s.orgId !== ctx.orgId || s.employeeId !== ctx.employeeId) continue;
    if (typeof s.dayKey !== "string") continue;
    const stillIn = s.state === "in";
    const clock = (v: unknown) => (typeof v === "string" ? formatClock(v, ctx.timezone).slice(0, 5) || null : null);
    rows.push({
      dayKey: s.dayKey,
      firstIn: clock(s.firstIn),
      lastOut: clock(s.lastOut),
      minutesWorked: typeof s.minutesWorked === "number" && s.minutesWorked > 0 ? Math.round(s.minutesWorked) : 0,
      late: s.late === true,
      earlyDeparture: s.earlyDeparture === true,
      stillIn: stillIn && s.dayKey === today,
      noCheckOut: stillIn && today !== null && s.dayKey < today,
    });
  }
  return rows.sort((a, b) => (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0)).slice(0, MY_DAYS);
}
