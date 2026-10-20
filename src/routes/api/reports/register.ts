import { createFileRoute } from "@tanstack/react-router";
import {
  DIARY_RANGE_CAP,
  SHIFT_ASSIGNMENT_CAP_RANGE,
  WEEK_SUMMARY_CAP,
  WFH_RANGE_CAP,
  loadOrgContext,
  loadDiaryDays,
  loadScopedSummaries,
  loadShiftAssignments,
  loadWfhRange,
} from "@/lib/attendance-data.server";
import { authorizeReportCaller, loadHolidayDays, loadScopedLeave } from "@/lib/report-data.server";
import { buildAttendanceRegister, parseReportRange } from "@/lib/report-data";
import { correlationId, logEvent } from "@/lib/log.server";

/**
 * GET /api/reports/register?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The attendance register: one row per person, one column per day, in the organization's
 * timezone. An org admin gets the whole organization, a manager their own team (decided by the
 * verified token only). At most 31 days. Reads one daily summary per person per day, the team's
 * approved leave and the organization's holidays, never raw scans.
 */
export const Route = createFileRoute("/api/reports/register")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authorizeReportCaller(request);
          if ("response" in auth) return auth.response;
          const { scope } = auth;

          const url = new URL(request.url);
          const range = parseReportRange(url.searchParams.get("from"), url.searchParams.get("to"));
          if (!range.ok) return Response.json({ error: range.error }, { status: 400 });

          const context = await loadOrgContext(scope);
          const { timezone, roster, shifts } = context;
          // If work-from-home days cannot be read the register still works, and says it may be incomplete.
          const wfhRead = await loadWfhRange(scope, range.from, range.to, WFH_RANGE_CAP).catch(() => ({
            days: [] as { employeeId: string; dayKey: string }[],
            truncated: true,
          }));

          // The work-diary columns, only when the organization has the diary on. If they cannot be read the
          // register still works and says it may be incomplete.
          const diaryRead = context.diaryEnabled
            ? await loadDiaryDays(scope, range.from, range.to, DIARY_RANGE_CAP).catch(() => ({
                days: [] as { employeeId: string; dayKey: string; status: string; verifiedMinutes: number }[],
                truncated: true,
              }))
            : { days: [], truncated: false };

          if (shifts.shiftsEnabled && process.env.SHIFTS_DISABLED !== "1") {
            try {
              const [summaries, leave, holidays, shiftResult] = await Promise.all([
                loadScopedSummaries(scope, range.from, range.to, WEEK_SUMMARY_CAP),
                loadScopedLeave(scope, "approved"),
                loadHolidayDays(scope.orgId),
                loadShiftAssignments(scope, range.from, range.to, SHIFT_ASSIGNMENT_CAP_RANGE),
              ]);

              const shiftData =
                shiftResult.assignments.length > 0
                  ? { assignments: shiftResult.assignments, nowMs: Date.now() }
                  : undefined;

              const register = buildAttendanceRegister({
                days: range.days,
                people: roster,
                summaries: summaries.summaries,
                leaves: leave.leaves,
                holidays,
                timezone,
                generatedAt: new Date().toISOString(),
                from: range.from,
                to: range.to,
                readTruncated: summaries.truncated || leave.truncated || shiftResult.truncated || wfhRead.truncated || diaryRead.truncated,
                shifts: shiftData,
                wfh: wfhRead.days,
                breaks: shifts.shiftsEnabled && shifts.breaksEnabled,
                diary: diaryRead.days,
                diaryTracked: context.diaryEnabled,
              });
              return Response.json(
                { ok: true, report: register },
                { headers: { "Cache-Control": "private, no-store" } },
              );
            } catch (shiftErr) {
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
            days: range.days,
            people: roster,
            summaries: summaries.summaries,
            leaves: leave.leaves,
            holidays,
            timezone,
            generatedAt: new Date().toISOString(),
            from: range.from,
            to: range.to,
            readTruncated: summaries.truncated || leave.truncated || wfhRead.truncated || diaryRead.truncated,
            wfh: wfhRead.days,
            breaks: shifts.shiftsEnabled && shifts.breaksEnabled,
            diary: diaryRead.days,
            diaryTracked: context.diaryEnabled,
          });
          return Response.json(
            { ok: true, report: register },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (err: any) {
          console.error("GET /api/reports/register error:", err);
          return Response.json({ error: "Could not build the attendance register" }, { status: 500 });
        }
      },
    },
  },
});
