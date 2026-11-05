export interface AnalyticsTrendDay {
  dayKey: string; // "2026-10-05" (working days only, oldest first)
  expected: number; // people expected that day
  attended: number; // present plus work from home
  late: number; // of those who scanned, how many were late
  avgMinutesWorked: number | null; // null when nobody has a completed day yet
}

export interface AnalyticsDepartment {
  department: string; // may be empty: show "No department", not "General"
  people: number;
  attendancePercent: number | null;
  punctualityPercent: number | null;
}

export interface AnalyticsSummary {
  from: string; // "2026-10-01"
  to: string; // "2026-10-14"
  timezone: string; // "Africa/Accra"
  generatedAt: string; // ISO
  teamSize: number;
  attendanceRate: { percent: number | null; attendedDays: number; expectedDays: number };
  punctuality: { percent: number | null; onTimeDays: number; arrivalDays: number };
  avgHoursPerDay: { hours: number | null; daysCounted: number }; // excludes work-from-home days
  trend: AnalyticsTrendDay[];
  byDepartment: AnalyticsDepartment[];
  truncated: boolean; // true if the server stopped at its limit
}
