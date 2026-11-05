/**
 * The reports hub (Phase 4, task 4.7): what reports there are, who sees what in each, and the ready-made date
 * ranges for "Generate". Pure: no browser, no Firebase, no clock (today is passed in), so it can be tested.
 * The reports themselves are built on the server (/api/reports/register and /api/reports/leave); who may see
 * what is decided there from the verified token, never here.
 */
import { addDays } from "./attendance-today.ts";

export type HubReportId = "timesheets" | "register" | "leave";

export interface HubReport {
  id: HubReportId;
  title: string;
  description: string;
  /** The page that previews it (with its own date range and downloads). */
  openTo: "/reports/timesheets" | "/attendance-reports";
  /** Which tab of the register and ledger page to open. */
  tab?: "register" | "leave";
  /** The report can be generated here, as a file, for a ready-made date range. */
  generate?: "register" | "leave";
}

export const HUB_REPORTS: readonly HubReport[] = [
  {
    id: "timesheets",
    title: "Timesheets",
    description: "Hours worked by each person, worked out from entrance scans. Download as CSV, Excel or PDF.",
    openTo: "/reports/timesheets",
  },
  {
    id: "register",
    title: "Attendance register",
    description: "One row per person and one column per day: present, late, absent, on leave, working from home, holiday.",
    openTo: "/attendance-reports",
    tab: "register",
    generate: "register",
  },
  {
    id: "leave",
    title: "Leave ledger",
    description: "Every leave request in the period with its type, dates, days and decision.",
    openTo: "/attendance-reports",
    tab: "leave",
    generate: "leave",
  },
];

/** Other places a manager reviews people, shown under the reports so they are easy to find. */
export interface HubReview {
  title: string;
  description: string;
  to: "/late-arrivals" | "/wfh-review";
}

export const HUB_REVIEWS: readonly HubReview[] = [
  { title: "Late arrivals", description: "Review late check-ins and excuse the ones that were not the person's fault.", to: "/late-arrivals" },
  { title: "Work diary", description: "Approve or flag work-from-home days. Approved diary hours appear in the register.", to: "/wfh-review" },
];

/** Who sees what in a report: the server decides, this only says it in words. */
export function scopeText(isOrgAdmin: boolean): string {
  return isOrgAdmin ? "Covers the whole organization." : "Covers your team.";
}

// ---------------------------------------------------------------- ready-made date ranges

export type RangePreset = "last7" | "last14" | "thisMonth" | "lastMonth";

export const PRESET_LABEL: Record<RangePreset, string> = {
  last7: "Last 7 days",
  last14: "Last 14 days",
  thisMonth: "This month so far",
  lastMonth: "Last month",
};

export const PRESETS: readonly RangePreset[] = ["last7", "last14", "thisMonth", "lastMonth"];

/**
 * The first and last day of a ready-made range, as YYYY-MM-DD, counted back from `today` (also YYYY-MM-DD).
 * Every range is at most 31 days, which is the most a report allows. `today` is the device's date: a report
 * is always built on the server, in the organization's timezone, for exactly the days asked for.
 */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  switch (preset) {
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last14":
      return { from: addDays(today, -13), to: today };
    case "thisMonth":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "lastMonth": {
      const firstThis = `${today.slice(0, 8)}01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
    }
  }
}

/** How many days a range covers, counting both ends. */
export function rangeDays(range: { from: string; to: string }): number {
  const a = Date.parse(`${range.from}T00:00:00Z`);
  const b = Date.parse(`${range.to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}
