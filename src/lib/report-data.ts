/**
 * The attendance register and the leave ledger, worked out on the server (never in the browser).
 *
 * The register reads daily summaries (see daily-summary.ts), the people the caller is responsible
 * for, approved leave and the organization's holidays. Every day gets exactly one status:
 *
 *   present  the person has a summary for the day (they scanned)
 *   leave    no scan, and an approved leave request covers the day
 *   holiday  no scan, and the organization marked the day as a holiday
 *   off      no scan, on a Saturday or Sunday (nobody is expected)
 *   absent   no scan on a weekday that is not leave or a holiday
 *
 * A scan always wins: someone who worked on a holiday or a weekend shows as present.
 * Working days are Monday to Friday until the product has real work schedules (shifts are a later
 * phase); the dashboard's weekly chart makes the same assumption.
 *
 * Pure functions: no Firebase and no path aliases, so they can be unit tested directly.
 */
import { dayKey, formatClock } from "./attendance-day.ts";
import { addDays, weekdayIndex } from "./attendance-today.ts";
import { LEAVE_TYPE_LABELS, countDays, isLeaveType } from "./leave.ts";
import { shiftDayStatus, type ShiftSnapshot } from "./shift-engine.ts";
import { DEFAULT_DEDUCT_AFTER_MINUTES, computePaidTime } from "./shift-breaks.ts";
import type {
  AttendanceRegister,
  LeaveLedger,
  LeaveLedgerRow,
  RegisterDay,
  RegisterRow,
} from "./report-types.ts";

export const MAX_REPORT_DAYS = 31;
/** The most daily records one register may read (people x days); the same ceiling as WEEK_SUMMARY_CAP. */
export const REGISTER_READ_BUDGET = 6000;

/**
 * How many days one register can cover for a team of this size: as many as the read budget allows (at most 31,
 * at least 1). A longer range would be cut off while reading and would show people as absent on days that were
 * simply not read, so the route refuses it with a sentence instead (see registerRangeError).
 */
export function maxRegisterDays(headcount: number, budget = REGISTER_READ_BUDGET): number {
  return Math.max(1, Math.min(MAX_REPORT_DAYS, Math.floor(budget / Math.max(1, headcount))));
}

/** The plain sentence for a range that is too long for this team, or null when it is fine. */
export function registerRangeError(headcount: number, rangeDays: number, budget = REGISTER_READ_BUDGET): string | null {
  const most = maxRegisterDays(headcount, budget);
  if (rangeDays <= most) return null;
  return `Your team has ${headcount} people, so a register can cover at most ${most} ${most === 1 ? "day" : "days"} at a time. Please choose a shorter range.`;
}
/** The most people (register) or requests (ledger) one report returns; beyond it the report says so. */
export const REPORT_ROW_CAP = 500;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(key: string): boolean {
  if (!DAY_RE.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export type RangeResult = { ok: true; from: string; to: string; days: string[] } | { ok: false; error: string };

/** Checks a date range from a request and lists its days. Messages are plain language. */
export function parseReportRange(from: unknown, to: unknown): RangeResult {
  if (typeof from !== "string" || typeof to !== "string" || !isRealDay(from) || !isRealDay(to)) {
    return { ok: false, error: "Please choose both a start date and an end date." };
  }
  if (to < from) return { ok: false, error: "The end date can't be before the start date." };
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push(d);
    if (days.length > MAX_REPORT_DAYS) {
      return { ok: false, error: `Please choose a range of ${MAX_REPORT_DAYS} days or fewer.` };
    }
  }
  return { ok: true, from, to, days };
}

export interface ReportPerson {
  uid: string;
  displayName?: string;
  email?: string;
  department?: string;
}

export interface ReportSummary {
  employeeId?: unknown;
  employeeName?: unknown;
  department?: unknown;
  dayKey?: unknown;
  firstIn?: unknown;
  lastOut?: unknown;
  minutesWorked?: unknown;
  late?: unknown;
  lateExcused?: unknown;
  earlyDeparture?: unknown;
  /** The shift's fixed unpaid break, copied onto the day (see daily-summary.ts). */
  shiftUnpaidBreakMinutes?: unknown;
  shiftDeductAfterMinutes?: unknown;
}

export interface ReportLeave {
  id?: string;
  employeeId?: unknown;
  employeeName?: unknown;
  type?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  status?: unknown;
  /** ISO text or a Date; the moment a manager decided. */
  reviewedAt?: unknown;
}

/** A name for a person on a report. Never an ID. */
export function personName(p: Pick<ReportPerson, "displayName" | "email">): string {
  const name = (p.displayName ?? "").trim();
  if (name) return name;
  const local = (p.email ?? "").split("@")[0]?.trim();
  return local || "Unknown";
}

function clock(v: unknown, timezone: string): string | null {
  return typeof v === "string" ? formatClock(v, timezone).slice(0, 5) || null : null;
}

const isDay = (v: unknown): v is string => typeof v === "string" && DAY_RE.test(v);

/**
 * Time at work, the break and paid time for one day. The minutes from the scans are never changed: the
 * break is worked out beside them (src/lib/shift-breaks.ts). A damaged or missing break means no break.
 */
function breakFigures(s: ReportSummary, worked: number): { breakMinutes: number; paidMinutes: number } {
  const b = s.shiftUnpaidBreakMinutes;
  const a = s.shiftDeductAfterMinutes;
  const unpaidBreakMinutes = typeof b === "number" && Number.isInteger(b) && b >= 0 && b <= 240 ? b : 0;
  const deductAfterMinutes =
    typeof a === "number" && Number.isInteger(a) && a >= 0 && a <= 720 ? a : DEFAULT_DEDUCT_AFTER_MINUTES;
  const r = computePaidTime({ workedMinutes: worked, unpaidBreakMinutes, deductAfterMinutes });
  return { breakMinutes: r.breakMinutes, paidMinutes: r.paidMinutes };
}

function presentDay(d: string, s: ReportSummary, timezone: string, breaks = false): RegisterDay {
  const worked = typeof s.minutesWorked === "number" && s.minutesWorked > 0 ? Math.round(s.minutesWorked) : 0;
  return {
    ...(breaks ? breakFigures(s, worked) : {}),
    dayKey: d,
    status: "present",
    firstIn: clock(s.firstIn, timezone),
    lastOut: clock(s.lastOut, timezone),
    minutesWorked: typeof s.minutesWorked === "number" && s.minutesWorked > 0 ? Math.round(s.minutesWorked) : 0,
    late: s.late === true && s.lateExcused !== true,
    lateExcused: s.late === true && s.lateExcused === true,
    earlyDeparture: s.earlyDeparture === true,
  };
}

/** One person-day of the work diary, as the register needs it. */
export interface ReportDiaryDay {
  employeeId: string;
  dayKey: string;
  status: string;
  verifiedMinutes: number;
}

/**
 * Work-diary figures for one person over the report's days. Only an APPROVED day's verified minutes are
 * hours; flagged days and days still waiting are counted, never added to anything. Scanned hours
 * (minutesWorked) are never changed by the diary.
 */
export function diaryTotals(
  days: readonly string[],
  mine: readonly ReportDiaryDay[] | undefined,
): { diaryApprovedMinutes: number; diaryFlaggedDays: number; diaryWaitingDays: number } {
  const inRange = new Set(days);
  const seen = new Set<string>();
  const out = { diaryApprovedMinutes: 0, diaryFlaggedDays: 0, diaryWaitingDays: 0 };
  for (const d of mine ?? []) {
    if (!inRange.has(d.dayKey) || seen.has(d.dayKey)) continue;
    seen.add(d.dayKey);
    if (d.status === "approved") {
      out.diaryApprovedMinutes += typeof d.verifiedMinutes === "number" && Number.isFinite(d.verifiedMinutes) && d.verifiedMinutes > 0 ? Math.round(d.verifiedMinutes) : 0;
    } else if (d.status === "flagged") out.diaryFlaggedDays++;
    else out.diaryWaitingDays++;
  }
  return out;
}

function breakTotals(days: readonly RegisterDay[]): { breakMinutes: number; paidMinutes: number } {
  return {
    breakMinutes: days.reduce((n, x) => n + (x.breakMinutes ?? 0), 0),
    paidMinutes: days.reduce((n, x) => n + (x.paidMinutes ?? 0), 0),
  };
}

export function buildAttendanceRegister(input: {
  days: readonly string[];
  people: readonly ReportPerson[];
  summaries: readonly ReportSummary[];
  leaves: readonly ReportLeave[];
  holidays: readonly string[];
  timezone: string;
  generatedAt: string;
  from: string;
  to: string;
  /** Self-declared work-from-home days (docs/WFH-DESIGN.md). A scan or approved leave on the same day wins. */
  wfh?: readonly { employeeId: string; dayKey: string }[];
  /** The organization tracks breaks: add break and paid-time figures. Time at work is never changed. */
  breaks?: boolean;
  /** Work-diary days for the range (the diary is on): add the diary columns, apart from scanned hours. */
  diary?: readonly ReportDiaryDay[];
  diaryTracked?: boolean;
  /** True if a read stopped at its safety cap, so the report may be missing people or days. */
  readTruncated?: boolean;
  shifts?: {
    assignments: { employeeId: string; dayKey: string; shift: ShiftSnapshot }[];
    nowMs: number;
  };
}): AttendanceRegister {
  const { days, timezone } = input;
  const breaks = input.breaks === true;
  const diaryTracked = input.diaryTracked === true;
  const diaryByPerson = new Map<string, ReportDiaryDay[]>();
  for (const d of input.diary ?? []) {
    if (!d || typeof d.employeeId !== "string" || typeof d.dayKey !== "string") continue;
    const list = diaryByPerson.get(d.employeeId) ?? [];
    list.push(d);
    diaryByPerson.set(d.employeeId, list);
  }
  const holiday = new Set(input.holidays);

  const byPerson = new Map<string, Map<string, ReportSummary>>();
  for (const s of input.summaries) {
    if (typeof s.employeeId !== "string" || !isDay(s.dayKey)) continue;
    let m = byPerson.get(s.employeeId);
    if (!m) byPerson.set(s.employeeId, (m = new Map()));
    m.set(s.dayKey, s);
  }

  const leavesByPerson = new Map<string, { start: string; end: string }[]>();
  for (const l of input.leaves) {
    if (l.status !== "approved" || typeof l.employeeId !== "string") continue;
    if (!isDay(l.startDate) || !isDay(l.endDate)) continue;
    const list = leavesByPerson.get(l.employeeId) ?? [];
    list.push({ start: l.startDate, end: l.endDate });
    leavesByPerson.set(l.employeeId, list);
  }

  const wfhSet = new Set((input.wfh ?? []).map((w) => `${w.employeeId}|${w.dayKey}`));

  const assignmentsByPersonDay = new Map<string, Map<string, ShiftSnapshot>>();
  if (input.shifts) {
    for (const a of input.shifts.assignments) {
      if (!a || typeof a.employeeId !== "string" || !isDay(a.dayKey) || !a.shift) continue;
      let m = assignmentsByPersonDay.get(a.employeeId);
      if (!m) assignmentsByPersonDay.set(a.employeeId, (m = new Map()));
      m.set(a.dayKey, a.shift);
    }
  }

  const people = [...input.people].sort((a, b) => personName(a).localeCompare(personName(b)));
  const capped = people.slice(0, REPORT_ROW_CAP);

  const rows: RegisterRow[] = capped.map((p) => {
    const mine = byPerson.get(p.uid);
    const leave = leavesByPerson.get(p.uid) ?? [];
    const outDays: RegisterDay[] = days.map((d): RegisterDay => {
      const s = mine?.get(d);
      if (s) return presentDay(d, s, timezone, breaks);
      const blank = { dayKey: d, firstIn: null, lastOut: null, minutesWorked: 0, late: false, earlyDeparture: false };
      if (leave.some((l) => l.start <= d && d <= l.end)) return { ...blank, status: "leave" };
      // Declared work from home counts as attended (no hours are recorded for it).
      if (wfhSet.has(`${p.uid}|${d}`)) return { ...blank, status: "wfh" };
      if (holiday.has(d)) return { ...blank, status: "holiday" };

      if (!input.shifts) {
        if (weekdayIndex(d) >= 5) return { ...blank, status: "off" };
        return { ...blank, status: "absent" };
      }

      // Shifts-aware decision:
      const shiftSnapshot = assignmentsByPersonDay.get(p.uid)?.get(d);
      if (!shiftSnapshot) return { ...blank, status: "off" };

      const today = dayKey(input.shifts.nowMs, timezone) ?? new Date(input.shifts.nowMs).toISOString().slice(0, 10);
      if (d < today) return { ...blank, status: "absent" };
      if (d > today) return { ...blank, status: "expected" };

      const st = shiftDayStatus({
        assignment: { dayKey: d, shift: shiftSnapshot },
        hasScan: false,
        onLeave: false,
        isHoliday: false,
        nowMs: input.shifts.nowMs,
        timezone,
      });
      return { ...blank, status: st === "absent" ? "absent" : "expected" };
    });
    const count = (f: (x: RegisterDay) => boolean) => outDays.filter(f).length;
    return {
      employeeId: p.uid,
      name: personName(p),
      department: (p.department ?? "").trim(),
      days: outDays,
      totals: {
        presentDays: count((x) => x.status === "present"),
        lateDays: count((x) => x.status === "present" && x.late),
        absentDays: count((x) => x.status === "absent"),
        leaveDays: count((x) => x.status === "leave"),
        wfhDays: count((x) => x.status === "wfh"),
        minutesWorked: outDays.reduce((n, x) => n + x.minutesWorked, 0),
        ...(breaks ? breakTotals(outDays) : {}),
        ...(diaryTracked ? diaryTotals(days, diaryByPerson.get(p.uid)) : {}),
      },
    };
  });

  // People who have since left this team but whose days under this manager are in the read: they
  // keep a row for the days that were managed here. Days without a record are "other": no claim
  // is made about them (they may have been absent, or on another team).
  const known = new Set(input.people.map((p) => p.uid));
  const former: RegisterRow[] = [];
  for (const [employeeId, mine] of byPerson) {
    if (known.has(employeeId) || !days.some((d) => mine.has(d))) continue;
    let name = "";
    let department = "";
    for (const s of mine.values()) {
      if (!name && typeof s.employeeName === "string") name = s.employeeName.trim();
      if (!department && typeof s.department === "string") department = s.department.trim();
    }
    const outDays: RegisterDay[] = days.map((d): RegisterDay => {
      const s = mine.get(d);
      if (s) return presentDay(d, s, timezone, breaks);
      return { dayKey: d, status: "other", firstIn: null, lastOut: null, minutesWorked: 0, late: false, earlyDeparture: false };
    });
    former.push({
      employeeId,
      name: name || "Former team member",
      department,
      days: outDays,
      totals: {
        presentDays: outDays.filter((x) => x.status === "present").length,
        lateDays: outDays.filter((x) => x.status === "present" && x.late).length,
        absentDays: 0,
        leaveDays: 0,
        wfhDays: 0,
        minutesWorked: outDays.reduce((n, x) => n + x.minutesWorked, 0),
        ...(breaks ? breakTotals(outDays) : {}),
        ...(diaryTracked ? diaryTotals(days, diaryByPerson.get(employeeId)) : {}),
      },
    });
  }
  former.sort((a, b) => a.name.localeCompare(b.name));
  const room = Math.max(0, REPORT_ROW_CAP - rows.length);

  return {
    from: input.from,
    to: input.to,
    timezone,
    generatedAt: input.generatedAt,
    rows: [...rows, ...former.slice(0, room)],
    ...(breaks ? { breaksTracked: true } : {}),
    ...(diaryTracked ? { diaryTracked: true } : {}),
    truncated: input.readTruncated === true || people.length > REPORT_ROW_CAP || former.length > room,
  };
}

/** "YYYY-MM-DD" in the organization's timezone for a Firestore timestamp, Date or ISO text. */
export function decidedOnDay(value: unknown, timezone: string): string | null {
  let ms: number | null = null;
  if (value instanceof Date) ms = value.getTime();
  else if (typeof value === "string") ms = Date.parse(value);
  else if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") ms = (value as { toMillis: () => number }).toMillis();
  if (ms === null || !Number.isFinite(ms)) return null;
  return dayKey(ms, timezone);
}

export function buildLeaveLedger(input: {
  people: readonly ReportPerson[];
  leaves: readonly ReportLeave[];
  timezone: string;
  generatedAt: string;
  from: string;
  to: string;
  readTruncated?: boolean;
}): LeaveLedger {
  const byId = new Map(input.people.map((p) => [p.uid, p]));
  const rows: LeaveLedgerRow[] = [];
  for (const l of input.leaves) {
    if (typeof l.employeeId !== "string" || !isDay(l.startDate) || !isDay(l.endDate)) continue;
    if (l.status !== "pending" && l.status !== "approved" && l.status !== "denied") continue;
    // Overlaps the range at all
    if (l.startDate > input.to || l.endDate < input.from) continue;
    const person = byId.get(l.employeeId);
    const saved = typeof l.employeeName === "string" ? l.employeeName.trim() : "";
    rows.push({
      id: typeof l.id === "string" ? l.id : `${l.employeeId}_${l.startDate}`,
      employeeId: l.employeeId,
      name: person ? personName(person) : saved || "Former team member",
      department: (person?.department ?? "").trim(),
      type: typeof l.type === "string" && isLeaveType(l.type) ? LEAVE_TYPE_LABELS[l.type] : "Other",
      startDate: l.startDate,
      endDate: l.endDate,
      days: countDays(l.startDate, l.endDate),
      status: l.status,
      decidedOn: l.status === "pending" ? null : decidedOnDay(l.reviewedAt, input.timezone),
    });
  }
  rows.sort((a, b) =>
    a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.name.localeCompare(b.name),
  );
  return {
    from: input.from,
    to: input.to,
    generatedAt: input.generatedAt,
    rows: rows.slice(0, REPORT_ROW_CAP),
    truncated: input.readTruncated === true || rows.length > REPORT_ROW_CAP,
  };
}
