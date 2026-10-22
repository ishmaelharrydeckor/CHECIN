import { createFileRoute } from "@tanstack/react-router";
import { verifyCallerToken } from "@/integrations/firebase/admin.server";
import {
  SHIFT_ASSIGNMENT_CAP_RANGE,
  WEEK_SUMMARY_CAP,
  WFH_RANGE_CAP,
  loadOrgContext,
  loadScopedSummaries,
  loadShiftAssignments,
  loadWfhRange,
} from "@/lib/attendance-data.server";
import { dashboardCacheKey, resolveDashboardScope } from "@/lib/dashboard-scope";
import { createCachedLoader } from "@/lib/ttl-cache.server";
import { addDays } from "@/lib/attendance-today";
import { dayKey } from "@/lib/attendance-day";
import { correlationId, logEvent } from "@/lib/log.server";
import { loadHolidayDays, loadScopedLeave } from "@/lib/report-data.server";
import { buildAttendanceRegister } from "@/lib/report-data";
import type { ShiftSnapshot } from "@/lib/shift-engine";
import { buildTeamRoster, type RosterData, type RosterShift } from "@/lib/team-roster";

// One answer per scope for 45 s, like the Today panel. The Refresh button asks for ?fresh=1.
const loadRoster = createCachedLoader<RosterData>(45_000, 200, 5_000);

/**
 * GET /api/attendance/roster
 *
 * The team roster: one row per person for today (where they are, their shift, when they arrived) and how they
 * have done this month so far (attendance and punctuality). Built from the same day-status rules as the
 * attendance register (buildAttendanceRegister), over the 1st of the month up to today, so it cannot disagree
 * with the register or the Today tiles. Reads daily summaries, approved leave, holidays, work-from-home days
 * and shift assignments, never raw scans.
 *
 * Authorization: who is asking, and how much they see, come only from the verified token. An org admin sees the
 * whole organization, a manager their own team, everyone else gets 403. At most 500 people are returned.
 */
export const Route = createFileRoute("/api/attendance/roster")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) return Response.json({ error: "Unauthorized" }, { status: 401 });
          const scope = resolveDashboardScope(caller);
          if (!scope) {
            return Response.json({ error: "Only an organization admin or manager can view the team roster" }, { status: 403 });
          }

          const fresh = new URL(request.url).searchParams.get("fresh") === "1";
          const data = await loadRoster(
            dashboardCacheKey(scope),
            async () => {
              const { timezone, roster, shifts } = await loadOrgContext(scope);
              const now = Date.now();
              const today = dayKey(now, timezone) ?? new Date(now).toISOString().slice(0, 10);
              const monthFrom = `${today.slice(0, 8)}01`;
              const days: string[] = [];
              for (let d = monthFrom; d <= today; d = addDays(d, 1)) days.push(d);

              // If work-from-home days cannot be read the roster still works, and says it may be incomplete.
              const wfh = await loadWfhRange(scope, monthFrom, today, WFH_RANGE_CAP).catch(() => ({
                days: [] as { employeeId: string; dayKey: string }[],
                truncated: true,
              }));
              const [summaries, leave, holidays] = await Promise.all([
                loadScopedSummaries(scope, monthFrom, today, WEEK_SUMMARY_CAP),
                loadScopedLeave(scope, "approved"),
                loadHolidayDays(scope.orgId),
              ]);

              // Shifts, only when the organization uses them; if they cannot be read the roster falls back to
              // the weekday rule, exactly like the register.
              let assignments: { employeeId: string; dayKey: string; shift: ShiftSnapshot }[] = [];
              let assignmentsTruncated = false;
              if (shifts.shiftsEnabled && process.env.SHIFTS_DISABLED !== "1") {
                try {
                  const r = await loadShiftAssignments(scope, monthFrom, today, SHIFT_ASSIGNMENT_CAP_RANGE);
                  assignments = r.assignments;
                  assignmentsTruncated = r.truncated;
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

              const register = buildAttendanceRegister({
                days,
                people: roster,
                summaries: summaries.summaries,
                leaves: leave.leaves,
                holidays,
                timezone,
                generatedAt: new Date(now).toISOString(),
                from: monthFrom,
                to: today,
                readTruncated: summaries.truncated || leave.truncated || wfh.truncated || assignmentsTruncated,
                shifts: assignments.length > 0 ? { assignments, nowMs: now } : undefined,
                wfh: wfh.days,
                breaks: false,
              });

              const todayStates = new Map<string, "in" | "out">();
              for (const s of summaries.summaries) {
                if (s.dayKey === today) todayStates.set(s.employeeId, s.state === "out" ? "out" : "in");
              }
              const todayShifts = new Map<string, RosterShift>();
              for (const a of assignments) {
                if (a.dayKey === today) todayShifts.set(a.employeeId, { name: a.shift.name, start: a.shift.start ?? null, end: a.shift.end ?? null });
              }
              return buildTeamRoster({
                register,
                teamIds: new Set(roster.map((r) => r.uid)),
                today,
                todayStates,
                todayShifts,
                generatedAt: new Date(now).toISOString(),
              });
            },
            { fresh },
          );
          return Response.json({ ok: true, roster: data }, { headers: { "Cache-Control": "private, no-store" } });
        } catch (err) {
          console.error("GET /api/attendance/roster error:", err);
          return Response.json({ error: "Could not load the team roster" }, { status: 500 });
        }
      },
    },
  },
});
