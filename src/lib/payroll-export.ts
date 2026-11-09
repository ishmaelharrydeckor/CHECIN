/**
 * What a payroll export contains (docs/PAYROLL-OVERTIME-DESIGN.md, section 3.3), as pure functions.
 *
 * Two files are built from a LOCKED period's frozen lines, never from live numbers: a summary (one row per person)
 * and a daily detail (one row per person per day). The admin chooses and orders the summary columns and picks decimal
 * hours (7.50) or HH:MM (7:30). Hours are written once, from the total minutes, never by adding rounded numbers.
 * The file header names the period, the version and the lock time, and carries no "downloaded at", so the same locked
 * period gives the same file every time. Every cell goes through the formula-safe CSV writer used by the reports.
 *
 * ChecIN measures time and never calculates pay: there are no rates and no money here. Work from home is a day count
 * with no hours. Pure: no database, no clock reads, no device time, no alias imports.
 */
import { buildCsv } from "./report-export.ts";
import { formatDecimalHours } from "./timesheet.ts";
import type { PeriodLine } from "./pay-period-lock.ts";

export type HoursFormat = "decimal" | "hhmm";

export type SummaryColumnId =
  | "payrollCode"
  | "name"
  | "department"
  | "daysWorked"
  | "workedHours"
  | "breakHours"
  | "paidHours"
  | "expectedHours"
  | "approvedOvertimeHours"
  | "unapprovedExtraHours"
  | "leaveDays"
  | "holidayDays"
  | "wfhDays"
  | "absentDays"
  | "lateDays";

interface ColumnDef {
  id: SummaryColumnId;
  label: string;
}

/** Every column a summary can have, with the heading used in the file. */
export const SUMMARY_COLUMNS: readonly ColumnDef[] = [
  { id: "payrollCode", label: "Payroll code" },
  { id: "name", label: "Name" },
  { id: "department", label: "Department" },
  { id: "daysWorked", label: "Days worked" },
  { id: "workedHours", label: "Hours worked" },
  { id: "breakHours", label: "Break hours" },
  { id: "paidHours", label: "Paid hours" },
  { id: "expectedHours", label: "Expected hours" },
  { id: "approvedOvertimeHours", label: "Approved overtime hours" },
  { id: "unapprovedExtraHours", label: "Unapproved extra hours" },
  { id: "leaveDays", label: "Leave days" },
  { id: "holidayDays", label: "Holiday days" },
  { id: "wfhDays", label: "Work from home days" },
  { id: "absentDays", label: "Absent days" },
  { id: "lateDays", label: "Late count" },
];

/** The default columns, in the order the design lists them. */
export const DEFAULT_SUMMARY_COLUMNS: readonly SummaryColumnId[] = SUMMARY_COLUMNS.map((c) => c.id);

export interface PayrollExportSettings {
  columns: SummaryColumnId[];
  hoursFormat: HoursFormat;
}

export const DEFAULT_PAYROLL_EXPORT_SETTINGS: PayrollExportSettings = {
  columns: [...DEFAULT_SUMMARY_COLUMNS],
  hoursFormat: "decimal",
};

export type ParseExportSettingsResult = { ok: true; value: PayrollExportSettings } | { ok: false; error: string };

/** Checks the admin's choice of columns and hours format; anything missing takes its default. */
export function parsePayrollExportSettings(raw: unknown): ParseExportSettingsResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "The export settings could not be read." };
  }
  const r = raw as Record<string, unknown>;
  if (r.hoursFormat !== undefined && r.hoursFormat !== "decimal" && r.hoursFormat !== "hhmm") {
    return { ok: false, error: "Choose decimal hours (7.50) or hours and minutes (7:30)." };
  }
  let columns = [...DEFAULT_SUMMARY_COLUMNS];
  if (r.columns !== undefined) {
    const known = new Set<string>(DEFAULT_SUMMARY_COLUMNS);
    const list = r.columns;
    if (!Array.isArray(list) || list.length === 0 || !list.every((c) => typeof c === "string" && known.has(c))) {
      return { ok: false, error: "Choose at least one column, from the list of columns offered." };
    }
    if (new Set(list).size !== list.length) {
      return { ok: false, error: "A column can only be chosen once." };
    }
    columns = list as SummaryColumnId[];
  }
  return { ok: true, value: { columns, hoursFormat: (r.hoursFormat as HoursFormat | undefined) ?? "decimal" } };
}

const wholeMinutes = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Minutes as "7.50" (decimal) or "7:30" (hours and minutes), worked out once from the total. */
export function formatPayrollHours(minutes: unknown, format: HoursFormat): string {
  const m = wholeMinutes(minutes);
  if (format === "hhmm") return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  return formatDecimalHours(m);
}

type Cell = string | number;

function summaryCell(line: PeriodLine, id: SummaryColumnId, format: HoursFormat): Cell {
  switch (id) {
    case "payrollCode":
      return line.payrollCode ?? "";
    case "name":
      return line.name;
    case "department":
      return line.department;
    case "daysWorked":
      return line.daysWorked;
    case "workedHours":
      return formatPayrollHours(line.workedMinutes, format);
    case "breakHours":
      return formatPayrollHours(line.breakMinutes, format);
    case "paidHours":
      return formatPayrollHours(line.paidMinutes, format);
    case "expectedHours":
      return formatPayrollHours(line.expectedMinutes, format);
    case "approvedOvertimeHours":
      return formatPayrollHours(line.approvedOvertimeMinutes, format);
    case "unapprovedExtraHours":
      return formatPayrollHours(line.unapprovedExtraMinutes, format);
    case "leaveDays":
      return line.leaveDays;
    case "holidayDays":
      return line.holidayDays;
    case "wfhDays":
      return line.wfhDays;
    case "absentDays":
      return line.absentDays;
    case "lateDays":
      return line.lateDays;
  }
}

/** The summary: a heading row, then one row per person, with the chosen columns in the chosen order. */
export function summaryTable(lines: readonly PeriodLine[], settings: PayrollExportSettings): Cell[][] {
  const labels = new Map(SUMMARY_COLUMNS.map((c) => [c.id, c.label]));
  return [
    settings.columns.map((id) => labels.get(id) ?? id),
    ...lines.map((line) => settings.columns.map((id) => summaryCell(line, id, settings.hoursFormat))),
  ];
}

export const DAILY_HEADINGS = [
  "Payroll code",
  "Name",
  "Department",
  "Date",
  "Status",
  "Hours worked",
  "Break hours",
  "Paid hours",
  "Expected hours",
  "Late",
  "No check-out",
] as const;

const STATUS_WORDS: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  leave: "On leave",
  holiday: "Holiday",
  wfh: "Work from home",
  off: "Day off",
  other: "Not on this team",
  expected: "Not yet due",
};

/** The daily detail: a heading row, then one row per person per day. Work from home shows no hours. */
export function dailyTable(lines: readonly PeriodLine[], hoursFormat: HoursFormat): Cell[][] {
  const out: Cell[][] = [[...DAILY_HEADINGS]];
  for (const line of lines) {
    for (const d of line.days) {
      out.push([
        line.payrollCode ?? "",
        line.name,
        line.department,
        d.dayKey,
        STATUS_WORDS[d.status] ?? d.status,
        formatPayrollHours(d.workedMinutes, hoursFormat),
        formatPayrollHours(d.breakMinutes, hoursFormat),
        formatPayrollHours(d.paidMinutes, hoursFormat),
        formatPayrollHours(d.expectedMinutes, hoursFormat),
        d.late ? "Yes" : "",
        d.noCheckOut ? "Yes" : "",
      ]);
    }
  }
  return out;
}

export interface ExportHeader {
  startDay: string;
  endDay: string;
  version: number;
  /** When the period was locked. Never the time of the download, so the same period gives the same file. */
  lockedAt: string;
  timezone: string;
}

/** The lines at the top of a file: what it is, the period, the version and the lock time. */
export function headerRows(kind: "summary" | "daily", h: ExportHeader): Cell[][] {
  return [
    [kind === "summary" ? "ChecIN pay period summary" : "ChecIN pay period daily detail"],
    ["Period", `${h.startDay} to ${h.endDay}`],
    ["Timezone", h.timezone],
    ["Version", h.version],
    ["Locked at", h.lockedAt],
    [],
  ];
}

export interface BuildOptions {
  /** Put the header lines above the table. On by default; off gives a bare table for tools that want one. */
  header?: boolean;
}

/** The summary file: header lines, then one row per person. */
export function payrollSummaryCsv(lines: readonly PeriodLine[], settings: PayrollExportSettings, header: ExportHeader, options: BuildOptions = {}): string {
  const top = options.header === false ? [] : headerRows("summary", header);
  return buildCsv([...top, ...summaryTable(lines, settings)]);
}

/** The daily detail file: header lines, then one row per person per day. */
export function payrollDailyCsv(lines: readonly PeriodLine[], settings: PayrollExportSettings, header: ExportHeader, options: BuildOptions = {}): string {
  const top = options.header === false ? [] : headerRows("daily", header);
  return buildCsv([...top, ...dailyTable(lines, settings.hoursFormat)]);
}

export function payrollFilename(kind: "summary" | "daily", startDay: string, endDay: string, version: number, ext: "csv" | "xlsx"): string {
  return `pay-period-${kind}_${startDay}_to_${endDay}_v${version}.${ext}`;
}
