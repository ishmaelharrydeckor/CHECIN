/**
 * Work-from-home rules, as pure functions (docs/WFH-DESIGN.md).
 *
 * A work-from-home day is a self-declaration: one record per person per day. These helpers decide
 * which requested days are acceptable; the server route adds the checks that need the database
 * (holidays, approved leave). Relative `.ts` imports only, so Node can run the tests directly.
 */

/** Today and this many days ahead may be declared. No back-dating. */
export const WFH_MAX_AHEAD_DAYS = 30;
/** The most days one request may declare. */
export const WFH_MAX_PER_REQUEST = 14;
/** How far back the employee's own list reaches, so recent history stays visible. */
export const WFH_HISTORY_DAYS = 30;
/** Hard cap on one read (one person, about two months of days). */
export const WFH_READ_CAP = 100;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One document per person per day, so a repeated request cannot create a duplicate. */
export function wfhId(employeeId: string, day: string): string {
  return `${employeeId}_${day}`;
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday to Friday. */
export function isWeekday(day: string): boolean {
  const w = new Date(`${day}T00:00:00Z`).getUTCDay();
  return w >= 1 && w <= 5;
}

export type WfhParse<T> = { ok: true; value: T } | { ok: false; error: string };

/** Checks a "declare these days" body. `today` is the organization's day, never the client's. */
export function parseDeclareRequest(body: unknown, today: string): WfhParse<{ days: string[] }> {
  const raw = (body as { days?: unknown } | null)?.days;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Choose at least one day." };
  }
  if (raw.length > WFH_MAX_PER_REQUEST) {
    return { ok: false, error: `You can declare up to ${WFH_MAX_PER_REQUEST} days at once.` };
  }
  const last = addDays(today, WFH_MAX_AHEAD_DAYS);
  const days = new Set<string>();
  for (const d of raw) {
    if (!isDayKey(d)) return { ok: false, error: "One of the days is not a valid date." };
    if (d < today || d > last || !isWeekday(d)) {
      return { ok: false, error: `You can only choose weekdays in the next ${WFH_MAX_AHEAD_DAYS} days.` };
    }
    days.add(d);
  }
  return { ok: true, value: { days: [...days].sort() } };
}

/**
 * Checks a "remove this day" body. An employee omits `employeeId` (it is then themself); a manager
 * or admin names the person. Only today and later days can be removed: earlier days are history.
 */
export function parseRemoveRequest(
  body: unknown,
  today: string,
): WfhParse<{ day: string; employeeId: string | null }> {
  const b = body as { dayKey?: unknown; employeeId?: unknown } | null;
  if (!isDayKey(b?.dayKey)) return { ok: false, error: "That is not a valid day." };
  if (b.dayKey < today) return { ok: false, error: "Only today and later days can be cancelled." };
  let employeeId: string | null = null;
  if (b.employeeId !== undefined) {
    if (typeof b.employeeId !== "string" || b.employeeId.length === 0 || b.employeeId.length > 128) {
      return { ok: false, error: "That person was not found." };
    }
    employeeId = b.employeeId;
  }
  return { ok: true, value: { day: b.dayKey, employeeId } };
}

export interface LeaveSpan {
  status?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

/** The first requested day that falls inside approved leave, or null. Pending and denied leave never block. */
export function dayCoveredByLeave(days: string[], leaves: LeaveSpan[]): string | null {
  for (const d of days) {
    for (const l of leaves) {
      if (l.status !== "approved") continue;
      if (typeof l.startDate !== "string" || typeof l.endDate !== "string") continue;
      if (l.startDate <= d && d <= l.endDate) return d;
    }
  }
  return null;
}
