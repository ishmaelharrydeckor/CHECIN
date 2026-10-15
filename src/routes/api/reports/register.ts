import { createFileRoute } from "@tanstack/react-router";
import { WEEK_SUMMARY_CAP, loadOrgContext, loadScopedSummaries } from "@/lib/attendance-data.server";
import { authorizeReportCaller, loadHolidayDays, loadScopedLeave } from "@/lib/report-data.server";
import { buildAttendanceRegister, parseReportRange } from "@/lib/report-data";

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

          const [{ timezone, roster }, summaries, leave, holidays] = await Promise.all([
            loadOrgContext(scope),
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
            readTruncated: summaries.truncated || leave.truncated,
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
