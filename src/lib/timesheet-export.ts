/**
 * What the timesheet downloads contain (T3 of docs/TIMESHEET-DESIGN.md), as pure functions: they only use the
 * report they are given and do no calculating of their own beyond writing minutes as decimal hours, once, from the
 * total. The file-saving and the PDF drawing live elsewhere (timesheet-files.ts), so this can be tested directly.
 *
 * Every cell goes through the same formula-safe CSV writer as the other reports, so a name that starts with
 * `=`, `+`, `-` or `@` cannot run as a formula in Excel.
 */
import { STATUS_LABEL, buildCsv } from "./report-export.ts";
import { weekdayIndex } from "./attendance-today.ts";
import { formatDecimalHours, type TimesheetSummary } from "./timesheet.ts";
import type { TimesheetReport, TimesheetReportRow } from "./timesheet-build.ts";

type Cell = string | number | null;

/** The summary columns, in order, for the report as it was built (optional columns only when they apply). */
export function summaryColumns(report: Pick<TimesheetReport, "breaksTracked" | "diaryTracked" | "anyExpected">): string[] {
  return [
    "Name",
    "Department",
    "Days worked",
    "Hours at work",
    ...(report.breaksTracked ? ["Break hours"] : []),
    "Paid hours",
    ...(report.anyExpected ? ["Expected hours", "Extra (+) or short (-) hours"] : []),
    "Late days",
    "Absent days",
    "Leave days",
    "Work from home days",
    "Days with no check-out",
    ...(report.diaryTracked ? ["Work diary hours (approved)", "Work diary days flagged", "Work diary days waiting"] : []),
  ];
}

/** Hours with a sign, to two decimals, from minutes: "+1.33", "-0.75", "0.00". Empty when nothing was expected. */
function signedDecimalHours(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes === 0) return "0.00";
  return `${minutes > 0 ? "+" : "-"}${formatDecimalHours(Math.abs(minutes))}`;
}

export function summaryRow(report: Pick<TimesheetReport, "breaksTracked" | "diaryTracked" | "anyExpected">, r: TimesheetReportRow): Cell[] {
  const t = r.totals;
  return [
    r.name,
    r.department,
    t.daysWorked,
    formatDecimalHours(t.workedMinutes),
    ...(report.breaksTracked ? [formatDecimalHours(t.breakMinutes)] : []),
    formatDecimalHours(t.paidMinutes),
    ...(report.anyExpected
      ? [t.expectedMinutes === null ? "" : formatDecimalHours(t.expectedMinutes), signedDecimalHours(t.differenceMinutes)]
      : []),
    t.lateDays,
    t.absentDays,
    t.leaveDays,
    t.wfhDays,
    t.noCheckOutDays,
    ...(report.diaryTracked
      ? [formatDecimalHours(r.diary?.approvedMinutes ?? 0), r.diary?.flaggedDays ?? 0, r.diary?.waitingDays ?? 0]
      : []),
  ];
}

/** The summary file: one row per person. */
export function timesheetToCsv(report: TimesheetReport): string {
  return buildCsv([summaryColumns(report), ...report.rows.map((r) => summaryRow(report, r))]);
}

export function dailyColumns(report: Pick<TimesheetReport, "breaksTracked" | "anyExpected">): string[] {
  return [
    "Name",
    "Department",
    "Date",
    "Status",
    "First in",
    "Last out",
    "Hours at work",
    ...(report.breaksTracked ? ["Break hours"] : []),
    "Paid hours",
    ...(report.anyExpected ? ["Expected hours", "Extra (+) or short (-) hours"] : []),
    "Late",
    "Left early",
    "No check-out",
  ];
}

/** The daily detail: one row per person per day of the range. */
export function dailyRows(report: TimesheetReport): Cell[][] {
  const out: Cell[][] = [];
  for (const r of report.rows) {
    for (const d of r.days) {
      out.push([
        r.name,
        r.department,
        d.dayKey,
        STATUS_LABEL[d.status],
        d.firstIn ?? "",
        d.lastOut ?? "",
        formatDecimalHours(d.workedMinutes),
        ...(report.breaksTracked ? [formatDecimalHours(d.breakMinutes)] : []),
        formatDecimalHours(d.paidMinutes),
        ...(report.anyExpected
          ? [d.expectedMinutes === null ? "" : formatDecimalHours(d.expectedMinutes), signedDecimalHours(d.differenceMinutes)]
          : []),
        d.lateExcused ? "Yes (excused)" : d.late ? "Yes" : "",
        d.earlyDeparture ? "Yes" : "",
        d.noCheckOut ? "Yes" : "",
      ]);
    }
  }
  return out;
}

export function timesheetDailyToCsv(report: TimesheetReport): string {
  return buildCsv([dailyColumns(report), ...dailyRows(report)]);
}

/** The details sheet / PDF heading: what range, which timezone and when it was made (kept out of the CSV tables). */
export function timesheetDetails(report: Pick<TimesheetReport, "from" | "to" | "timezone" | "generatedAt" | "truncated">): [string, string][] {
  return [
    ["Report", "Timesheet"],
    ["From", report.from],
    ["To", report.to],
    ["Timezone", report.timezone],
    ["Generated at", report.generatedAt],
    ["Complete", report.truncated ? "No: the read stopped at a limit, choose a shorter range" : "Yes"],
    ["Hours", "Decimal hours worked out from whole minutes. Extra and short are a plain difference, not approved overtime."],
  ];
}

export type TimesheetFileKind = "timesheet" | "timesheet-daily";

export function timesheetFilename(kind: TimesheetFileKind, from: string, to: string, ext: "csv" | "pdf" | "xlsx"): string {
  return `${kind}_${from}_to_${to}.${ext}`;
}

/** What the screen shows after a search or department filter, so a download matches what is on screen. */
export function filterReport(report: TimesheetReport, keep: (r: TimesheetReportRow) => boolean, summarise: (rows: TimesheetReportRow[]) => TimesheetSummary): TimesheetReport {
  const rows = report.rows.filter(keep);
  return { ...report, rows, summary: summarise(rows) };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Mon 2 Nov" for "2026-11-02". The day is read as a calendar day, never through the device's timezone. */
export function dayLabel(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return dayKey;
  return `${WEEKDAYS[weekdayIndex(dayKey)]} ${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""}`.trim();
}
