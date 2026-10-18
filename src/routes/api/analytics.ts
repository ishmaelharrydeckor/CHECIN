import { createFileRoute } from "@tanstack/react-router";
import {
  SHIFT_ASSIGNMENT_CAP_RANGE,
  WFH_RANGE_CAP,
  loadOrgContext,
  loadScopedSummaries,
  loadShiftAssignments,
  loadWfhRange,
} from "@/lib/attendance-data.server";
import { dashboardCacheKey } from "@/lib/dashboard-scope";
import { authorizeReportCaller, loadHolidayDays, loadScopedLeave } from "@/lib/report-data.server";
import { createCachedLoader } from "@/lib/ttl-cache.server";
import { dayKey } from "@/lib/attendance-day";
import { analyticsRange, buildAnalytics, isPeriodKey } from "@/lib/analytics";
import type { AnalyticsSummary } from "@/lib/analytics-types";

// Analytics read up to a month of summaries, so each answer is kept for 5 minutes and shared by
// everyone entitled to the same data. The Refresh button asks for ?fresh=1 (at most once every 20 s).
const loadAnalytics = createCachedLoader<AnalyticsSummary>(5 * 60_000, 200, 20_000);

/** The most summaries one analytics read returns; a bigger answer says it is partial. */
const ANALYTICS_SUMMARY_CAP = 12000;

/**
 * GET /api/analytics?period=this-week|last-7|last-14|last-30
 *
 * Attendance rate, punctuality, average hours, a day-by-day trend and a department breakdown, from
 * daily summaries (never raw scans). An org admin gets the whole organization, a manager their own
 * team, decided only by the verified token. Today is left out: it is not finished.
 */
export const Route = createFileRoute("/api/analytics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authorizeReportCaller(request);
          if ("response" in auth) return auth.response;
          const { scope } = auth;

          const url = new URL(request.url);
          const period = url.searchParams.get("period") ?? "last-14";
          if (!isPeriodKey(period)) {
            return Response.json({ error: "Choose a period from the list." }, { status: 400 });
          }
          const fresh = url.searchParams.get("fresh") === "1";

          const summary = await loadAnalytics(
            `${dashboardCacheKey(scope)}|${period}`,
            async () => {
              const { timezone, roster, shifts } = await loadOrgContext(scope);
              const now = Date.now();
              const today = dayKey(now, timezone) ?? new Date(now).toISOString().slice(0, 10);
              const range = analyticsRange(period, today);

              const [summaries, leave, holidays, wfh] = await Promise.all([
                loadScopedSummaries(scope, range.from, range.to, ANALYTICS_SUMMARY_CAP),
                loadScopedLeave(scope, "approved"),
                loadHolidayDays(scope.orgId),
                loadWfhRange(scope, range.from, range.to, WFH_RANGE_CAP).catch(() => ({
                  days: [] as { employeeId: string; dayKey: string }[],
                  truncated: true,
                })),
              ]);

              // With shifts on, "expected" follows who was rostered (the same rule as the register).
              let assignments: { employeeId: string; dayKey: string }[] | undefined;
              let assignmentsTruncated = false;
              if (shifts.shiftsEnabled && process.env.SHIFTS_DISABLED !== "1") {
                const found = await loadShiftAssignments(scope, range.from, range.to, SHIFT_ASSIGNMENT_CAP_RANGE).catch(
                  () => null,
                );
                if (found && found.assignments.length > 0) {
                  assignments = found.assignments;
                  assignmentsTruncated = found.truncated;
                }
              }

              return buildAnalytics({
                period: range,
                roster,
                summaries: summaries.summaries,
                leaves: leave.leaves,
                holidays,
                wfh: wfh.days,
                assignments,
                timezone,
                generatedAt: new Date(now).toISOString(),
                truncated: summaries.truncated || leave.truncated || wfh.truncated || assignmentsTruncated,
              });
            },
            { fresh },
          );
          return Response.json({ ok: true, summary }, { headers: { "Cache-Control": "private, no-store" } });
        } catch (err) {
          console.error("GET /api/analytics error:", err);
          return Response.json({ error: "Could not load the analytics." }, { status: 500 });
        }
      },
    },
  },
});
