import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";

const DEFAULT_PAGE = 50;
const MAX_PAGE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_MS: Record<string, number> = { today: DAY_MS, week: 7 * DAY_MS, month: 30 * DAY_MS };

export const Route = createFileRoute("/api/attendance/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const url = new URL(request.url);
          const typeParam = url.searchParams.get("type"); // "in" | "out" | null
          const rangeParam = url.searchParams.get("range") || "today"; // today | week | month | all
          const cursor = url.searchParams.get("cursor"); // timestamp of the last record already shown
          const pageSize = Math.min(
            Math.max(parseInt(url.searchParams.get("limit") || "", 10) || DEFAULT_PAGE, 1),
            MAX_PAGE,
          );

          let orgId = caller.orgId;
          if (!orgId) {
            try {
              const userDoc = await firestoreAdmin.collection("users").doc(caller.uid).get();
              if (userDoc.exists && userDoc.data()?.orgId) {
                orgId = userDoc.data()!.orgId;
              }
            } catch (e) {
              console.warn("Could not check user doc for orgId in history:", e);
            }
          }

          if (!orgId) {
            return Response.json({ error: "No organization associated with this account" }, { status: 403 });
          }

          let query: FirebaseFirestore.Query = firestoreAdmin
            .collection("clock_events")
            .where("orgId", "==", orgId);

          // Role-based tenant & team scoping per AGENTS.md
          // Default-deny: only an explicit org_admin sees org-wide; a missing/unknown role is
          // treated as an employee and sees only their own events.
          if (caller.role === "org_admin" && caller.orgId) {
            // org-wide within orgId
          } else if (caller.role === "manager" && caller.orgId) {
            query = query.where("managerId", "==", caller.uid);
          } else {
            query = query.where("employeeId", "==", caller.uid);
          }

          // The time range and event type are applied by the database, not after the fact, and one
          // request reads at most one page. Needs the clock_events indexes in firestore.indexes.json.
          const windowMs = RANGE_MS[rangeParam];
          if (windowMs) {
            query = query.where("timestamp", ">=", new Date(Date.now() - windowMs).toISOString());
          }
          if (typeParam === "in" || typeParam === "out") {
            query = query.where("type", "==", typeParam);
          }
          query = query.orderBy("timestamp", "desc");
          if (cursor) query = query.startAfter(cursor);

          // One extra document tells us whether there is another page, without a second read.
          const snap = await query.limit(pageSize + 1).get();
          const hasMore = snap.docs.length > pageSize;
          const docs = snap.docs.slice(0, pageSize);

          const records = docs.map((doc) => {
            const d = doc.data();
            return {
              id: doc.id,
              employeeId: d.employeeId || "",
              employeeName: d.employeeName || "Employee",
              email: d.employeeEmail || "",
              department: d.department || "General Operations",
              managerId: d.managerId || null,
              managerName: d.managerName || (d.managerId ? "Manager" : "Direct Supervisor"),
              locationId: d.locationId || "",
              locationName: d.locationName || "Main Entrance Terminal",
              type: d.type === "out" ? "out" : "in",
              late: d.late === true,
              earlyDeparture: d.earlyDeparture === true,
              timestamp: d.timestamp,
              verifiedMethod: d.verifiedBy || "15s Dynamic QR · HMAC Verified",
            };
          });

          const nextCursor = hasMore && docs.length ? docs[docs.length - 1].data().timestamp : null;

          return Response.json({ ok: true, records, hasMore, nextCursor });
        } catch (err: any) {
          console.error("GET /api/attendance/history error:", err);
          return Response.json({ error: "Failed to fetch attendance history" }, { status: 500 });
        }
      },
    },
  },
});
