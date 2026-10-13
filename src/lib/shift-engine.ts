/**
 * Pure rules engine for shifts (task 3.1, phase 1; see docs/SHIFTS-DESIGN.md).
 *
 * All wall-clock times are interpreted in the organization's IANA timezone and
 * converted to real epoch instants (milliseconds) before comparison, so shifts
 * that cross midnight or a daylight-saving changeover work without special cases
 * in the callers.
 */
import { dayKey, formatClock } from "./attendance-day.ts";
import { addDays, startOfDayMs, weekdayIndex } from "./attendance-today.ts";

export type ShiftType = "day" | "early" | "late" | "night" | "flex";
export const SHIFT_TYPES: readonly ShiftType[] = ["day", "early", "late", "night", "flex"];
export const DEFAULT_WINDOW_MINUTES = 120; // scanning opens this long before a shift starts and closes this long after it ends
export const MIN_WINDOW_MINUTES = 30;
export const MAX_WINDOW_MINUTES = 240;
export const DEFAULT_ABSENT_AFTER_MINUTES = 60; // rostered, no scan, this long after the shift started
export const MAX_ASSIGNMENT_RANGE_DAYS = 62;
export const MAX_SHIFT_MINUTES = 16 * 60; // longest supported shift

/** A shift's details as copied onto an assignment, so editing a shift later never rewrites history. */
export interface ShiftSnapshot {
  shiftId: string;
  name: string;
  type: ShiftType;
  start: string | null; // "HH:MM" 24-hour; null for flex
  end: string | null; // "HH:MM"; null for flex
  graceMinutes: number; // whole minutes, 0 or more
  expectedMinutes: number | null; // flex only
}

export interface ShiftAssignment {
  dayKey: string; // dayKey is the day the shift STARTS
  shift: ShiftSnapshot;
}

export interface ShiftWindow {
  startMs: number | null; // null for flex
  endMs: number | null; // null for flex
  opensMs: number; // first instant a scan is allowed (inclusive)
  closesMs: number; // last instant a scan is allowed (inclusive)
}

export interface ShiftState {
  lastType: "in" | "out" | null; // the person's last scan on that shift day
}

export type ScanDirection = "in" | "out";

export interface ParsedShiftValue {
  name: string;
  type: ShiftType;
  start: string | null;
  end: string | null;
  graceMinutes: number;
  expectedMinutes: number | null;
}

export type ParseShiftResult =
  | { ok: true; value: ParsedShiftValue }
  | { ok: false; error: string };

export interface ClassifyScanInput {
  nowMs: number;
  timezone: string;
  assignments: readonly ShiftAssignment[];
  states: Readonly<Record<string, ShiftState>>;
  windowMinutes?: number;
}

export type ClassifyScanMatched = {
  kind: "matched";
  shiftDay: string;
  shift: ShiftSnapshot;
  direction: ScanDirection;
  late: boolean;
  earlyDeparture: boolean;
  window: ShiftWindow;
};

export type ClassifyScanOutside = {
  kind: "outside";
  reason: "too_early" | "too_late";
  shiftDay: string;
  shift: ShiftSnapshot;
  window: ShiftWindow;
};

export type ClassifyScanResult =
  | ClassifyScanMatched
  | ClassifyScanOutside
  | { kind: "unassigned" };

export type ShiftDayStatus =
  | "present"
  | "on_leave"
  | "holiday"
  | "not_rostered"
  | "expected"
  | "absent";

export interface ShiftDayStatusInput {
  assignment: ShiftAssignment | null;
  hasScan: boolean;
  onLeave: boolean;
  isHoliday: boolean;
  nowMs: number;
  timezone: string;
  absentAfterMinutes?: number;
}

export interface ExpandAssignmentRangeInput {
  fromDay: string;
  toDay: string;
  weekdays: readonly number[];
}

export type ExpandAssignmentRangeResult =
  | { ok: true; days: string[] }
  | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeTimezone(tz: unknown): string {
  if (typeof tz !== "string" || !tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function isRealDay(key: unknown): key is string {
  if (typeof key !== "string" || !DAY_RE.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function isShiftType(v: unknown): v is ShiftType {
  return typeof v === "string" && (SHIFT_TYPES as readonly string[]).includes(v);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function normalizeWindowMinutes(windowMinutes?: number): number {
  if (
    typeof windowMinutes !== "number" ||
    !Number.isFinite(windowMinutes) ||
    windowMinutes < MIN_WINDOW_MINUTES ||
    windowMinutes > MAX_WINDOW_MINUTES
  ) {
    return DEFAULT_WINDOW_MINUTES;
  }
  return windowMinutes;
}

function cleanName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Validates what an admin or manager typed when creating or editing a shift. */
export function parseShiftInput(raw: unknown): ParseShiftResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Choose a name of 1 to 40 characters." };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.name !== "string") {
    return { ok: false, error: "Choose a name of 1 to 40 characters." };
  }
  const name = cleanName(r.name);
  if (name.length < 1 || name.length > 40) {
    return { ok: false, error: "Choose a name of 1 to 40 characters." };
  }

  if (!isShiftType(r.type)) {
    return { ok: false, error: "Choose a valid shift type." };
  }
  const type = r.type;

  const rawGrace = r.graceMinutes === undefined ? 0 : r.graceMinutes;
  if (
    typeof rawGrace !== "number" ||
    !Number.isInteger(rawGrace) ||
    rawGrace < 0 ||
    rawGrace > 120
  ) {
    return { ok: false, error: "Grace minutes must be a whole number from 0 to 120." };
  }
  const graceMinutes = rawGrace;

  if (type === "flex") {
    if (
      typeof r.expectedMinutes !== "number" ||
      !Number.isInteger(r.expectedMinutes) ||
      r.expectedMinutes < 60 ||
      r.expectedMinutes > 1440
    ) {
      return {
        ok: false,
        error: "Expected time for a flexible shift must be a whole number from 60 to 1440 minutes.",
      };
    }
    return {
      ok: true,
      value: {
        name,
        type,
        start: null,
        end: null,
        graceMinutes,
        expectedMinutes: r.expectedMinutes,
      },
    };
  }

  if (typeof r.start !== "string" || !TIME_RE.test(r.start)) {
    return { ok: false, error: "Enter a start time in 24-hour HH:MM format." };
  }
  if (typeof r.end !== "string" || !TIME_RE.test(r.end)) {
    return { ok: false, error: "Enter an end time in 24-hour HH:MM format." };
  }
  if (r.start === r.end) {
    return { ok: false, error: "A shift cannot start and end at the same time." };
  }
  if (shiftMinutes(r.start, r.end) > MAX_SHIFT_MINUTES) {
    return { ok: false, error: "Shifts can be at most 16 hours long." };
  }

  return {
    ok: true,
    value: {
      name,
      type,
      start: r.start,
      end: r.end,
      graceMinutes,
      expectedMinutes: null,
    },
  };
}

/** True when `end` is earlier on the 24-hour clock than `start` (for example 22:00 to 06:00). */
export function crossesMidnight(start: string, end: string): boolean {
  return toMinutes(end) < toMinutes(start);
}

/** Wall-clock length in minutes, counting across midnight. Real elapsed time comes from `shiftWindow`. */
export function shiftMinutes(start: string, end: string): number {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return e >= s ? e - s : 1440 - s + e;
}

function wallMsInZone(instantMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  let y = 0;
  let m = 0;
  let d = 0;
  let hh = 0;
  let mm = 0;
  let ss = 0;
  for (const p of parts) {
    if (p.type === "year") y = Number(p.value);
    else if (p.type === "month") m = Number(p.value);
    else if (p.type === "day") d = Number(p.value);
    else if (p.type === "hour") hh = Number(p.value);
    else if (p.type === "minute") mm = Number(p.value);
    else if (p.type === "second") ss = Number(p.value);
  }
  if (hh === 24) hh = 0;
  return Date.UTC(y, m - 1, d, hh, mm, ss);
}

/**
 * The real instant (ms since epoch) at which the clock in `timezone` first reads
 * `hhmm` on calendar day `day`.
 *
 * - Repeated wall time (clocks go back): returns the first occurrence.
 * - Non-existent wall time (clocks jump forward): returns the instant after the
 *   gap by the same amount (e.g. 02:30 during a 02:00->03:00 jump becomes 03:30).
 */
export function zonedTimeToMs(day: string, hhmm: string, timezone: string): number {
  const tz = safeTimezone(timezone);
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const targetWallMs = Date.UTC(y, m - 1, d, hh, mm, 0);

  const offsetAt = (ms: number): number => wallMsInZone(ms, tz) - ms;
  const roughOffset = offsetAt(targetWallMs);
  const center = targetWallMs - roughOffset;

  const offsetBefore = offsetAt(center - 6 * 3600_000);
  const sampleOffsets = [
    offsetBefore,
    offsetAt(center - 2 * 3600_000),
    roughOffset,
    offsetAt(center + 2 * 3600_000),
    offsetAt(center + 6 * 3600_000),
  ];

  // Testing candidate instants in ascending order picks the first occurrence when clocks go back.
  const candidates = Array.from(new Set(sampleOffsets.map((o) => targetWallMs - o))).sort(
    (a, b) => a - b,
  );
  for (const cand of candidates) {
    if (wallMsInZone(cand, tz) === targetWallMs) {
      return cand;
    }
  }

  // No candidate formatted back to targetWallMs, so the wall time fell inside a spring-forward gap.
  // Subtracting the pre-transition offset advances into the new offset by the exact gap distance.
  return targetWallMs - offsetBefore;
}

/** Works out the real start, end, and allowed scan window instants for an assignment. */
export function shiftWindow(
  assignment: ShiftAssignment,
  timezone: string,
  windowMinutes?: number,
): ShiftWindow {
  const tz = safeTimezone(timezone);
  const winMs = normalizeWindowMinutes(windowMinutes) * 60_000;
  const { dayKey: day, shift } = assignment;

  if (shift.type === "flex" || shift.start === null || shift.end === null) {
    const opensMs = startOfDayMs(day, tz);
    const closesMs = startOfDayMs(addDays(day, 1), tz) + winMs;
    return { startMs: null, endMs: null, opensMs, closesMs };
  }

  const startMs = zonedTimeToMs(day, shift.start, tz);
  const endDay = crossesMidnight(shift.start, shift.end) ? addDays(day, 1) : day;
  const endMs = zonedTimeToMs(endDay, shift.end, tz);
  return {
    startMs,
    endMs,
    opensMs: startMs - winMs,
    closesMs: endMs + winMs,
  };
}

function isValidAssignment(a: unknown): a is ShiftAssignment {
  if (!a || typeof a !== "object") return false;
  const rec = a as Record<string, unknown>;
  if (!isRealDay(rec.dayKey)) return false;
  if (!rec.shift || typeof rec.shift !== "object") return false;
  const s = rec.shift as Record<string, unknown>;
  if (typeof s.shiftId !== "string" || typeof s.name !== "string") return false;
  if (!isShiftType(s.type)) return false;
  if (typeof s.graceMinutes !== "number" || !Number.isFinite(s.graceMinutes) || s.graceMinutes < 0) {
    return false;
  }
  if (s.type !== "flex") {
    if (typeof s.start !== "string" || !TIME_RE.test(s.start)) return false;
    if (typeof s.end !== "string" || !TIME_RE.test(s.end)) return false;
  }
  return true;
}

interface EvaluatedAssignment {
  assignment: ShiftAssignment;
  window: ShiftWindow;
  lastType: "in" | "out" | null;
}

function tieBreak(a: EvaluatedAssignment, b: EvaluatedAssignment): number {
  if (a.assignment.dayKey !== b.assignment.dayKey) {
    return a.assignment.dayKey < b.assignment.dayKey ? -1 : 1;
  }
  if (a.assignment.shift.shiftId !== b.assignment.shift.shiftId) {
    return a.assignment.shift.shiftId < b.assignment.shift.shiftId ? -1 : 1;
  }
  return 0;
}

/**
 * Decides which assigned shift a scan at `nowMs` belongs to, its direction and
 * late/early flags, or whether it must be refused as outside the allowed window.
 */
export function classifyScan(input: ClassifyScanInput): ClassifyScanResult {
  const tz = safeTimezone(input.timezone);
  const { nowMs } = input;
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) {
    return { kind: "unassigned" };
  }

  const rawList = Array.isArray(input.assignments) ? input.assignments : [];
  const states = input.states && typeof input.states === "object" ? input.states : {};

  const evaluated: EvaluatedAssignment[] = [];
  for (const a of rawList) {
    if (!isValidAssignment(a)) continue;
    const st = states[a.dayKey];
    const lastType: "in" | "out" | null =
      st && (st.lastType === "in" || st.lastType === "out") ? st.lastType : null;
    evaluated.push({
      assignment: a,
      window: shiftWindow(a, tz, input.windowMinutes),
      lastType,
    });
  }

  let candidates = evaluated.filter(
    (c) => c.window.opensMs <= nowMs && nowMs <= c.window.closesMs,
  );

  if (candidates.length > 0) {
    if (candidates.length > 1) {
      const openIn = candidates.filter((c) => c.lastType === "in");
      if (openIn.length > 0) {
        candidates = openIn;
      } else {
        const notFinished = candidates.filter(
          (c) => !(c.window.endMs !== null && c.window.endMs <= nowMs && c.lastType === "out"),
        );
        if (notFinished.length > 0) {
          candidates = notFinished;
        }
      }
    }

    // Flex has no startMs but counts as started once its window is open.
    const started = candidates.filter(
      (c) => c.assignment.shift.type === "flex" || (c.window.startMs !== null && c.window.startMs <= nowMs),
    );

    let winner: EvaluatedAssignment;
    if (started.length > 0) {
      winner = [...started].sort((a, b) => {
        const aStart = a.window.startMs ?? a.window.opensMs;
        const bStart = b.window.startMs ?? b.window.opensMs;
        if (aStart !== bStart) return bStart - aStart; // latest startMs <= nowMs wins
        return tieBreak(a, b);
      })[0];
    } else {
      winner = [...candidates].sort((a, b) => {
        if (a.window.opensMs !== b.window.opensMs) return a.window.opensMs - b.window.opensMs;
        return tieBreak(a, b);
      })[0];
    }

    const direction: ScanDirection = winner.lastType === "in" ? "out" : "in";
    const isFlex = winner.assignment.shift.type === "flex";
    const nowMinute = Math.floor(nowMs / 60_000);

    const late =
      direction === "in" &&
      winner.lastType === null &&
      !isFlex &&
      winner.window.startMs !== null &&
      nowMinute > Math.floor(winner.window.startMs / 60_000) + winner.assignment.shift.graceMinutes;

    const earlyDeparture =
      direction === "out" &&
      !isFlex &&
      winner.window.endMs !== null &&
      nowMinute < Math.floor(winner.window.endMs / 60_000);

    return {
      kind: "matched",
      shiftDay: winner.assignment.dayKey,
      shift: winner.assignment.shift,
      direction,
      late,
      earlyDeparture,
      window: winner.window,
    };
  }

  const today = dayKey(nowMs, tz);
  if (!today) return { kind: "unassigned" };
  const yesterday = addDays(today, -1);

  const relevant = evaluated.filter(
    (c) => c.assignment.dayKey === today || c.assignment.dayKey === yesterday,
  );
  if (relevant.length === 0) {
    return { kind: "unassigned" };
  }

  const upcoming = relevant.filter((c) => c.window.opensMs > nowMs);
  if (upcoming.length > 0) {
    const nearest = [...upcoming].sort((a, b) => {
      if (a.window.opensMs !== b.window.opensMs) return a.window.opensMs - b.window.opensMs;
      return tieBreak(a, b);
    })[0];
    return {
      kind: "outside",
      reason: "too_early",
      shiftDay: nearest.assignment.dayKey,
      shift: nearest.assignment.shift,
      window: nearest.window,
    };
  }

  const latestClosed = [...relevant].sort((a, b) => {
    if (a.window.closesMs !== b.window.closesMs) return b.window.closesMs - a.window.closesMs;
    return tieBreak(a, b);
  })[0];
  return {
    kind: "outside",
    reason: "too_late",
    shiftDay: latestClosed.assignment.dayKey,
    shift: latestClosed.assignment.shift,
    window: latestClosed.window,
  };
}

/** Plain-language explanation shown on the employee's phone when a scan is outside the shift window. */
export function describeOutside(c: ClassifyScanOutside, timezone: string): string {
  const tz = safeTimezone(timezone);
  if (c.shift.type === "flex") {
    return `Your flexible shift for ${c.shiftDay} has closed. Please speak to your manager.`;
  }
  if (c.reason === "too_early") {
    const startText =
      c.shift.start ?? formatClock(c.window.startMs ?? c.window.opensMs, tz).slice(0, 5);
    const opensText = formatClock(c.window.opensMs, tz).slice(0, 5);
    return `Your shift starts at ${startText}. Scanning opens at ${opensText}.`;
  }
  const endText = c.shift.end ?? formatClock(c.window.endMs ?? c.window.closesMs, tz).slice(0, 5);
  const closesText = formatClock(c.window.closesMs, tz).slice(0, 5);
  return `Your shift ended at ${endText} and scanning closed at ${closesText}. Please speak to your manager.`;
}

/** Status of a person on a shift day for the Today panel and attendance register. */
export function shiftDayStatus(input: ShiftDayStatusInput): ShiftDayStatus {
  if (input.hasScan) return "present";
  if (input.onLeave) return "on_leave";
  if (input.isHoliday) return "holiday";
  if (!input.assignment || !isValidAssignment(input.assignment)) return "not_rostered";

  const tz = safeTimezone(input.timezone);
  const absentAfter =
    typeof input.absentAfterMinutes === "number" &&
    Number.isFinite(input.absentAfterMinutes) &&
    input.absentAfterMinutes >= 0 &&
    input.absentAfterMinutes <= 720
      ? input.absentAfterMinutes
      : DEFAULT_ABSENT_AFTER_MINUTES;

  const { dayKey: day, shift } = input.assignment;
  if (shift.type === "flex" || shift.start === null) {
    const dayEndMs = startOfDayMs(addDays(day, 1), tz);
    return input.nowMs < dayEndMs ? "expected" : "absent";
  }

  const startMs = zonedTimeToMs(day, shift.start, tz);
  const absentAtMs = startMs + absentAfter * 60_000;
  return input.nowMs < absentAtMs ? "expected" : "absent";
}

/** Lists every YYYY-MM-DD in [fromDay, toDay] matching `weekdays` (0 = Monday ... 6 = Sunday). */
export function expandAssignmentRange(
  input: ExpandAssignmentRangeInput,
): ExpandAssignmentRangeResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Choose a valid start date and end date." };
  }
  const { fromDay, toDay, weekdays } = input;
  if (!isRealDay(fromDay) || !isRealDay(toDay)) {
    return { ok: false, error: "Choose a valid start date and end date." };
  }
  if (fromDay > toDay) {
    return { ok: false, error: "The start date cannot be after the end date." };
  }
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    return { ok: false, error: "Choose at least one day of the week." };
  }
  const weekdaySet = new Set<number>();
  for (const w of weekdays) {
    if (typeof w !== "number" || !Number.isInteger(w) || w < 0 || w > 6) {
      return { ok: false, error: "Weekdays must be whole numbers from 0 (Monday) to 6 (Sunday)." };
    }
    weekdaySet.add(w);
  }

  const days: string[] = [];
  let count = 0;
  for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
    count++;
    if (count > MAX_ASSIGNMENT_RANGE_DAYS) {
      return {
        ok: false,
        error: `You can assign at most ${MAX_ASSIGNMENT_RANGE_DAYS} days at a time.`,
      };
    }
    if (weekdaySet.has(weekdayIndex(d))) {
      days.push(d);
    }
  }

  if (days.length === 0) {
    return { ok: false, error: "No dates in that range match the selected weekdays." };
  }
  return { ok: true, days };
}

/** Deterministic document id for a person's shift assignment on a date. */
export function assignmentId(employeeId: string, day: string): string {
  if (
    typeof employeeId !== "string" ||
    typeof day !== "string" ||
    employeeId.trim().length === 0 ||
    day.trim().length === 0 ||
    employeeId.includes("/") ||
    day.includes("/")
  ) {
    throw new Error("employeeId and day must be non-empty strings without '/'.");
  }
  return `${employeeId}_${day}`;
}
