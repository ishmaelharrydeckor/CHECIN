import type { AnalyticsDepartment, AnalyticsSummary, AnalyticsTrendDay } from "@/lib/analytics-types";

/**
 * Sample data for the analytics preview (/analytics-preview), in the real
 * AnalyticsSummary shape. The figures are written out by hand so they agree
 * with each other. The screen itself never calculates anything.
 */

export type AnalyticsSampleKey = "normal" | "empty" | "almostNone" | "smallTeam" | "largeTeam";

const TIMEZONE = "Africa/Accra";

function day(
  dayKey: string,
  expected: number,
  attended: number,
  late: number,
  avgMinutesWorked: number | null,
): AnalyticsTrendDay {
  return { dayKey, expected, attended, late, avgMinutesWorked };
}

// ---- Normal: a team of 12, 14 calendar days (10 working days) ----

const normalTrend: AnalyticsTrendDay[] = [
  day("2026-09-28", 12, 11, 2, 468),
  day("2026-09-29", 12, 10, 3, 455),
  day("2026-09-30", 12, 11, 1, 472),
  day("2026-10-01", 12, 12, 2, 480),
  day("2026-10-02", 12, 9, 1, 440),
  day("2026-10-05", 12, 11, 2, 465),
  day("2026-10-06", 12, 11, 4, 450),
  day("2026-10-07", 12, 10, 1, 470),
  day("2026-10-08", 12, 12, 0, 482),
  day("2026-10-09", 12, 9, 2, 438),
];

const normalDepartments: AnalyticsDepartment[] = [
  { department: "Operations", people: 4, attendancePercent: 92, punctualityPercent: 88 },
  { department: "Sales", people: 3, attendancePercent: 85, punctualityPercent: 80 },
  { department: "Finance", people: 3, attendancePercent: 90, punctualityPercent: 86 },
  { department: "Support", people: 2, attendancePercent: 83, punctualityPercent: 75 },
];

const normal: AnalyticsSummary = {
  from: "2026-09-28",
  to: "2026-10-11",
  timezone: TIMEZONE,
  generatedAt: "2026-10-12T07:30:00.000Z",
  teamSize: 12,
  attendanceRate: { percent: 88, attendedDays: 106, expectedDays: 120 },
  punctuality: { percent: 83, onTimeDays: 88, arrivalDays: 106 },
  avgHoursPerDay: { hours: 7.7, daysCounted: 106 },
  trend: normalTrend,
  byDepartment: normalDepartments,
  truncated: false,
};

// ---- Empty: a team of 3, nobody has checked in during the period ----

const empty: AnalyticsSummary = {
  from: "2026-10-05",
  to: "2026-10-11",
  timezone: TIMEZONE,
  generatedAt: "2026-10-12T07:30:00.000Z",
  teamSize: 3,
  attendanceRate: { percent: null, attendedDays: 0, expectedDays: 15 },
  punctuality: { percent: null, onTimeDays: 0, arrivalDays: 0 },
  avgHoursPerDay: { hours: null, daysCounted: 0 },
  // Working days exist but have no check-ins: the screen must not draw them as zero.
  trend: [
    day("2026-10-05", 3, 0, 0, null),
    day("2026-10-06", 3, 0, 0, null),
    day("2026-10-07", 3, 0, 0, null),
    day("2026-10-08", 3, 0, 0, null),
    day("2026-10-09", 3, 0, 0, null),
  ],
  byDepartment: [],
  truncated: false,
};

// ---- Almost no data: only 2 days so far, so a sentence instead of a chart ----

const almostNone: AnalyticsSummary = {
  from: "2026-10-05",
  to: "2026-10-11",
  timezone: TIMEZONE,
  generatedAt: "2026-10-12T07:30:00.000Z",
  teamSize: 8,
  attendanceRate: { percent: 81, attendedDays: 13, expectedDays: 16 },
  punctuality: { percent: 77, onTimeDays: 10, arrivalDays: 13 },
  avgHoursPerDay: { hours: 7.7, daysCounted: 13 },
  trend: [day("2026-10-05", 8, 7, 1, 470), day("2026-10-06", 8, 6, 2, 455)],
  byDepartment: [
    { department: "Operations", people: 5, attendancePercent: 80, punctualityPercent: 75 },
    { department: "Support", people: 3, attendancePercent: 83, punctualityPercent: 80 },
  ],
  truncated: false,
};

// ---- Small team: 3 people, one of them with no department ----

const smallTeam: AnalyticsSummary = {
  from: "2026-09-28",
  to: "2026-10-11",
  timezone: TIMEZONE,
  generatedAt: "2026-10-12T07:30:00.000Z",
  teamSize: 3,
  attendanceRate: { percent: 90, attendedDays: 27, expectedDays: 30 },
  punctuality: { percent: 89, onTimeDays: 24, arrivalDays: 27 },
  avgHoursPerDay: { hours: 7.7, daysCounted: 27 },
  trend: [
    day("2026-09-28", 3, 3, 0, 470),
    day("2026-09-29", 3, 3, 1, 460),
    day("2026-09-30", 3, 2, 0, 455),
    day("2026-10-01", 3, 3, 1, 475),
    day("2026-10-02", 3, 3, 0, 480),
    day("2026-10-05", 3, 2, 0, 450),
    day("2026-10-06", 3, 3, 1, 468),
    day("2026-10-07", 3, 3, 0, 472),
    day("2026-10-08", 3, 3, 0, 478),
    day("2026-10-09", 3, 2, 0, 430),
  ],
  byDepartment: [
    { department: "Operations", people: 2, attendancePercent: 92, punctualityPercent: 90 },
    { department: "", people: 1, attendancePercent: 88, punctualityPercent: 87 },
  ],
  truncated: false,
};

// ---- Large team: 150 people, 8 departments, 20 working days, long names, partial results ----

const largeAttended = [141, 138, 144, 139, 128, 142, 140, 145, 137, 131, 143, 141, 139, 146, 133, 140, 144, 142, 138, 130];
const largeLate = [18, 22, 15, 20, 25, 17, 19, 14, 21, 26, 16, 18, 23, 12, 24, 19, 15, 17, 21, 27];
const largeAvg = [472, 468, 475, 470, 455, 478, 471, 480, 466, 452, 476, 473, 469, 482, 458, 471, 477, 474, 467, 449];
const largeDayKeys = [
  "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18",
  "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25",
  "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
  "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09",
];

const largeTrend: AnalyticsTrendDay[] = largeDayKeys.map((key, i) =>
  day(key, 150, largeAttended[i] as number, largeLate[i] as number, largeAvg[i] as number),
);

const largeTeam: AnalyticsSummary = {
  from: "2026-09-14",
  to: "2026-10-11",
  timezone: TIMEZONE,
  generatedAt: "2026-10-12T07:30:00.000Z",
  teamSize: 150,
  attendanceRate: { percent: 93, attendedDays: 2781, expectedDays: 3000 },
  punctuality: { percent: 86, onTimeDays: 2392, arrivalDays: 2781 },
  avgHoursPerDay: { hours: 7.8, daysCounted: 2781 },
  trend: largeTrend,
  byDepartment: [
    { department: "Operations", people: 36, attendancePercent: 94, punctualityPercent: 88 },
    { department: "Sales", people: 28, attendancePercent: 91, punctualityPercent: 84 },
    { department: "Support", people: 24, attendancePercent: 92, punctualityPercent: 85 },
    { department: "Logistics", people: 20, attendancePercent: 89, punctualityPercent: 79 },
    { department: "Finance", people: 18, attendancePercent: 96, punctualityPercent: 92 },
    { department: "Corporate Communications and Public Affairs", people: 10, attendancePercent: 90, punctualityPercent: 83 },
    { department: "Human Resources", people: 8, attendancePercent: 97, punctualityPercent: 94 },
    // No department set, and no figures yet: shows "No department" and dashes
    { department: "", people: 6, attendancePercent: null, punctualityPercent: null },
  ],
  truncated: true,
};

export const analyticsSamples: Record<AnalyticsSampleKey, AnalyticsSummary> = {
  normal,
  empty,
  almostNone,
  smallTeam,
  largeTeam,
};
