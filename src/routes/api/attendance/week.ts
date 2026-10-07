import { createFileRoute } from "@tanstack/react-router";
import { verifyCallerToken } from "@/integrations/firebase/admin.server";
import {
  WEEK_SUMMARY_CAP,
  loadOrgContext,
  loadScopedSummaries,
} from "@/lib/attendance-data.server";
import { resolveDashboardScope } from "@/lib/dashboard-scope";
import { addDays, buildWeekTrendFromSummaries, weekdayIndex } from "@/lib/attendance-today";
import { dayKey } from "@/lib/attendance-day";

/**
 * GET /api/attendance/week
 *
 * Monday-to-Friday attendance for the current week in the ORGANIZATION's
 * timezone: distinct people checked in each day, and how many of them were late
 * on their first check-in of the day. Days that have not happened yet are
 * flagged `future` so the chart does not draw them as zero.
 *
 * Fetched once per page load (not polled). Reads one summary per person per
 * day (about people x 5 documents), not every scan of the week.
 * Same authorization as /api/attendance/today (verified claims only).
 */
export const Route = createFileRoute("/api/attendance/week")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const scope = resolveDashboardScope(caller);
          if (!scope) {
            return Response.json(
              { error: "Only an organization admin or manager can view the team dashboard" },
              { status: 403 },
            );
          }

          const { timezone } = await loadOrgContext(scope);
          const now = Date.now();
          const today = dayKey(now, timezone) ?? new Date(now).toISOString().slice(0, 10);
          const monday = addDays(today, -weekdayIndex(today));
          const { summaries, truncated } = await loadScopedSummaries(
            scope,
            monday,
            addDays(monday, 4),
            WEEK_SUMMARY_CAP,
          );

          const days = buildWeekTrendFromSummaries({ summaries, timezone, now });
          return Response.json(
            { ok: true, timezone, days, truncated },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (err: any) {
          console.error("GET /api/attendance/week error:", err);
          return Response.json({ error: "Failed to load the weekly trend" }, { status: 500 });
        }
      },
    },
  },
});
