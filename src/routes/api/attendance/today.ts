import { createFileRoute } from "@tanstack/react-router";
import { verifyCallerToken } from "@/integrations/firebase/admin.server";
import {
  RECENT_EVENT_LIMIT,
  SUMMARY_CAP,
  loadOrgContext,
  loadScopedEvents,
  loadScopedSummaries,
} from "@/lib/attendance-data.server";
import { dashboardCacheKey, resolveDashboardScope } from "@/lib/dashboard-scope";
import { createCachedLoader } from "@/lib/ttl-cache.server";
import type { TodaySummaryData } from "@/lib/attendance-today";
import { buildTodayFromSummaries, dayBoundsMs } from "@/lib/attendance-today";
import { dayKey } from "@/lib/attendance-day";

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
              const { timezone, roster } = await loadOrgContext(scope);
              const now = Date.now();
              const today = dayKey(now, timezone) ?? new Date(now).toISOString().slice(0, 10);
              const { startMs, endMs } = dayBoundsMs(today, timezone);
              const [{ summaries, truncated }, { events: recentEvents }] = await Promise.all([
                loadScopedSummaries(scope, today, today, SUMMARY_CAP),
                loadScopedEvents(scope, startMs, endMs, RECENT_EVENT_LIMIT),
              ]);
              return buildTodayFromSummaries({ summaries, recentEvents, roster, timezone, now, truncated });
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
