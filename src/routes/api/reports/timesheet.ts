import { createFileRoute } from "@tanstack/react-router";
import { loadOrgContext } from "@/lib/attendance-data.server";
import { authorizeReportCaller } from "@/lib/report-data.server";
import { parseReportRange, registerRangeError } from "@/lib/report-data";
import { loadRegisterForScope } from "@/lib/register-load.server";
import { loadStandardWorkday } from "@/lib/standard-workday.server";
import { buildTimesheetReport } from "@/lib/timesheet-build";
import { correlationId, logEvent } from "@/lib/log.server";

/**
 * GET /api/reports/timesheet?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The timesheet: one row per person for the range, built on the same data and the same builder as the attendance
 * register, with expected time and the difference added (docs/TIMESHEET-DESIGN.md). An org admin gets the whole
 * organization, a manager their own team, decided by the verified token only; an employee is refused. At most 31
 * days, and fewer for a very large team. Reads daily summaries, the team's approved leave, holidays and the rota,
 * never raw scans. Nothing identity-related is read from the request.
 */
export const Route = createFileRoute("/api/reports/timesheet")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cid = correlationId(request);
        try {
          const auth = await authorizeReportCaller(request);
          if ("response" in auth) return auth.response;
          const { scope } = auth;

          const url = new URL(request.url);
          const range = parseReportRange(url.searchParams.get("from"), url.searchParams.get("to"));
          if (!range.ok) return Response.json({ error: range.error }, { status: 400 });

          const context = await loadOrgContext(scope);
          // A big team cannot be read for a long range in one answer: say so instead of showing people as absent.
          const tooLong = registerRangeError(context.roster.length, range.days.length);
          if (tooLong) return Response.json({ error: tooLong }, { status: 400 });

          const { register, summaries, assignments } = await loadRegisterForScope({ scope, range, context, request });
          // Gives people with no shift an expected time, if the org admin set a standard workday (one read of the org).
          const standardWorkday = await loadStandardWorkday(scope.orgId);
          const report = buildTimesheetReport({
            register,
            summaries,
            assignments: assignments.map((a) => ({
              employeeId: a.employeeId,
              dayKey: a.dayKey,
              shift: { start: a.shift.start, end: a.shift.end, unpaidBreakMinutes: a.shift.unpaidBreakMinutes },
            })),
            nowMs: Date.now(),
            standardWorkday,
          });

          logEvent({
            action: "reports.timesheet",
            outcome: "ok",
            correlationId: cid,
            uid: scope.uid,
            orgId: scope.orgId,
            fields: { people: report.rows.length, days: range.days.length, truncated: report.truncated },
          });
          return Response.json({ ok: true, report }, { headers: { "Cache-Control": "private, no-store" } });
        } catch (err) {
          console.error("GET /api/reports/timesheet error:", err);
          return Response.json({ error: "Could not build the timesheet" }, { status: 500 });
        }
      },
    },
  },
});
