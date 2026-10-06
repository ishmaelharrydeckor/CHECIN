import { createFileRoute } from "@tanstack/react-router";
import { verifyCallerToken } from "@/integrations/firebase/admin.server";
import {
  TODAY_EVENT_CAP,
  loadOrgContext,
  loadScopedEvents,
} from "@/lib/attendance-data.server";
import { resolveDashboardScope } from "@/lib/dashboard-scope";
import { buildTodaySummary, dayBoundsMs } from "@/lib/attendance-today";
import { dayKey } from "@/lib/attendance-day";

/**
 * GET /api/attendance/today
 *
 * Today's numbers for the manager dashboard, computed on the server in the
 * ORGANIZATION's timezone from today's check-in events only. Replaces the
 * browser-side math that used capped, multi-day lists.
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

          const { timezone, roster } = await loadOrgContext(scope);
          const now = Date.now();
          const today = dayKey(now, timezone) ?? new Date(now).toISOString().slice(0, 10);
          const { startMs, endMs } = dayBoundsMs(today, timezone);
          const { events, truncated } = await loadScopedEvents(scope, startMs, endMs, TODAY_EVENT_CAP);

          const summary = buildTodaySummary({ events, roster, timezone, now, truncated });
          return Response.json({ ok: true, summary }, { headers: { "Cache-Control": "private, no-store" } });
        } catch (err: any) {
          console.error("GET /api/attendance/today error:", err);
          return Response.json({ error: "Failed to load today's attendance" }, { status: 500 });
        }
      },
    },
  },
});
