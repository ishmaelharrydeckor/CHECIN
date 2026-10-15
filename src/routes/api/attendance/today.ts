import { createFileRoute } from "@tanstack/react-router";
import { verifyCallerToken } from "@/integrations/firebase/admin.server";
import {
  RECENT_EVENT_LIMIT,
  SHIFT_ASSIGNMENT_CAP_TODAY,
  SUMMARY_CAP,
  WEEK_SUMMARY_CAP,
  loadApprovedLeaveOnDay,
  loadOrgContext,
  loadScopedEvents,
  loadScopedSummaries,
  loadShiftAssignments,
} from "@/lib/attendance-data.server";
import { dashboardCacheKey, resolveDashboardScope } from "@/lib/dashboard-scope";
import { createCachedLoader } from "@/lib/ttl-cache.server";
import type { TodaySummaryData } from "@/lib/attendance-today";
import { addDays, buildTodayFromSummaries, dayBoundsMs } from "@/lib/attendance-today";
import { dayKey } from "@/lib/attendance-day";
import { correlationId, logEvent } from "@/lib/log.server";
import { loadHolidayDays, loadScopedLeave } from "@/lib/report-data.server";
import { buildTodayWithShifts } from "@/lib/shift-today";

// Keep each answer for 45 s so several viewers, or one person refreshing, share one calculation.
// The Refresh button asks for ?fresh=1, which recomputes (but not more than once every 5 s).
const loadToday = createCachedLoader<TodaySummaryData>(45_000, 200, 5_000);

/**
 * GET /api/attendance/today
 *
 * Today's numbers for the manager dashboard, computed on the server in the
 * ORGANIZATION's timezone from today's daily summaries (one document per
 * person) plus the newest 20 events for the activity list. A poll reads about
 * (people on the team + 20) documents however many scans happened.
 *
 * Authorization: caller identity, role and organization come only from the
 * verified ID token. Org admins see the whole organization, managers see
 * their own team, everyone else gets 403.
 */
export const Route = createFileRoute("/api/attendance/today")({
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

          const fresh = new URL(request.url).searchParams.get("fresh") === "1";
          const summary = await loadToday(
            dashboardCacheKey(scope),
            async () => {
              const context = await loadOrgContext(scope);
              const { timezone, roster, shifts } = context;
              const now = Date.now();
              const today = dayKey(now, timezone) ?? new Date(now).toISOString().slice(0, 10);
              const { startMs, endMs } = dayBoundsMs(today, timezone);

              if (shifts.shiftsEnabled && process.env.SHIFTS_DISABLED !== "1") {
                const yesterday = addDays(today, -1);
                try {
                  const [
                    { summaries, truncated: summariesTruncated },
                    { assignments, truncated: assignmentsTruncated },
                    leaveResult,
                    holidays,
                    { events: recentEvents },
                  ] = await Promise.all([
                    loadScopedSummaries(scope, yesterday, today, WEEK_SUMMARY_CAP),
                    loadShiftAssignments(scope, yesterday, today, SHIFT_ASSIGNMENT_CAP_TODAY),
                    loadScopedLeave(scope, "approved"),
                    loadHolidayDays(scope.orgId),
                    loadScopedEvents(scope, startMs, endMs, RECENT_EVENT_LIMIT),
                  ]);

                  if (assignments.length > 0) {
                    return buildTodayWithShifts({
                      summaries,
                      recentEvents,
                      roster,
                      assignments,
                      leaves: leaveResult.leaves,
                      holidays,
                      settings: shifts,
                      timezone,
                      now,
                      truncated: summariesTruncated || assignmentsTruncated || leaveResult.truncated,
                    });
                  }
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

              const [{ summaries, truncated }, { events: recentEvents }, leaveResult] = await Promise.all([
                loadScopedSummaries(scope, today, today, SUMMARY_CAP),
                loadScopedEvents(scope, startMs, endMs, RECENT_EVENT_LIMIT),
                // People on approved leave are not expected. If leave cannot be read, the panel still works
                // (it just cannot tell who is on leave).
                loadApprovedLeaveOnDay(scope, today).catch((leaveErr) => {
                  logEvent({
                    action: "attendance.leave_fallback",
                    outcome: "error",
                    correlationId: correlationId(request),
                    uid: scope.uid,
                    orgId: scope.orgId,
                    fields: { reason: leaveErr instanceof Error ? leaveErr.message.slice(0, 80) : "read_error" },
                  });
                  return { leaves: [], truncated: false };
                }),
              ]);
              return buildTodayFromSummaries({
                summaries,
                recentEvents,
                roster,
                timezone,
                now,
                truncated: truncated || leaveResult.truncated,
                leaves: leaveResult.leaves,
              });
            },
            { fresh },
          );
          return Response.json({ ok: true, summary }, { headers: { "Cache-Control": "private, no-store" } });
        } catch (err: any) {
          console.error("GET /api/attendance/today error:", err);
          return Response.json({ error: "Failed to load today's attendance" }, { status: 500 });
        }
      },
    },
  },
});
