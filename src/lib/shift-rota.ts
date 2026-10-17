/**
 * Pure helpers for the rota screen, "My shifts" and the refused-scans list. No React, no Firebase.
 * Days are "YYYY-MM-DD" keys in the organization's timezone; nothing here reads the clock.
 */
import { addDays, weekdayIndex } from "./attendance-today.ts";
import { formatClock } from "./attendance-day.ts";
import type { ShiftSnapshot } from "./shift-engine.ts";

export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** The Monday of the week that contains `day` (weeks run Monday to Sunday). */
export function mondayOf(day: string): string {
  return addDays(day, -weekdayIndex(day));
}

/** The seven day keys of the week starting on `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Move by whole weeks (negative goes back). */
export function shiftWeek(monday: string, weeks: number): string {
  return addDays(monday, weeks * 7);
}

/** "12 Oct" for a day key. */
export function formatDayMonth(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1] ?? ""}`.trim();
}

/** "Mon 12" for a day key. */
export function formatDayHeader(day: string): string {
  return `${WEEKDAY_NAMES[weekdayIndex(day)]} ${Number(day.split("-")[2])}`;
}

/** "12 Oct to 18 Oct 2026" for the week starting on `monday`. */
export function formatWeekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  return `${formatDayMonth(monday)} to ${formatDayMonth(sunday)} ${sunday.slice(0, 4)}`;
}

export interface RotaAssignment {
  employeeId: string;
  dayKey: string;
  shift: ShiftSnapshot;
}

/** person -> day -> shift, for looking a cell up directly. */
export function indexAssignments(list: readonly RotaAssignment[]): Map<string, Map<string, ShiftSnapshot>> {
  const out = new Map<string, Map<string, ShiftSnapshot>>();
  for (const a of list) {
    if (!a || typeof a.employeeId !== "string" || typeof a.dayKey !== "string" || !a.shift) continue;
    let days = out.get(a.employeeId);
    if (!days) out.set(a.employeeId, (days = new Map()));
    days.set(a.dayKey, a.shift);
  }
  return out;
}

/** How many people have a shift on each day of the week, for the totals row. */
export function countsPerDay(
  index: Map<string, Map<string, ShiftSnapshot>>,
  days: readonly string[],
  peopleIds: readonly string[],
): number[] {
  return days.map((d) => peopleIds.filter((id) => index.get(id)?.has(d)).length);
}

/** What a day's shift looks like to the person it belongs to: "Night, 22:00 to 06:00". */
export function describeAssignment(shift: Pick<ShiftSnapshot, "name" | "type" | "start" | "end">): string {
  if (shift.type === "flex" || !shift.start || !shift.end) return `${shift.name}, flexible`;
  return `${shift.name}, ${shift.start} to ${shift.end}`;
}

/** The sentence under "My shifts" explaining when check-in works, in plain words. */
export function describeAllowedTime(windowMinutes: number): string {
  const hours = windowMinutes / 60;
  const text =
    windowMinutes % 60 === 0
      ? `${hours} ${hours === 1 ? "hour" : "hours"}`
      : `${windowMinutes} minutes`;
  return `You can check in from ${text} before your shift starts until ${text} after it ends.`;
}

/** Fixed order of weekdays picked in the assign form (0 = Monday). */
export function weekdaysLabel(weekdays: readonly number[]): string {
  const sorted = [...new Set(weekdays)].filter((w) => w >= 0 && w <= 6).sort((a, b) => a - b);
  if (sorted.length === 0) return "no days";
  if (sorted.length === 7) return "every day";
  if (sorted.length === 5 && sorted.every((w, i) => w === i)) return "Monday to Friday";
  return sorted.map((w) => WEEKDAY_NAMES[w]).join(", ");
}

export interface RefusedNote {
  id: string;
  employeeId: string;
  employeeName: string;
  at: string;
  reason: string;
  shiftName: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  opensAt: string;
  closesAt: string;
}

/** One plain sentence for the refused-scans list, with times in the organization's timezone. */
export function describeRefusal(note: RefusedNote, timezone: string): string {
  const at = formatClock(note.at, timezone).slice(0, 5);
  const shift = note.shiftName || "their shift";
  if (note.reason === "too_early") {
    const opens = formatClock(note.opensAt, timezone).slice(0, 5);
    return `Tried to check in at ${at}, before ${shift}. Check-in opens at ${opens}.`;
  }
  if (note.reason === "too_late") {
    const closed = formatClock(note.closesAt, timezone).slice(0, 5);
    return `Tried to check in at ${at}, after ${shift}. Check-in closed at ${closed}.`;
  }
  return `Tried to check in at ${at}, outside ${shift}.`;
}

/** Read-side rules for the refused-scans route, kept here so they can be tested. */
export const REFUSED_DEFAULT_PAGE = 50;
export const REFUSED_MAX_PAGE = 100;

export function parseRefusedQuery(
  limitRaw: string | null,
  cursorRaw: string | null,
): { ok: true; pageSize: number; cursor: string | null } | { ok: false; error: string } {
  let pageSize = REFUSED_DEFAULT_PAGE;
  if (limitRaw !== null && limitRaw !== "") {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1) return { ok: false, error: "The page size must be a whole number of 1 or more." };
    pageSize = Math.min(n, REFUSED_MAX_PAGE);
  }
  let cursor: string | null = null;
  if (cursorRaw !== null && cursorRaw !== "") {
    if (!Number.isFinite(Date.parse(cursorRaw)) || cursorRaw.length > 40) {
      return { ok: false, error: "That page marker is not valid." };
    }
    cursor = cursorRaw;
  }
  return { ok: true, pageSize, cursor };
}

// ---------------------------------------------------------------- repeating patterns (3.1-P6)

/** "13 Oct 2026" for a day key. */
export function formatDayMonthYear(day: string): string {
  return `${formatDayMonth(day)} ${day.slice(0, 4)}`;
}

type PatternRuleLike =
  | { kind: "weekly"; shiftId: string; weekdays: readonly number[] }
  | { kind: "rotation"; weekdays: readonly number[]; steps: readonly { shiftId: string; weeks: number }[] };

/** "Day, Monday to Friday" or "2 weeks Day, then 2 weeks Night, repeating (Monday to Friday)". */
export function describePatternRule(rule: PatternRuleLike, nameOf: (shiftId: string) => string): string {
  if (rule.kind === "weekly") return `${nameOf(rule.shiftId)}, ${weekdaysLabel(rule.weekdays)}`;
  const steps = rule.steps.map((s) => `${s.weeks} ${s.weeks === 1 ? "week" : "weeks"} ${nameOf(s.shiftId)}`);
  return `${steps.join(", then ")}, repeating (${weekdaysLabel(rule.weekdays)})`;
}

/** "From 13 Oct 2026, until further notice" or "13 Oct 2026 to 30 Jun 2027". */
export function describePatternDates(startDay: string, endDay: string | null): string {
  if (endDay === null) return `From ${formatDayMonthYear(startDay)}, until further notice`;
  return `${formatDayMonthYear(startDay)} to ${formatDayMonthYear(endDay)}`;
}

function countOf(skipped: Record<string, unknown>, key: string): number {
  const n = skipped[key];
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
}

function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/**
 * The days a pattern did not fill, in plain words, or null when there is nothing to say.
 * "Already filled" is normal and never mentioned.
 */
export function describeFillSkips(skipped: Record<string, unknown> | null | undefined): string | null {
  if (!skipped || typeof skipped !== "object") return null;
  const manual = countOf(skipped, "manual");
  const other = countOf(skipped, "other_pattern");
  const recorded = countOf(skipped, "attendance_recorded");
  const noShift = countOf(skipped, "shift_archived") + countOf(skipped, "shift_missing");
  const parts: string[] = [];
  if (manual) parts.push(`${days(manual)} kept the shift assigned by hand.`);
  if (other) parts.push(`${days(other)} ${other === 1 ? "is" : "are"} covered by another pattern.`);
  if (recorded) {
    parts.push(`${days(recorded)} ${recorded === 1 ? "was" : "were"} skipped because attendance is already recorded.`);
  }
  if (noShift) {
    parts.push(`${days(noShift)} ${noShift === 1 ? "was" : "were"} skipped because a shift in the pattern was archived or removed.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
