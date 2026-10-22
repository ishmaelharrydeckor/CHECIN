import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { dashboardCacheKey, resolveDashboardScope, type DashboardScope } from "@/lib/dashboard-scope";
import { correlationId, logEvent } from "@/lib/log.server";
import type { NavCounts } from "@/lib/nav-helpers";
import { createTtlCache } from "@/lib/ttl-cache.server";

/**
 * GET /api/nav-counts
 *
 * How much is waiting for the signed-in manager or admin, for the badges on the menu: leave requests
 * and work-diary days waiting for a decision. Who is asking, and how much they see, come ONLY from the
 * verified token (dashboard-scope.ts): an org admin counts the whole organization, a manager their own
 * team, anyone else is refused. Two count queries (they read an index entry per 1,000 matches, not the
 * documents), answered from a 30-second cache per scope, so a busy screen cannot turn into many reads.
 * The screen asks when it opens and at most once a minute after that; nothing polls.
 */
const cache = createTtlCache<NavCounts>(30_000, 1000);

async function countPending(collection: string, scope: DashboardScope): Promise<number> {
  let query: FirebaseFirestore.Query = firestoreAdmin
    .collection(collection)
    .where("orgId", "==", scope.orgId)
    .where("status", "==", "pending");
  if (scope.role === "manager") query = query.where("managerId", "==", scope.uid);
  // bounded-ok: a count aggregation answers with one number, not documents
  const snap = await query.count().get();
  return snap.data().count;
}

export const Route = createFileRoute("/api/nav-counts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) return Response.json({ error: "Unauthorized" }, { status: 401 });
          const scope = resolveDashboardScope(caller);
          if (!scope) return Response.json({ error: "Only an organization admin or manager can see this." }, { status: 403 });

          const key = dashboardCacheKey(scope);
          let counts = cache.get(key);
          if (!counts) {
            const [leave, diary] = await Promise.all([countPending("leave_requests", scope), countPending("wfh_diary_days", scope)]);
            counts = { leave, diary };
            cache.set(key, counts);
          }
          return Response.json({ ok: true, ...counts }, { headers: { "Cache-Control": "private, no-store" } });
        } catch (err) {
          logEvent({ action: "nav.counts", outcome: "error", correlationId: correlationId(request), fields: { reason: "read_error" } });
          console.error("GET /api/nav-counts error:", err);
          return Response.json({ error: "Could not load the counts." }, { status: 500 });
        }
      },
    },
  },
});
