import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { nextScanType } from "@/lib/attendance-day";

/**
 * Read-only: is the signed-in employee currently clocked in today?
 * Uses the same "last event today in the org timezone" rule as the scan route,
 * so the scan screen's tag can never disagree with what the next scan will do.
 * Identity comes from the verified ID token only; nothing is read from the request.
 */
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

          const [orgSnap, lastSnap] = await Promise.all([
            firestoreAdmin.collection("organizations").doc(caller.orgId).get(),
            firestoreAdmin
              .collection("clock_events")
              .where("orgId", "==", caller.orgId)
              .where("employeeId", "==", caller.uid)
              .orderBy("timestamp", "desc")
              .limit(1)
              .get(),
          ]);

          const timezone = orgSnap.data()?.timezone || "UTC";
          const last = lastSnap.empty ? null : lastSnap.docs[0].data();
          // If the next scan would be "out", the person is currently in.
          const status = nextScanType(last, Date.now(), timezone) === "out" ? "in" : "out";

          return Response.json({ status });
        } catch (error: any) {
          console.error("check-in status error:", error);
          return Response.json({ error: "Could not load status" }, { status: 500 });
        }
      },
    },
  },
});
