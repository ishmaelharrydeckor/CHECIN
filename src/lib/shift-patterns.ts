/**
 * Pure rules for repeating shift patterns (task 3.1, phase 6; see docs/SHIFTS-DESIGN.md,
 * "Repeating patterns" in section 3b and `shift_patterns` in section 4).
 *
 * A pattern is a saved rule ("Day, Monday to Friday, until further notice", or a rotation
 * such as "two weeks Day, two weeks Night"). It never replaces the daily assignments: the
 * server uses these functions to WRITE ordinary `shift_assignments` documents ahead of time,
 * so everything that reads assignments (scan, Today panel, register, reports) is unchanged.
 *
 * The fill step (`nextFillWindow` + `planFill`) is safe to run again and again for any
 * pattern: it only plans days not yet filled, never duplicates, never overwrites a manual
 * assignment or another pattern's day, and covers at most 62 days per run. That is what lets
 * a top-up on the Rota and a nightly job share it.
 *
 * No Firebase, no `@/` imports and no clock reads (`today` is passed in), so every rule can be
 * tested directly with the Node test runner.
 */
import { addDays, weekdayIndex } from "./attendance-today.ts";
import { MAX_ASSIGNMENT_RANGE_DAYS } from "./shift-engine.ts";

/** The server keeps assignments filled at least this many days after today. */
export const FILL_AHEAD_DAYS = 62;
/** One fill run never covers more calendar days than a manual assignment may (the existing limit). */
export const FILL_RUN_MAX_DAYS = MAX_ASSIGNMENT_RANGE_DAYS;
export const MAX_ROTATION_STEPS = 8;
export const MAX_STEP_WEEKS = 8;
/** People per create request: each gets a pattern and one fill run, all in one 500-write batch. */
export const MAX_PATTERN_PEOPLE_PER_REQUEST = 8;
const MAX_REQUEST_ID_LENGTH = 64;

export interface RotationStep {
  shiftId: string;
  weeks: number;
}

export type PatternRule =
  | { kind: "weekly"; shiftId: string; weekdays: number[] }
  | { kind: "rotation"; weekdays: number[]; steps: RotationStep[] };

/** The parts of a stored `shift_patterns` document the fill step needs. */
export interface PatternState {
  rule: PatternRule;
  startDay: string;
  endDay: string | null; // null = until further notice
  filledThrough: string | null; // last day the fill step has already handled
}

/** What is already stored for a person on a day, as far as the fill step cares. */
export interface ExistingDay {
  patternId: string | null; // null = a manual assignment
  shiftId: string;
}

export type SkipReason =
  | "already_filled"
  | "manual"
  | "other_pattern"
  | "attendance_recorded"
  | "shift_archived"
  | "shift_missing";

export interface FillPlan {
  writes: { dayKey: string; shiftId: string }[];
  skipped: { dayKey: string; reason: SkipReason }[];
  filledThrough: string | null;
}

export interface PatternCreate {
  employeeIds: string[];
  rule: PatternRule;
  startDay: string;
  endDay: string | null;
  requestId: string;
}

export interface PatternEdit {
  rule?: PatternRule;
  endDay?: string | null;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(key: unknown): key is string {
  if (typeof key !== "string" || !DAY_RE.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function isCleanId(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && !v.includes("/");
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function mondayOf(day: string): string {
  return addDays(day, -weekdayIndex(day));
}

function maxDay(...days: (string | null)[]): string {
  return days.filter((d): d is string => d !== null).reduce((a, b) => (a > b ? a : b));
}

function minDay(...days: (string | null)[]): string {
  return days.filter((d): d is string => d !== null).reduce((a, b) => (a < b ? a : b));
}

function parseWeekdays(raw: unknown): Parsed<number[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Choose at least one day of the week." };
  }
  const set = new Set<number>();
  for (const w of raw) {
    if (typeof w !== "number" || !Number.isInteger(w) || w < 0 || w > 6) {
      return { ok: false, error: "Weekdays must be whole numbers from 0 (Monday) to 6 (Sunday)." };
    }
    set.add(w);
  }
  return { ok: true, value: [...set].sort((a, b) => a - b) };
}

/** Checks a pattern rule sent by the screen and returns a clean copy. */
export function parsePatternRule(raw: unknown): Parsed<PatternRule> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Choose how the shifts should repeat." };
  }
  const r = raw as Record<string, unknown>;
  const weekdays = parseWeekdays(r.weekdays);

  if (r.kind === "weekly") {
    if (!isCleanId(r.shiftId)) return { ok: false, error: "Choose a shift to repeat." };
    if (!weekdays.ok) return weekdays;
    return { ok: true, value: { kind: "weekly", shiftId: r.shiftId.trim(), weekdays: weekdays.value } };
  }

  if (r.kind === "rotation") {
    if (!weekdays.ok) return weekdays;
    if (!Array.isArray(r.steps) || r.steps.length < 2) {
      return { ok: false, error: "A rotation needs at least two shifts. For one shift, choose a weekly pattern." };
    }
    if (r.steps.length > MAX_ROTATION_STEPS) {
      return { ok: false, error: `A rotation can have at most ${MAX_ROTATION_STEPS} steps.` };
    }
    const steps: RotationStep[] = [];
    for (const s of r.steps) {
      const step = s as Record<string, unknown> | null;
      if (!step || typeof step !== "object" || !isCleanId(step.shiftId)) {
        return { ok: false, error: "Choose a shift for every step of the rotation." };
      }
      if (
        typeof step.weeks !== "number" ||
        !Number.isInteger(step.weeks) ||
        step.weeks < 1 ||
        step.weeks > MAX_STEP_WEEKS
      ) {
        return {
          ok: false,
          error: `Each step of a rotation must last a whole number of weeks, from 1 to ${MAX_STEP_WEEKS}.`,
        };
      }
      steps.push({ shiftId: step.shiftId.trim(), weeks: step.weeks });
    }
    return { ok: true, value: { kind: "rotation", weekdays: weekdays.value, steps } };
  }

  return { ok: false, error: "Choose a weekly pattern or a rotation." };
}

/** The shifts a rule uses, each once, in order of first use. */
export function patternShiftIds(rule: PatternRule): string[] {
  if (rule.kind === "weekly") return [rule.shiftId];
  return [...new Set(rule.steps.map((s) => s.shiftId))];
}

/** Checks a create request. `today` is the organization's day key. */
export function parsePatternCreate(raw: unknown, today: string): Parsed<PatternCreate> {
  if (!isRealDay(today)) return { ok: false, error: "Today's date is required." };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Choose people, a shift pattern and a start date." };
  }
  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.employeeIds) || r.employeeIds.length === 0) {
    return { ok: false, error: "Choose at least one person." };
  }
  const employeeIds: string[] = [];
  for (const item of r.employeeIds) {
    if (!isCleanId(item)) return { ok: false, error: "Choose valid people for the pattern." };
    const id = item.trim();
    if (!employeeIds.includes(id)) employeeIds.push(id);
  }
  if (employeeIds.length > MAX_PATTERN_PEOPLE_PER_REQUEST) {
    return {
      ok: false,
      error: `You can set up a pattern for at most ${MAX_PATTERN_PEOPLE_PER_REQUEST} people at a time.`,
    };
  }

  const rule = parsePatternRule(r.rule);
  if (!rule.ok) return rule;

  if (!isRealDay(r.startDay)) return { ok: false, error: "Choose a valid start date." };
  if (r.startDay < today) return { ok: false, error: "A pattern can only start today or later." };

  let endDay: string | null = null;
  if (r.endDay !== undefined && r.endDay !== null) {
    if (!isRealDay(r.endDay)) return { ok: false, error: "Choose a valid end date, or leave it empty." };
    if (r.endDay < r.startDay) return { ok: false, error: "The end date cannot be before the start date." };
    endDay = r.endDay;
  }

  if (!isCleanId(r.requestId) || r.requestId.length > MAX_REQUEST_ID_LENGTH) {
    return { ok: false, error: "Something went wrong with this request. Please reload the page and try again." };
  }

  return {
    ok: true,
    value: { employeeIds, rule: rule.value, startDay: r.startDay, endDay, requestId: r.requestId.trim() },
  };
}

/** Checks an edit: a new rule and/or a new end day (null = until further notice). Nothing else can change. */
export function parsePatternEdit(raw: unknown, today: string): Parsed<PatternEdit> {
  if (!isRealDay(today)) return { ok: false, error: "Today's date is required." };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Choose what to change in the pattern." };
  }
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (key !== "rule" && key !== "endDay") {
      return {
        ok: false,
        error: "Only the repeat rule and the end date can be changed. To start on another date, end this pattern and make a new one.",
      };
    }
  }

  const value: PatternEdit = {};
  if (r.rule !== undefined) {
    const rule = parsePatternRule(r.rule);
    if (!rule.ok) return rule;
    value.rule = rule.value;
  }
  if (r.endDay !== undefined) {
    if (r.endDay === null) {
      value.endDay = null;
    } else {
      if (!isRealDay(r.endDay)) return { ok: false, error: "Choose a valid end date, or leave it empty." };
      if (r.endDay < today) return { ok: false, error: "The end date cannot be in the past." };
      value.endDay = r.endDay;
    }
  }
  if (Object.keys(value).length === 0) {
    return { ok: false, error: "Choose what to change in the pattern." };
  }
  return { ok: true, value };
}

/**
 * Deterministic id for a person's pattern from one create request, so a retried request
 * (same `requestId`, made once by the screen) writes the same document instead of a second one.
 */
export function patternDocId(employeeId: string, requestId: string): string {
  if (!isCleanId(employeeId) || !isCleanId(requestId)) {
    throw new Error("employeeId and requestId must be non-empty strings without '/'.");
  }
  return `${employeeId}_${requestId}`;
}

/**
 * The shift the rule gives on `day`, or null (before the start, or not a chosen weekday).
 * Rotations count whole Monday-to-Sunday weeks from the week containing `startDay`; a pattern
 * that starts mid-week counts that partial week as its first week.
 */
export function shiftIdForDay(rule: PatternRule, startDay: string, day: string): string | null {
  if (day < startDay) return null;
  if (!rule.weekdays.includes(weekdayIndex(day))) return null;
  if (rule.kind === "weekly") return rule.shiftId;

  const cycleWeeks = rule.steps.reduce((sum, s) => sum + s.weeks, 0);
  const week = daysBetween(mondayOf(startDay), mondayOf(day)) / 7;
  let pos = week % cycleWeeks;
  for (const step of rule.steps) {
    if (pos < step.weeks) return step.shiftId;
    pos -= step.weeks;
  }
  return null; // unreachable for a parsed rule
}

/** The last day the server keeps filled for `today`. */
export function fillTarget(today: string): string {
  return addDays(today, FILL_AHEAD_DAYS);
}

/**
 * The days the next fill run should handle, or null when there is nothing to do.
 * Never before today, never before the start, never after the end or the target, and at most
 * FILL_RUN_MAX_DAYS calendar days, so a run is bounded however stale the pattern is.
 */
export function nextFillWindow(pattern: PatternState, today: string): { from: string; to: string } | null {
  const from = maxDay(
    pattern.startDay,
    today,
    pattern.filledThrough ? addDays(pattern.filledThrough, 1) : null,
  );
  const to = minDay(fillTarget(today), pattern.endDay, addDays(from, FILL_RUN_MAX_DAYS - 1));
  return from <= to ? { from, to } : null;
}

/** Cheap check (no assignment reads) for whether a pattern needs a fill run today. */
export function needsFill(pattern: PatternState, today: string): boolean {
  return nextFillWindow(pattern, today) !== null;
}

/**
 * Plans one fill run. The caller reads `existing` (assignments stored for that person on the
 * window's days) and `shifts` (each shift the rule uses: present and not archived), writes
 * `writes` as ordinary assignments carrying `patternId`, and saves `filledThrough` on the pattern.
 * Running it again with the same inputs, or after its writes landed, plans nothing new.
 */
export function planFill(input: {
  patternId: string;
  pattern: PatternState;
  today: string;
  existing: ReadonlyMap<string, ExistingDay>;
  recordedToday: boolean; // attendance already recorded today for this person
  shifts: ReadonlyMap<string, { archived: boolean }>;
}): FillPlan {
  const { patternId, pattern, today, existing, recordedToday, shifts } = input ?? ({} as never);
  if (!isCleanId(patternId)) throw new Error("patternId is required.");
  if (!pattern || typeof pattern !== "object" || !isRealDay(pattern.startDay)) {
    throw new Error("A valid pattern is required.");
  }
  if (!isRealDay(today)) throw new Error("today must be a YYYY-MM-DD day.");

  const window = nextFillWindow(pattern, today);
  if (!window) return { writes: [], skipped: [], filledThrough: pattern.filledThrough };

  const writes: FillPlan["writes"] = [];
  const skipped: FillPlan["skipped"] = [];

  for (let d = window.from; d <= window.to; d = addDays(d, 1)) {
    const shiftId = shiftIdForDay(pattern.rule, pattern.startDay, d);
    if (!shiftId) continue;

    const current = existing.get(d);
    if (current) {
      if (current.patternId === null) {
        skipped.push({ dayKey: d, reason: "manual" });
        continue;
      }
      if (current.patternId !== patternId) {
        skipped.push({ dayKey: d, reason: "other_pattern" });
        continue;
      }
      // Our own day: leave it unless the rule changed and the day is still in the future.
      if (current.shiftId === shiftId || d <= today) {
        skipped.push({ dayKey: d, reason: "already_filled" });
        continue;
      }
    }

    if (d === today && recordedToday) {
      skipped.push({ dayKey: d, reason: "attendance_recorded" });
      continue;
    }

    const shift = shifts.get(shiftId);
    if (!shift) {
      skipped.push({ dayKey: d, reason: "shift_missing" });
      continue;
    }
    if (shift.archived) {
      skipped.push({ dayKey: d, reason: "shift_archived" });
      continue;
    }

    writes.push({ dayKey: d, shiftId });
  }

  return { writes, skipped, filledThrough: window.to };
}

/**
 * The days to delete when a pattern is edited (keepThrough = today) or ended (keepThrough = the
 * end day): this pattern's own assignments after keepThrough. Today and the past are never
 * removed, and manual or other patterns' days are never touched.
 */
export function planTrim(input: {
  patternId: string;
  keepThrough: string;
  today: string;
  existing: readonly { dayKey: string; patternId: string | null }[];
}): string[] {
  const { patternId, keepThrough, today, existing } = input;
  if (!isCleanId(patternId)) throw new Error("patternId is required.");
  if (!isRealDay(today) || !isRealDay(keepThrough)) throw new Error("Days must be YYYY-MM-DD.");
  const after = maxDay(keepThrough, today);
  return existing.filter((e) => e.patternId === patternId && e.dayKey > after).map((e) => e.dayKey);
}

/** Stored as `nextFillDay` when a pattern with an end day is completely filled. Sorts after every real day. */
export const NO_MORE_FILL = "9999-12-31";

/**
 * The first day a pattern still needs filled, stored on the pattern so the top-up and the
 * nightly job can ask the database for "patterns due by the target day" with one indexed query.
 */
export function nextFillDay(pattern: Pick<PatternState, "startDay" | "endDay" | "filledThrough">): string {
  if (pattern.endDay !== null && pattern.filledThrough !== null && pattern.filledThrough >= pattern.endDay) {
    return NO_MORE_FILL;
  }
  return pattern.filledThrough === null
    ? pattern.startDay
    : maxDay(pattern.startDay, addDays(pattern.filledThrough, 1));
}

/**
 * True when two patterns could give the same person a shift on the same day: their date ranges
 * meet and they share a weekday. Two patterns for one person on different weekdays are fine.
 */
export function patternsOverlap(
  a: Pick<PatternState, "rule" | "startDay" | "endDay">,
  b: Pick<PatternState, "rule" | "startDay" | "endDay">,
): boolean {
  const aEnd = a.endDay ?? NO_MORE_FILL;
  const bEnd = b.endDay ?? NO_MORE_FILL;
  if (a.startDay > bEnd || b.startDay > aEnd) return false;
  return a.rule.weekdays.some((w) => b.rule.weekdays.includes(w));
}

/**
 * What an edit does to a stored pattern. `keepThrough` is the last day whose assignments stay
 * (null = remove nothing); the caller trims after it with `planTrim`, saves `next`, then runs a fill.
 * A new rule applies from tomorrow; a new end day removes this pattern's days after it.
 */
export function planEdit(
  pattern: PatternState,
  edit: PatternEdit,
  today: string,
): Parsed<{ keepThrough: string | null; next: PatternState }> {
  if (!isRealDay(today)) return { ok: false, error: "Today's date is required." };
  const ruleChanged = edit.rule !== undefined;
  const endDay = edit.endDay !== undefined ? edit.endDay : pattern.endDay;
  if (endDay !== null && endDay < pattern.startDay) {
    return { ok: false, error: "The end date cannot be before the pattern's start date." };
  }

  let keepThrough: string | null = null;
  if (ruleChanged) keepThrough = today;
  else if (endDay !== null) keepThrough = endDay;

  const filledThrough =
    pattern.filledThrough !== null && keepThrough !== null
      ? minDay(pattern.filledThrough, maxDay(keepThrough, today))
      : pattern.filledThrough;

  return {
    ok: true,
    value: {
      keepThrough,
      next: { rule: edit.rule ?? pattern.rule, startDay: pattern.startDay, endDay, filledThrough },
    },
  };
}
