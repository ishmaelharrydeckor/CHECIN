/**
 * Builds the timesheet report from the attendance register (T2 of docs/TIMESHEET-DESIGN.md).
 *
 * The register already decided, for every person and day, the status, the times, the hours, the break and
 * paid time, and who is late. This adds only what the timesheet needs on top: the shift for each day (to know
 * what was expected) and whether a check-in is still waiting for its check-out. Because the register is the
 * starting point, the timesheet and the register can never disagree about a day.
 *
 * Pure: no database, no clock reads (the caller passes `nowMs`), no alias imports.
 */
import type { AttendanceRegister, RegisterRow } from "./report-types.ts";
import { dayKey as dayKeyOf } from "./attendance-day.ts";
import { addDays } from "./attendance-today.ts";
import { crossesMidnight, zonedTimeToMs } from "./shift-engine.ts";
import type { StandardWorkday } from "./standard-workday.ts";
import {
  buildTimesheetRow,
  timesheetSummary,
  type TimesheetDayInput,
  type TimesheetRow,
  type TimesheetShift,
  type TimesheetSummary,
} from "./timesheet.ts";

/** The parts of a stored daily summary the timesheet reads. */
export interface TimesheetSummaryInput {
  employeeId?: unknown;
  dayKey?: unknown;
  shiftStart?: unknown;
  shiftEnd?: unknown;
  shiftUnpaidBreakMinutes?: unknown;
  /** Start of the session that is still open, or null when checked out. */
  openSince?: unknown;
}

/** A person's shift on a day from the rota, used for days with no summary (for example an absent day). */
export interface TimesheetAssignmentInput {
  employeeId: string;
  dayKey: string;
  shift: { start?: string | null; end?: string | null; unpaidBreakMinutes?: number } | null;
}

export interface TimesheetReportRow extends TimesheetRow {
  /** Only when the work diary is on. Kept apart from scanned hours; never added to them. */
  diary?: { approvedMinutes: number; flaggedDays: number; waitingDays: number };
}

export interface TimesheetReport {
  from: string;
  to: string;
  timezone: string;
  generatedAt: string;
  rows: TimesheetReportRow[];
  summary: TimesheetSummary;
  /** True if the register stopped at a limit, so people or days may be missing. */
  truncated: boolean;
  breaksTracked: boolean;
  diaryTracked: boolean;
  /** At least one person-day had an expected length (so Expected and Difference mean something). */
  anyExpected: boolean;
  /** The organization's standard workday for people with no shift, or null when none is set. */
  standardWorkday: StandardWorkday | null;
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function shiftFrom(start: unknown, end: unknown, unpaid: unknown): TimesheetShift | null {
  if (!isText(start) || !isText(end)) return null;
  return { start, end, ...(typeof unpaid === "number" ? { unpaidBreakMinutes: unpaid } : {}) };
}

/**
 * Is a person who is checked in still within their shift? With a shift: until the shift's end (a night shift
 * ends on the next calendar day). Without one: only on the day itself, in the organization's timezone.
 */
function stillOnShift(day: string, shift: TimesheetShift | null, nowMs: number, timezone: string): boolean {
  if (shift && isText(shift.start) && isText(shift.end)) {
    const endDay = crossesMidnight(shift.start, shift.end) ? addDays(day, 1) : day;
    return nowMs <= zonedTimeToMs(endDay, shift.end, timezone);
  }
  return dayKeyOf(nowMs, timezone) === day;
}

export function buildTimesheetReport(input: {
  register: AttendanceRegister;
  summaries: readonly TimesheetSummaryInput[];
  assignments?: readonly TimesheetAssignmentInput[];
  nowMs: number;
  /** Set by an org admin; gives people with no shift an expected time. */
  standardWorkday?: StandardWorkday | null;
}): TimesheetReport {
  const { register, nowMs } = input;
  const breaksTracked = register.breaksTracked === true;
  const diaryTracked = register.diaryTracked === true;
  const tz = register.timezone;

  const summaryOf = new Map<string, TimesheetSummaryInput>();
  for (const s of input.summaries) {
    if (isText(s.employeeId) && isText(s.dayKey)) summaryOf.set(`${s.employeeId}|${s.dayKey}`, s);
  }
  const assignmentOf = new Map<string, TimesheetAssignmentInput>();
  for (const a of input.assignments ?? []) {
    if (a && isText(a.employeeId) && isText(a.dayKey)) assignmentOf.set(`${a.employeeId}|${a.dayKey}`, a);
  }

  const rows: TimesheetReportRow[] = register.rows.map((row: RegisterRow) => {
    const days: TimesheetDayInput[] = row.days.map((d) => {
      const key = `${row.employeeId}|${d.dayKey}`;
      const summary = summaryOf.get(key);
      const planned = assignmentOf.get(key)?.shift ?? null;

      // The shift the day really had (copied onto its summary) wins over the rota; the rota fills in days with
      // no summary, such as an absent day.
      const shift =
        (summary && shiftFrom(summary.shiftStart, summary.shiftEnd, summary.shiftUnpaidBreakMinutes)) ||
        (planned && shiftFrom(planned.start, planned.end, planned.unpaidBreakMinutes)) ||
        null;

      const openSession = d.status === "present" && summary !== undefined && isText(summary.openSince);

      return {
        dayKey: d.dayKey,
        status: d.status,
        firstIn: d.firstIn,
        lastOut: d.lastOut,
        minutesWorked: d.minutesWorked,
        breakMinutes: d.breakMinutes,
        paidMinutes: d.paidMinutes,
        // The register keeps "late" for late-and-not-excused and "lateExcused" apart; together they are "was late".
        late: d.late || d.lateExcused === true,
        lateExcused: d.lateExcused === true,
        earlyDeparture: d.earlyDeparture,
        openSession,
        stillOnShift: openSession && stillOnShift(d.dayKey, shift, nowMs, tz),
        shift,
      };
    });

    const built = buildTimesheetRow(
      { employeeId: row.employeeId, name: row.name, department: row.department, days },
      { breaksTracked, standardWorkday: input.standardWorkday ?? null },
    );
    const t = row.totals;
    return diaryTracked
      ? {
          ...built,
          diary: {
            approvedMinutes: t.diaryApprovedMinutes ?? 0,
            flaggedDays: t.diaryFlaggedDays ?? 0,
            waitingDays: t.diaryWaitingDays ?? 0,
          },
        }
      : built;
  });

  return {
    from: register.from,
    to: register.to,
    timezone: tz,
    generatedAt: register.generatedAt,
    rows,
    summary: timesheetSummary(rows),
    truncated: register.truncated === true,
    breaksTracked,
    diaryTracked,
    anyExpected: rows.some((r) => r.totals.expectedMinutes !== null),
    standardWorkday: input.standardWorkday ?? null,
  };
}
