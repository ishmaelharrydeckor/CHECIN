import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { dayKey, nextScanType } from "@/lib/attendance-day";
import { summaryDocId, type DailySummary } from "@/lib/daily-summary";
import { createTtlCache } from "@/lib/ttl-cache.server";

/**
 * Read-only: is the signed-in employee currently clocked in today?
 * Reads today's `daily_summaries` document (one `get`), the same record the scan
 * route uses to pick the direction, so the scan screen's tag can never disagree
 * with what the next scan will do. Identity comes from the verified ID token
 * only; nothing is read from the request.
 */

// An organization's timezone almost never changes; a few minutes of staleness is fine.
const timezoneCache = createTtlCache<string>(5 * 60_000, 2000);

// See scan.ts: only needed for the first day after the summaries are deployed.
const LEGACY_FALLBACK = process.env.SUMMARY_LEGACY_FALLBACK === "1";

export const Route = createFileRoute("/api/check-in/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          if (!caller.orgId) {
            return Response.json({ error: "Access Denied: no active organization" }, { status: 403 });
          }

          let timezone = timezoneCache.get(caller.orgId);
          if (!timezone) {
            const orgSnap = await firestoreAdmin.collection("organizations").doc(caller.orgId).get();
            timezone = orgSnap.data()?.timezone || "UTC";
            timezoneCache.set(caller.orgId, timezone as string);
          }
          const tz = timezone as string;
          const now = Date.now();
          const today = dayKey(now, tz) ?? new Date(now).toISOString().slice(0, 10);

          const summarySnap = await firestoreAdmin
            .collection("daily_summaries")
            .doc(summaryDocId(caller.uid, today))
            .get();

          let status: "in" | "out";
          if (summarySnap.exists) {
            status = (summarySnap.data() as DailySummary).state === "in" ? "in" : "out";
          } else if (LEGACY_FALLBACK) {
            const lastSnap = await firestoreAdmin
              .collection("clock_events")
              .where("orgId", "==", caller.orgId)
              .where("employeeId", "==", caller.uid)
              .orderBy("timestamp", "desc")
              .limit(1)
              .get();
            const last = lastSnap.empty ? null : lastSnap.docs[0].data();
            status = nextScanType(last, now, tz) === "out" ? "in" : "out";
          } else {
            status = "out"; // no scan yet today
          }

          return Response.json({ status });
        } catch (error: any) {
          console.error("check-in status error:", error);
          return Response.json({ error: "Could not load status" }, { status: 500 });
        }
      },
    },
  },
});
