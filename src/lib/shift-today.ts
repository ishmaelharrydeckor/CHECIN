/**
 * Pure Today builder for shifts (task 3.1, phase 4; see docs/SHIFTS-DESIGN.md).
 *
 * Evaluates the Today panel's numbers and lists according to each person's
 * assigned shift. When shifts are on, expected, absent, present and late follow
 * shift start times, and night shifts spanning from yesterday are recognized.
 *
 * Pure function: no Firebase, no system clock (now is passed in).
 */
import { dayKey } from "./attendance-day.ts";
import {
  addDays,
  formatClock,
  type RawEvent,
  type RosterMember,
  type TodayEventRow,
  type TodayLate,
  type TodayPerson,
  type TodaySummaryData,
} from "./attendance-today.ts";
import type { DailySummary } from "./daily-summary.ts";
import type { ReportLeave } from "./report-data.ts";
import {
  shiftDayStatus,
  shiftWindow,
  type ShiftDayStatus,
  type ShiftSnapshot,
} from "./shift-engine.ts";
import type { ShiftSettings } from "./shift-requests.ts";

export type ShiftTodayCounts = TodaySummaryData["counts"] & {
  notRostered?: number;
};

export type ShiftTodaySummaryData = Omit<TodaySummaryData, "counts"> & {
  counts: ShiftTodayCounts;
  shiftsOn?: true;
};

function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return letters || "EM";
}

function toEventRow(
  e: RawEvent,
  rosterById: Map<string, RosterMember>,
  timezone: string,
): TodayEventRow {
  const member = rosterById.get(e.employeeId);
  const name = e.employeeName || member?.displayName || e.employeeEmail || "Employee";
  return {
    id: e.id,
    employeeId: e.employeeId,
    name,
    email: e.employeeEmail || member?.email || "",
    initials: initialsOf(name),
    department: e.department || member?.department || "",
    location: e.locationName || "",
    type: e.type === "out" ? "out" : "in",
    late: e.late === true,
    earlyDeparture: e.earlyDeparture === true,
    time: formatClock(e.timestamp, timezone),
    timestamp: e.timestamp,
  };
}

function isApprovedLeaveCovering(leaves: ReportLeave[], employeeId: string, day: string): boolean {
  return leaves.some(
    (l) =>
      l &&
      l.status === "approved" &&
      l.employeeId === employeeId &&
      typeof l.startDate === "string" &&
      typeof l.endDate === "string" &&
      l.startDate <= day &&
      day <= l.endDate,
  );
}

export function buildTodayWithShifts(input: {
  summaries: DailySummary[];
  recentEvents: RawEvent[];
  roster: RosterMember[];
  assignments: { employeeId: string; dayKey: string; shift: ShiftSnapshot }[];
  leaves: ReportLeave[];
  holidays: string[];
  settings: ShiftSettings;
  timezone: string;
  now: number;
  /** Employee ids with a work-from-home day today. A scan or approved leave still wins. */
  wfhEmployeeIds?: readonly string[];
  eventLimit?: number;
  truncated?: boolean;
}): TodaySummaryData {
  const { timezone, now, roster, settings } = input;
  const eventLimit = input.eventLimit ?? 20;
  const today = dayKey(now, timezone) ?? new Date(now).toISOString().slice(0, 10);
  const yesterday = addDays(today, -1);
  const holidaysSet = new Set(input.holidays ?? []);

  const rosterById = new Map(roster.map((r) => [r.uid, r]));

  // Index summaries by employeeId and dayKey (only for rostered members)
  const summariesByPersonDay = new Map<string, Map<string, DailySummary>>();
  for (const s of input.summaries ?? []) {
    if (!s || typeof s.employeeId !== "string" || !rosterById.has(s.employeeId)) continue;
    if (typeof s.dayKey !== "string") continue;
    let personMap = summariesByPersonDay.get(s.employeeId);
    if (!personMap) {
      personMap = new Map();
      summariesByPersonDay.set(s.employeeId, personMap);
    }
    personMap.set(s.dayKey, s);
  }

  // Index assignments by employeeId and dayKey (only for rostered members)
  const assignmentsByPersonDay = new Map<string, Map<string, ShiftSnapshot>>();
  for (const a of input.assignments ?? []) {
    if (!a || typeof a.employeeId !== "string" || !rosterById.has(a.employeeId)) continue;
    if (typeof a.dayKey !== "string" || !a.shift) continue;
    let personMap = assignmentsByPersonDay.get(a.employeeId);
    if (!personMap) {
      personMap = new Map();
      assignmentsByPersonDay.set(a.employeeId, personMap);
    }
    personMap.set(a.dayKey, a.shift);
  }

  interface PersonEvaluation {
    member: RosterMember;
    status: ShiftDayStatus;
    relevantSummary: DailySummary | null;
  }

  const evaluations: PersonEvaluation[] = [];

  for (const member of roster) {
    const personSummaries = summariesByPersonDay.get(member.uid);
    const summaryYesterday = personSummaries?.get(yesterday) ?? null;

    const personAssignments = assignmentsByPersonDay.get(member.uid);
    const shiftYesterday = personAssignments?.get(yesterday) ?? null;
    const shiftToday = personAssignments?.get(today) ?? null;

    // 1. Which shift counts for the panel right now
    let relevantAssignment: { dayKey: string; shift: ShiftSnapshot } | null = shiftToday
      ? { dayKey: today, shift: shiftToday }
      : null;

    if (shiftYesterday) {
      const win = shiftWindow(
        { dayKey: yesterday, shift: shiftYesterday },
        timezone,
        settings.shiftWindowMinutes,
      );
      const windowNotEnded = now <= win.closesMs;
      const beforeEnd = win.endMs !== null && now < win.endMs;
      const stillCheckedIn = summaryYesterday?.state === "in";
      if (windowNotEnded && (beforeEnd || stillCheckedIn)) {
        relevantAssignment = { dayKey: yesterday, shift: shiftYesterday };
      }
    }

    // 2. Status
    const relevantShiftDay = relevantAssignment ? relevantAssignment.dayKey : today;
    const relevantSummary = personSummaries?.get(relevantShiftDay) ?? null;

    const hasScan = Boolean(relevantSummary && relevantSummary.firstIn);
    const onLeave = isApprovedLeaveCovering(input.leaves ?? [], member.uid, relevantShiftDay);
    const isHoliday = holidaysSet.has(relevantShiftDay);

    const status = shiftDayStatus({
      assignment: relevantAssignment,
      hasScan,
      onLeave,
      isHoliday,
      nowMs: now,
      timezone,
    });

    evaluations.push({
      member,
      status,
      relevantSummary,
    });
  }

  let presentCount = 0;
  let onSiteCount = 0;
  let onLeaveCount = 0;
  let absentCount = 0;
  let notRosteredCount = 0;
  let expectedStatusCount = 0;

  const lateList: TodayLate[] = [];
  const notArrivedList: TodayPerson[] = [];
  const wfhList: TodayPerson[] = [];
  const wfhDeclared = new Set(input.wfhEmployeeIds ?? []);
  const presentSummaries: DailySummary[] = [];

  for (const ev of evaluations) {
    const { member, status, relevantSummary } = ev;
    const name = member.displayName || member.email || "Employee";
    const dept = member.department || "";

    if (status === "present") {
      presentCount++;
      if (relevantSummary) {
        presentSummaries.push(relevantSummary);
        if (relevantSummary.state === "in") onSiteCount++;
        if (relevantSummary.firstIn && relevantSummary.late === true && relevantSummary.lateExcused !== true) {
          const arrivedAt = formatClock(relevantSummary.firstIn as string, timezone);
          lateList.push({
            employeeId: member.uid,
            name: member.displayName || relevantSummary.employeeName || member.email || "Employee",
            department: relevantSummary.department || member.department || "",
            arrivedAt,
          });
        }
      }
    } else if ((status === "expected" || status === "absent") && wfhDeclared.has(member.uid)) {
      // Working from home is attended, not absent, and still part of who was expected.
      expectedStatusCount++;
      wfhList.push({ employeeId: member.uid, name, department: dept });
    } else if (status === "expected") {
      expectedStatusCount++;
      notArrivedList.push({ employeeId: member.uid, name, department: dept });
    } else if (status === "absent") {
      absentCount++;
      notArrivedList.push({ employeeId: member.uid, name, department: dept });
    } else if (status === "on_leave") {
      onLeaveCount++;
    } else if (status === "not_rostered") {
      notRosteredCount++;
    }
  }

  lateList.sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
  notArrivedList.sort((a, b) => a.name.localeCompare(b.name));
  wfhList.sort((a, b) => a.name.localeCompare(b.name));

  const expectedCount = presentCount + expectedStatusCount + absentCount;

  // On-time rate from relevant shift-day summaries of people with status "present"
  const withFirstIn = presentSummaries.filter((s) => s.firstIn).length;
  const lateSummaries = presentSummaries.filter((s) => s.firstIn && s.late === true && s.lateExcused !== true);
  const lateExcusedCount = presentSummaries.filter((s) => s.firstIn && s.late === true && s.lateExcused === true).length;
  const excusedIds = new Set(presentSummaries.filter((s) => s.lateExcused === true).map((s) => s.employeeId));
  const onTimeRate = {
    percent: withFirstIn > 0 ? Math.round(((withFirstIn - lateSummaries.length) / withFirstIn) * 100) : null,
    onTime: withFirstIn - lateSummaries.length,
    total: withFirstIn,
  };

  // Average shift from relevant shift-day summaries of people with status "present"
  const worked = presentSummaries.map((s) => s.minutesWorked).filter((m) => m > 0);
  const avgShift = {
    completed: worked.length,
    inProgress: onSiteCount,
    avgMinutes: worked.length > 0 ? Math.round(worked.reduce((a, b) => a + b, 0) / worked.length) : null,
  };

  // Activity list: recent events on calendar today
  const todaysEvents = (input.recentEvents ?? [])
    .filter((e) => dayKey(e.timestamp, timezone) === today)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const events = todaysEvents
    .slice(0, eventLimit)
    .map((e) => toEventRow(e, rosterById, timezone))
    .map((row) => (row.late && excusedIds.has(row.employeeId) ? { ...row, late: false, lateExcused: true } : row));

  return {
    dayKey: today,
    timezone,
    generatedAt: new Date(now).toISOString(),
    counts: {
      expected: expectedCount,
      present: presentCount,
      onSite: onSiteCount,
      late: lateList.length,
      ...(lateExcusedCount > 0 ? { lateExcused: lateExcusedCount } : {}),
      onLeave: onLeaveCount,
      wfh: wfhList.length,
      absent: absentCount,
      notRostered: notRosteredCount,
    },
    shiftsOn: true,
    onTimeRate,
    avgShift,
    events,
    eventsTotal: presentSummaries.reduce((n, s) => n + (typeof s.eventCount === "number" ? s.eventCount : 0), 0),
    late: lateList,
    notArrived: notArrivedList,
    wfhPeople: wfhList,
    truncated: input.truncated === true,
  } as TodaySummaryData;
}
