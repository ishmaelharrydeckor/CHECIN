/**
 * The timesheet rules, as pure functions (T1 of docs/TIMESHEET-DESIGN.md).
 *
 * Takes the same per-day figures the attendance register is built from and works out, for each person,
 * the hours at work, the break, the paid time, what was expected, and the difference ("extra" and
 * "short", never called overtime: that is for a manager to approve, later). Everything is whole minutes
 * and is converted to hours only when written out, from the total, never by adding rounded numbers.
 *
 * Pure: no database, no clock reads, no device time, no alias imports (relative `.ts` imports only), so it
 * can be tested directly and reused by pay periods later. The caller decides what "today" and "still on
 * their shift" mean (from the server clock) and passes the answer in.
 */
import { shiftMinutes } from "./shift-engine.ts";
import { weekdayIndex } from "./attendance-today.ts";
import { standardMinutesFor, type StandardWorkday } from "./standard-workday.ts";

/** The same day states as the attendance register. */
export type TimesheetStatus = "present" | "absent" | "leave" | "holiday" | "wfh" | "off" | "other" | "expected";

/** The shift copied onto a day: when it starts and ends, and its fixed unpaid break. */
export interface TimesheetShift {
  start?: string | null;
  end?: string | null;
  unpaidBreakMinutes?: number;
}

/** One day of one person, as the register has it, plus what the timesheet needs to judge expected time. */
export interface TimesheetDayInput {
  dayKey: string;
  status: TimesheetStatus;
  firstIn: string | null;
  lastOut: string | null;
  /** Whole minutes in completed in-to-out sessions. An open session adds nothing. */
  minutesWorked: unknown;
  /** Only when the organization tracks breaks. */
  breakMinutes?: unknown;
  paidMinutes?: unknown;
  late: boolean;
  lateExcused?: boolean;
  earlyDeparture: boolean;
  /** There is a check-in with no check-out yet. */
  openSession: boolean;
  /** Today, and the person is still within their shift: not a missing check-out yet. */
  stillOnShift: boolean;
  /** The shift this person had that day, if any. Without one nothing is expected. */
  shift?: TimesheetShift | null;
}

export interface TimesheetDay {
  dayKey: string;
  status: TimesheetStatus;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  breakMinutes: number;
  paidMinutes: number;
  /** null: nothing is known to be expected (no shift). 0: this day owes no hours (leave, holiday, day off). */
  expectedMinutes: number | null;
  /** Paid minus expected; null when expected is null. */
  differenceMinutes: number | null;
  /** A check-in with no check-out, and the person is not still on their shift. */
  noCheckOut: boolean;
  /** Late and NOT excused. */
  late: boolean;
  lateExcused: boolean;
  earlyDeparture: boolean;
}

export interface TimesheetTotals {
  daysWorked: number;
  workedMinutes: number;
  breakMinutes: number;
  paidMinutes: number;
  /** null when no day expected any time (for example nobody on a shift). */
  expectedMinutes: number | null;
  /** Net paid minus expected over the days that expected something; null when expected is null. */
  differenceMinutes: number | null;
  /** The sum of the days that ran over, and of the days that fell short (both positive numbers). */
  extraMinutes: number;
  shortMinutes: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  wfhDays: number;
  noCheckOutDays: number;
}

export interface TimesheetRow {
  employeeId: string;
  name: string;
  department: string;
  days: TimesheetDay[];
  totals: TimesheetTotals;
}

export interface TimesheetOptions {
  /** The organization tracks breaks: expected time is the shift less its break, and paid time is shown. */
  breaksTracked: boolean;
  /**
   * The organization's standard workday, if an admin set one. It gives a person with NO shift an expected time (the
   * standard length on a work day, nothing on other days). Not set: they have no expected time, as before. A shift
   * always wins over it.
   */
  standardWorkday?: StandardWorkday | null;
}

// ----------------------------------------------------------------------------- small helpers

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A whole number of minutes, never negative; anything else is 0. */
function minutes(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * How long a shift is meant to last: its length across midnight, less its unpaid break when the organization
 * tracks breaks. null when there is no usable shift, so nothing is ever guessed. Never negative.
 */
export function expectedShiftMinutes(shift: TimesheetShift | null | undefined, breaksTracked: boolean): number | null {
  if (!shift || typeof shift.start !== "string" || typeof shift.end !== "string") return null;
  if (!HHMM.test(shift.start) || !HHMM.test(shift.end)) return null;
  const length = shiftMinutes(shift.start, shift.end);
  if (length <= 0) return null;
  const rest = breaksTracked ? minutes(shift.unpaidBreakMinutes) : 0;
  return Math.max(0, length - rest);
}

/** These days owe no hours, so they can never be short. */
const NO_HOURS_OWED: ReadonlySet<TimesheetStatus> = new Set(["holiday", "leave", "off", "wfh", "other", "expected"]);

// ----------------------------------------------------------------------------- one day

export function buildTimesheetDay(input: TimesheetDayInput, options: TimesheetOptions): TimesheetDay {
  const worked = minutes(input.minutesWorked);
  let breakMins = 0;
  let paid = worked;
  if (options.breaksTracked) {
    breakMins = minutes(input.breakMinutes);
    paid =
      typeof input.paidMinutes === "number" && Number.isFinite(input.paidMinutes) && input.paidMinutes >= 0
        ? Math.floor(input.paidMinutes)
        : Math.max(0, worked - breakMins);
  }

  let expected = NO_HOURS_OWED.has(input.status) ? 0 : expectedShiftMinutes(input.shift, options.breaksTracked);
  if (expected === null && options.standardWorkday && /^\d{4}-\d{2}-\d{2}$/.test(input.dayKey)) {
    expected = standardMinutesFor(options.standardWorkday, weekdayIndex(input.dayKey));
  }
  const lateExcused = input.lateExcused === true;

  return {
    dayKey: input.dayKey,
    status: input.status,
    firstIn: input.firstIn ?? null,
    lastOut: input.lastOut ?? null,
    workedMinutes: worked,
    breakMinutes: breakMins,
    paidMinutes: paid,
    expectedMinutes: expected,
    differenceMinutes: expected === null ? null : paid - expected,
    noCheckOut: input.openSession === true && input.stillOnShift !== true,
    late: input.late === true && !lateExcused,
    lateExcused: input.late === true && lateExcused,
    earlyDeparture: input.earlyDeparture === true,
  };
}

// ----------------------------------------------------------------------------- one person

export function buildTimesheetRow(
  person: { employeeId: string; name: string; department: string; days: readonly TimesheetDayInput[] },
  options: TimesheetOptions,
): TimesheetRow {
  const days = person.days.map((d) => buildTimesheetDay(d, options));

  const t: TimesheetTotals = {
    daysWorked: 0,
    workedMinutes: 0,
    breakMinutes: 0,
    paidMinutes: 0,
    expectedMinutes: null,
    differenceMinutes: null,
    extraMinutes: 0,
    shortMinutes: 0,
    lateDays: 0,
    absentDays: 0,
    leaveDays: 0,
    wfhDays: 0,
    noCheckOutDays: 0,
  };

  let expected = 0;
  let difference = 0;
  let anyExpected = false;

  for (const d of days) {
    if (d.status === "present") t.daysWorked += 1;
    if (d.status === "absent") t.absentDays += 1;
    if (d.status === "leave") t.leaveDays += 1;
    if (d.status === "wfh") t.wfhDays += 1;
    if (d.late) t.lateDays += 1;
    if (d.noCheckOut) t.noCheckOutDays += 1;
    t.workedMinutes += d.workedMinutes;
    t.breakMinutes += d.breakMinutes;
    t.paidMinutes += d.paidMinutes;

    if (d.expectedMinutes !== null) {
      expected += d.expectedMinutes;
      if (d.expectedMinutes > 0) anyExpected = true;
    }
    if (d.differenceMinutes !== null) {
      difference += d.differenceMinutes;
      if (d.differenceMinutes > 0) t.extraMinutes += d.differenceMinutes;
      if (d.differenceMinutes < 0) t.shortMinutes += -d.differenceMinutes;
    }
  }

  if (anyExpected) {
    t.expectedMinutes = expected;
    t.differenceMinutes = difference;
  } else {
    // Nobody was owed hours (no shift, or only days off): nothing is claimed as extra or short.
    t.extraMinutes = 0;
    t.shortMinutes = 0;
  }

  return { employeeId: person.employeeId, name: person.name, department: person.department, days, totals: t };
}

// ----------------------------------------------------------------------------- the strip above the table

export interface TimesheetSummary {
  people: number;
  workedMinutes: number;
  breakMinutes: number;
  paidMinutes: number;
  /** Adds only the people who had something expected. */
  expectedMinutes: number;
  /** The net of everyone's difference; extra and short below are never cancelled against each other. */
  differenceMinutes: number;
  extraMinutes: number;
  shortMinutes: number;
  lateDays: number;
  absentDays: number;
  noCheckOutDays: number;
}

export function timesheetSummary(rows: readonly TimesheetRow[]): TimesheetSummary {
  const s: TimesheetSummary = {
    people: rows.length,
    workedMinutes: 0,
    breakMinutes: 0,
    paidMinutes: 0,
    expectedMinutes: 0,
    differenceMinutes: 0,
    extraMinutes: 0,
    shortMinutes: 0,
    lateDays: 0,
    absentDays: 0,
    noCheckOutDays: 0,
  };
  for (const r of rows) {
    const t = r.totals;
    s.workedMinutes += t.workedMinutes;
    s.breakMinutes += t.breakMinutes;
    s.paidMinutes += t.paidMinutes;
    s.expectedMinutes += t.expectedMinutes ?? 0;
    s.differenceMinutes += t.differenceMinutes ?? 0;
    s.extraMinutes += t.extraMinutes;
    s.shortMinutes += t.shortMinutes;
    s.lateDays += t.lateDays;
    s.absentDays += t.absentDays;
    s.noCheckOutDays += t.noCheckOutDays;
  }
  return s;
}

// ----------------------------------------------------------------------------- writing the numbers

/** "7h 30m", "45m", "0m". Negative or damaged numbers read as 0m. */
export function formatHoursMinutes(totalMinutes: unknown): string {
  const m = minutes(totalMinutes);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Decimal hours to two places, worked out once from the total minutes: 450 gives "7.50". */
export function formatDecimalHours(totalMinutes: unknown): string {
  return (minutes(totalMinutes) / 60).toFixed(2);
}

/** "+1h 20m" for extra, "-45m" for short, "0m" for none, and an empty string when nothing is expected. */
export function formatSignedMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (value === 0) return "0m";
  return `${value > 0 ? "+" : "-"}${formatHoursMinutes(Math.abs(value))}`;
}
