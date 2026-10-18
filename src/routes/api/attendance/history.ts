import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { dayKey } from "@/lib/attendance-day";
import { resolveDashboardScope } from "@/lib/dashboard-scope";
import { loadOrgContext } from "@/lib/attendance-data.server";
import { mergeEventsNewestFirst, movedInMembers } from "@/lib/manager-history";

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
          const page = (q: FirebaseFirestore.Query): FirebaseFirestore.Query => {
            if (windowMs) q = q.where("timestamp", ">=", new Date(Date.now() - windowMs).toISOString());
            if (typeParam === "in" || typeParam === "out") q = q.where("type", "==", typeParam);
            q = q.orderBy("timestamp", "desc");
            if (cursor) q = q.startAfter(cursor);
            return q;
          };

          // One extra document tells us whether there is another page, without a second read.
          const snap = await page(query).limit(pageSize + 1).get();
          let found = snap.docs;

          // A manager also sees the earlier events of people who joined their team during this
          // window (filed under their previous manager). Two newest-first pages merge into one.
          // A team where nobody has moved in reads nothing extra. (docs/MANAGER-CHANGE-DESIGN.md)
          if (caller.role === "manager" && caller.orgId) {
            const scope = resolveDashboardScope(caller);
            if (scope) {
              const { timezone, roster } = await loadOrgContext(scope);
              const fromDay = (windowMs ? dayKey(Date.now() - windowMs, timezone) : null) ?? "0000-01-01";
              const moved = movedInMembers(roster, timezone, fromDay).filter((m) => m.uid !== caller.uid);
              if (moved.length > 0) {
                const extra = await page(
                  firestoreAdmin
                    .collection("clock_events")
                    .where("orgId", "==", orgId)
                    .where("employeeId", "in", moved.map((m) => m.uid)),
                )
                  .limit(pageSize + 1)
                  .get();
                const wrap = (d: FirebaseFirestore.QueryDocumentSnapshot) => ({
                  id: d.id,
                  timestamp: String(d.data().timestamp ?? ""),
                  doc: d,
                });
                found = mergeEventsNewestFirst(found.map(wrap), extra.docs.map(wrap), pageSize + 1).map((x) => x.doc);
              }
            }
          }
          const hasMore = found.length > pageSize;
          const docs = found.slice(0, pageSize);

          // Late marks a manager excused (docs/LATE-EXCUSE-DESIGN.md): one bounded read by id for the
          // late check-ins on this page. If it fails, the page still loads and shows the stored flag.
          const excusedKeys = new Set<string>();
          const lateKeys = new Set<string>();
          for (const doc of docs) {
            const d = doc.data();
            if (d.late === true && d.type !== "out" && d.employeeId && typeof d.dayKey === "string") {
              lateKeys.add(`${d.employeeId}_${d.dayKey}`);
            }
          }
          if (lateKeys.size > 0 && orgId) {
            try {
              const excuseSnaps = await firestoreAdmin.getAll(
                ...[...lateKeys].map((id) => firestoreAdmin.collection("late_excuses").doc(id)),
              );
              for (const s of excuseSnaps) {
                if (s.exists && s.data()?.orgId === orgId && s.data()?.status === "excused") excusedKeys.add(s.id);
              }
            } catch (excuseErr) {
              console.error("History: could not read late excuses:", excuseErr);
            }
          }

          const records = docs.map((doc) => {
            const d = doc.data();
            const excused = d.late === true && excusedKeys.has(`${d.employeeId}_${d.dayKey}`);
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
              late: d.late === true && !excused,
              lateExcused: excused,
              earlyDeparture: d.earlyDeparture === true,
              voided: !!d.voidedAt,
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
