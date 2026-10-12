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
import type {
  AttendanceRegister,
  LeaveLedger,
  LeaveLedgerRow,
  RegisterDay,
  RegisterRow,
} from "./report-types.ts";

export const MAX_REPORT_DAYS = 31;
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
  earlyDeparture?: unknown;
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

function presentDay(d: string, s: ReportSummary, timezone: string): RegisterDay {
  return {
    dayKey: d,
    status: "present",
    firstIn: clock(s.firstIn, timezone),
    lastOut: clock(s.lastOut, timezone),
    minutesWorked: typeof s.minutesWorked === "number" && s.minutesWorked > 0 ? Math.round(s.minutesWorked) : 0,
    late: s.late === true,
    earlyDeparture: s.earlyDeparture === true,
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
  /** True if a read stopped at its safety cap, so the report may be missing people or days. */
  readTruncated?: boolean;
}): AttendanceRegister {
  const { days, timezone } = input;
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

  const people = [...input.people].sort((a, b) => personName(a).localeCompare(personName(b)));
  const capped = people.slice(0, REPORT_ROW_CAP);

  const rows: RegisterRow[] = capped.map((p) => {
    const mine = byPerson.get(p.uid);
    const leave = leavesByPerson.get(p.uid) ?? [];
    const outDays: RegisterDay[] = days.map((d): RegisterDay => {
      const s = mine?.get(d);
      if (s) return presentDay(d, s, timezone);
      const blank = { dayKey: d, firstIn: null, lastOut: null, minutesWorked: 0, late: false, earlyDeparture: false };
      if (leave.some((l) => l.start <= d && d <= l.end)) return { ...blank, status: "leave" };
      if (holiday.has(d)) return { ...blank, status: "holiday" };
      if (weekdayIndex(d) >= 5) return { ...blank, status: "off" };
      return { ...blank, status: "absent" };
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
        minutesWorked: outDays.reduce((n, x) => n + x.minutesWorked, 0),
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
      if (s) return presentDay(d, s, timezone);
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
        minutesWorked: outDays.reduce((n, x) => n + x.minutesWorked, 0),
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
