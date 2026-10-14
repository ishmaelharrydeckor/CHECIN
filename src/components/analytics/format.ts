import type { AnalyticsTrendDay } from "@/lib/analytics-types";

/** "88%", or a dash when the server has no figure yet. Never "0%" for null. */
export function formatPercent(percent: number | null): string {
  return percent === null ? "—" : `${percent}%`;
}

/** "Mon 28" for a "YYYY-MM-DD" day key. Formats only; no clock or timezone maths. */
export function formatDayShort(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "28 Sep 2026" for a "YYYY-MM-DD" day key. */
export function formatDateLong(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A working day that has real check-in data. Days without any are left out of the chart. */
export function hasData(day: AnalyticsTrendDay): boolean {
  return day.attended > 0 || day.late > 0 || day.avgMinutesWorked !== null;
}
