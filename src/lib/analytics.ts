/**
 * Attendance analytics, worked out on the server from daily summaries (never in the browser).
 *
 * For every finished working day in the chosen period (today is left out, it is not over yet):
 *
 *   expected  the people who should have been there: on the team, not on approved leave, and either
 *             a Monday-to-Friday day, or (when shifts are on) assigned a shift that day. Holidays
 *             are not working days.
 *   attended  expected people who scanned, plus expected people who declared work from home.
 *   late      of those who scanned, whose first check-in was late.
 *   hours     the average of completed minutes for people who scanned. Work-from-home days carry no
 *             hours (docs/WFH-DESIGN.md), so they are never part of this figure.
 *
 * A day with nobody expected (a weekend, a holiday, a day nobody was rostered) is not a working day
 * and does not appear. Pure functions: no Firebase, no clock reads, relative `.ts` imports only.
 */
import { addDays, weekdayIndex } from "./attendance-today.ts";
import type { AnalyticsDepartment, AnalyticsSummary, AnalyticsTrendDay } from "./analytics-types.ts";

export type AnalyticsPeriodKey = "this-week" | "last-7" | "last-14" | "last-30";

export function isPeriodKey(v: unknown): v is AnalyticsPeriodKey {
  return v === "this-week" || v === "last-7" || v === "last-14" || v === "last-30";
}

/** The longest period, so one request reads a bounded amount. */
export const ANALYTICS_MAX_DAYS = 30;

/**
 * The days of a period. `days` are the finished days (up to yesterday); `to` is the last of them, or
 * today when the period has no finished day yet (the first day of a week).
 */
export function analyticsRange(period: AnalyticsPeriodKey, today: string): { from: string; to: string; days: string[] } {
  const yesterday = addDays(today, -1);
  let from: string;
  if (period === "this-week") from = addDays(today, -weekdayIndex(today));
  else from = addDays(today, period === "last-7" ? -7 : period === "last-14" ? -14 : -30);
  const days: string[] = [];
  for (let d = from; d <= yesterday; d = addDays(d, 1)) days.push(d);
  return { from, to: days.length > 0 ? yesterday : today, days };
}

export interface AnalyticsPerson {
  uid: string;
  department?: string;
}

export interface AnalyticsInput {
  period: { from: string; to: string; days: readonly string[] };
  roster: readonly AnalyticsPerson[];
  summaries: readonly {
    employeeId?: unknown;
    dayKey?: unknown;
    firstIn?: unknown;
    late?: unknown;
    lateExcused?: unknown;
    minutesWorked?: unknown;
  }[];
  leaves: readonly { employeeId?: unknown; status?: unknown; startDate?: unknown; endDate?: unknown }[];
  holidays: readonly string[];
  wfh: readonly { employeeId: string; dayKey: string }[];
  /** When present, expected people are the ones assigned a shift that day instead of everyone on weekdays. */
  assignments?: readonly { employeeId: string; dayKey: string }[];
  timezone: string;
  generatedAt: string;
  truncated?: boolean;
}

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

export function buildAnalytics(input: AnalyticsInput): AnalyticsSummary {
  const holiday = new Set(input.holidays);
  const rosterIds = new Set(input.roster.map((p) => p.uid));

  const scanned = new Map<string, { late: boolean; minutes: number }>(); // "uid|day"
  for (const s of input.summaries) {
    if (typeof s.employeeId !== "string" || typeof s.dayKey !== "string" || !rosterIds.has(s.employeeId)) continue;
    if (!s.firstIn) continue;
    scanned.set(`${s.employeeId}|${s.dayKey}`, {
      late: s.late === true && s.lateExcused !== true, // an excused late mark counts as on time
      minutes: typeof s.minutesWorked === "number" && s.minutesWorked > 0 ? s.minutesWorked : 0,
    });
  }
  const wfh = new Set(input.wfh.map((w) => `${w.employeeId}|${w.dayKey}`));
  const assigned = input.assignments ? new Set(input.assignments.map((a) => `${a.employeeId}|${a.dayKey}`)) : null;

  const leavesBy = new Map<string, { start: string; end: string }[]>();
  for (const l of input.leaves) {
    if (l.status !== "approved" || typeof l.employeeId !== "string") continue;
    if (typeof l.startDate !== "string" || typeof l.endDate !== "string") continue;
    const list = leavesBy.get(l.employeeId) ?? [];
    list.push({ start: l.startDate, end: l.endDate });
    leavesBy.set(l.employeeId, list);
  }
  const onLeave = (uid: string, day: string) => (leavesBy.get(uid) ?? []).some((l) => l.start <= day && day <= l.end);

  const dept = new Map<string, { people: Set<string>; expected: number; attended: number; arrivals: number; onTime: number }>();
  const deptOf = (p: AnalyticsPerson) => (p.department ?? "").trim();
  for (const p of input.roster) {
    const key = deptOf(p);
    if (!dept.has(key)) dept.set(key, { people: new Set(), expected: 0, attended: 0, arrivals: 0, onTime: 0 });
    dept.get(key)!.people.add(p.uid);
  }

  let expectedTotal = 0;
  let attendedTotal = 0;
  let arrivalsTotal = 0;
  let onTimeTotal = 0;
  let minutesTotal = 0;
  let minutesDays = 0;
  const trend: AnalyticsTrendDay[] = [];

  for (const day of input.period.days) {
    if (holiday.has(day)) continue;
    let expected = 0;
    let attended = 0;
    let late = 0;
    let dayMinutes = 0;
    let dayMinutesCount = 0;

    for (const p of input.roster) {
      const inScope = assigned ? assigned.has(`${p.uid}|${day}`) : weekdayIndex(day) < 5;
      if (!inScope || onLeave(p.uid, day)) continue;
      expected++;
      const d = dept.get(deptOf(p))!;
      d.expected++;
      const scan = scanned.get(`${p.uid}|${day}`);
      if (scan) {
        attended++;
        d.attended++;
        d.arrivals++;
        arrivalsTotal++;
        if (scan.late) late++;
        else {
          d.onTime++;
          onTimeTotal++;
        }
        if (scan.minutes > 0) {
          dayMinutes += scan.minutes;
          dayMinutesCount++;
        }
      } else if (wfh.has(`${p.uid}|${day}`)) {
        attended++;
        d.attended++;
      }
    }

    if (expected === 0) continue; // not a working day
    expectedTotal += expected;
    attendedTotal += attended;
    minutesTotal += dayMinutes;
    minutesDays += dayMinutesCount;
    trend.push({
      dayKey: day,
      expected,
      attended,
      late,
      avgMinutesWorked: dayMinutesCount > 0 ? Math.round(dayMinutes / dayMinutesCount) : null,
    });
  }

  const byDepartment: AnalyticsDepartment[] = [...dept.entries()]
    .map(([department, d]) => ({
      department,
      people: d.people.size,
      attendancePercent: pct(d.attended, d.expected),
      punctualityPercent: pct(d.onTime, d.arrivals),
    }))
    .sort((a, b) => b.people - a.people || a.department.localeCompare(b.department));

  return {
    from: input.period.from,
    to: input.period.to,
    timezone: input.timezone,
    generatedAt: input.generatedAt,
    teamSize: input.roster.length,
    attendanceRate: { percent: pct(attendedTotal, expectedTotal), attendedDays: attendedTotal, expectedDays: expectedTotal },
    punctuality: { percent: pct(onTimeTotal, arrivalsTotal), onTimeDays: onTimeTotal, arrivalDays: arrivalsTotal },
    avgHoursPerDay: {
      hours: minutesDays > 0 ? Math.round((minutesTotal / minutesDays / 60) * 10) / 10 : null,
      daysCounted: minutesDays,
    },
    trend,
    byDepartment,
    truncated: input.truncated === true,
  };
}
