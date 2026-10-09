import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { createTtlCache } from "@/lib/ttl-cache.server";
import { buildMyDays, recentSummaryIds } from "@/lib/my-days";

/**
 * GET /api/attendance/me
 *
 * The signed-in person's OWN last seven days (check-in, check-out, time worked, late and early
 * flags), computed from their daily summaries in the organization's timezone. Used by the "My
 * page" screen.
 *
 * Identity and organization come only from the verified token. The seven document ids are built
 * from the caller's own uid, so there is no query, no index, and exactly seven reads; nothing in
 * the request can point it at somebody else's data. Any role may call it, because it only ever
 * returns the caller's own days.
 */
const tzCache = createTtlCache<string>(5 * 60_000);

export const Route = createFileRoute("/api/attendance/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const orgId = typeof caller.orgId === "string" ? caller.orgId : "";
          if (!orgId) {
            return Response.json({ error: "No organization associated with this account" }, { status: 403 });
          }

          let timezone = tzCache.get(orgId);
          if (!timezone) {
            const orgSnap = await firestoreAdmin.collection("organizations").doc(orgId).get();
            timezone = (orgSnap.exists && (orgSnap.data()?.timezone as string)) || "UTC";
            tzCache.set(orgId, timezone);
          }

          const refs = recentSummaryIds(caller.uid, timezone).map((id) =>
            firestoreAdmin.collection("daily_summaries").doc(id),
          );
          const snaps = refs.length > 0 ? await firestoreAdmin.getAll(...refs) : [];
          const days = buildMyDays(
            snaps.filter((s) => s.exists).map((s) => s.data() ?? {}),
            { employeeId: caller.uid, orgId, timezone },
          );

          return Response.json(
            { ok: true, timezone, days },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (err: any) {
          console.error("GET /api/attendance/me error:", err);
          return Response.json({ error: "Could not load your timesheet" }, { status: 500 });
        }
      },
    },
  },
});
