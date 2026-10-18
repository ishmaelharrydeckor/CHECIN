import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { WEEK_SUMMARY_CAP, loadOrgContext, loadScopedSummaries } from "@/lib/attendance-data.server";
import { addDays, formatClock } from "@/lib/attendance-today";
import { dayKey } from "@/lib/attendance-day";
import { authorizeReportCaller } from "@/lib/report-data.server";
import { buildReviewRows, isRealDay, windowStart, type ExcuseDetail } from "@/lib/late-excuse";

const EXCUSE_READ_CAP = 1500;
const DEFAULT_DAYS_BACK = 7;

/**
 * GET /api/attendance/late-review?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The late arrivals the caller may review (docs/LATE-EXCUSE-DESIGN.md): an org admin sees the whole
 * organization, a manager only people filed under them, decided by the verified token alone. Only the
 * excusable window (today and the previous 14 days) can be asked for; anything else is trimmed to it.
 * Reads daily summaries and the excuse documents for the range, both bounded.
 */
export const Route = createFileRoute("/api/attendance/late-review")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authorizeReportCaller(request);
          if ("response" in auth) return auth.response;
          const { scope } = auth;

          const { timezone } = await loadOrgContext(scope);
          const today = dayKey(Date.now(), timezone) ?? new Date().toISOString().slice(0, 10);
          const oldest = windowStart(today);

          const url = new URL(request.url);
          const rawFrom = url.searchParams.get("from");
          const rawTo = url.searchParams.get("to");
          let to = isRealDay(rawTo) ? rawTo : today;
          let from = isRealDay(rawFrom) ? rawFrom : addDays(today, -DEFAULT_DAYS_BACK);
          if (to > today) to = today;
          if (from < oldest) from = oldest;
          if (from > to) from = to;

          let excuseQuery: FirebaseFirestore.Query = firestoreAdmin
            .collection("late_excuses")
            .where("orgId", "==", scope.orgId);
          if (scope.role === "manager") excuseQuery = excuseQuery.where("managerId", "==", scope.uid);

          const [{ summaries, truncated: summariesTruncated }, excuseSnap] = await Promise.all([
            loadScopedSummaries(scope, from, to, WEEK_SUMMARY_CAP),
            excuseQuery.where("dayKey", ">=", from).where("dayKey", "<=", to).limit(EXCUSE_READ_CAP).get(),
          ]);

          const excuses = new Map<string, ExcuseDetail>();
          for (const d of excuseSnap.docs) excuses.set(d.id, d.data() as ExcuseDetail);

          const { rows, truncated } = buildReviewRows({
            summaries,
            excuses,
            clock: (iso) => formatClock(iso, timezone),
          });

          return Response.json(
            {
              ok: true,
              rows,
              from,
              to,
              today,
              windowStart: oldest,
              timezone,
              truncated: truncated || summariesTruncated || excuseSnap.size >= EXCUSE_READ_CAP,
            },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (err) {
          console.error("GET /api/attendance/late-review error:", err);
          return Response.json({ error: "Could not load the late arrivals." }, { status: 500 });
        }
      },
    },
  },
});
