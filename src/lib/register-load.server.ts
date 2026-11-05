import {
  DIARY_RANGE_CAP,
  SHIFT_ASSIGNMENT_CAP_RANGE,
  WEEK_SUMMARY_CAP,
  WFH_RANGE_CAP,
  loadDiaryDays,
  loadScopedSummaries,
  loadShiftAssignments,
  loadWfhRange,
  type OrgContext,
} from "@/lib/attendance-data.server";
import { loadHolidayDays, loadScopedLeave } from "@/lib/report-data.server";
import { buildAttendanceRegister } from "@/lib/report-data";
import type { AttendanceRegister } from "@/lib/report-types";
import type { DashboardScope } from "@/lib/dashboard-scope";
import type { DailySummary } from "@/lib/daily-summary";
import type { ShiftSnapshot } from "@/lib/shift-engine";
import { correlationId, logEvent } from "@/lib/log.server";

/**
 * Reads what the attendance register is built from and builds it, exactly as GET /api/reports/register does,
 * and also hands back the day summaries and the rota it read, so the timesheet can add what it needs on top
 * without a second read. Same reads, same limits, same arguments to the same builder: the timesheet and the
 * register cannot disagree about a day (docs/TIMESHEET-DESIGN.md, section 3).
 */
export async function loadRegisterForScope(args: {
  scope: DashboardScope;
  range: { from: string; to: string; days: string[] };
  context: OrgContext;
  request: Request;
}): Promise<{
  register: AttendanceRegister;
  summaries: DailySummary[];
  assignments: { employeeId: string; dayKey: string; shift: ShiftSnapshot }[];
}> {
  const { scope, range, context, request } = args;
  const { timezone, roster, shifts } = context;

  // If work-from-home days cannot be read the register still works, and says it may be incomplete.
  const wfhRead = await loadWfhRange(scope, range.from, range.to, WFH_RANGE_CAP).catch(() => ({
    days: [] as { employeeId: string; dayKey: string }[],
    truncated: true,
  }));

  // The work-diary columns, only when the organization has the diary on.
  const diaryRead = context.diaryEnabled
    ? await loadDiaryDays(scope, range.from, range.to, DIARY_RANGE_CAP).catch(() => ({
        days: [] as { employeeId: string; dayKey: string; status: string; verifiedMinutes: number }[],
        truncated: true,
      }))
    : { days: [], truncated: false };

  const common = {
    days: range.days,
    people: roster,
    timezone,
    from: range.from,
    to: range.to,
    wfh: wfhRead.days,
    breaks: shifts.shiftsEnabled && shifts.breaksEnabled,
    diary: diaryRead.days,
    diaryTracked: context.diaryEnabled,
  };

  if (shifts.shiftsEnabled && process.env.SHIFTS_DISABLED !== "1") {
    try {
      const [summaries, leave, holidays, shiftResult] = await Promise.all([
        loadScopedSummaries(scope, range.from, range.to, WEEK_SUMMARY_CAP),
        loadScopedLeave(scope, "approved"),
        loadHolidayDays(scope.orgId),
        loadShiftAssignments(scope, range.from, range.to, SHIFT_ASSIGNMENT_CAP_RANGE),
      ]);
      const register = buildAttendanceRegister({
        ...common,
        summaries: summaries.summaries,
        leaves: leave.leaves,
        holidays,
        generatedAt: new Date().toISOString(),
        readTruncated:
          summaries.truncated || leave.truncated || shiftResult.truncated || wfhRead.truncated || diaryRead.truncated,
        shifts: shiftResult.assignments.length > 0 ? { assignments: shiftResult.assignments, nowMs: Date.now() } : undefined,
      });
      return { register, summaries: summaries.summaries, assignments: shiftResult.assignments };
    } catch {
      logEvent({
        action: "attendance.shift_fallback",
        outcome: "error",
        correlationId: correlationId(request),
        uid: scope.uid,
        orgId: scope.orgId,
        fields: { reason: "read_error" },
      });
    }
  }

  const [summaries, leave, holidays] = await Promise.all([
    loadScopedSummaries(scope, range.from, range.to, WEEK_SUMMARY_CAP),
    loadScopedLeave(scope, "approved"),
    loadHolidayDays(scope.orgId),
  ]);
  const register = buildAttendanceRegister({
    ...common,
    summaries: summaries.summaries,
    leaves: leave.leaves,
    holidays,
    generatedAt: new Date().toISOString(),
    readTruncated: summaries.truncated || leave.truncated || wfhRead.truncated || diaryRead.truncated,
  });
  return { register, summaries: summaries.summaries, assignments: [] };
}
