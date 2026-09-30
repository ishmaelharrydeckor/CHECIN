import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";

export const Route = createFileRoute("/api/attendance/feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          let orgId = caller.orgId;
          if (!orgId) {
            try {
              const userDoc = await firestoreAdmin.collection("users").doc(caller.uid).get();
              if (userDoc.exists && userDoc.data()?.orgId) {
                orgId = userDoc.data()!.orgId;
              }
            } catch (e) {
              console.warn("Could not check user doc for orgId in feed:", e);
            }
          }

          if (!orgId) {
            return Response.json({ error: "No organization associated with this account" }, { status: 403 });
          }

          let query: FirebaseFirestore.Query = firestoreAdmin
            .collection("clock_events")
            .where("orgId", "==", orgId);

          // Strict role-based tenant & team scoping per AGENTS.md
          if (caller.role === "employee") {
            query = query.where("employeeId", "==", caller.uid);
          } else if (caller.role === "manager") {
            query = query.where("managerId", "==", caller.uid);
          }

          let snap;
          try {
            snap = await query.orderBy("timestamp", "desc").limit(30).get();
          } catch (queryErr: any) {
            // Graceful fallback if composite index is pending in console
            console.warn("[Feed] Composite index fallback:", queryErr?.message);
            snap = await query.limit(50).get();
          }

          let docs = snap.docs;
          // In case of fallback without orderBy
          docs.sort((a, b) => {
            const timeA = new Date(a.data().timestamp || 0).getTime();
            const timeB = new Date(b.data().timestamp || 0).getTime();
            return timeB - timeA;
          });
          docs = docs.slice(0, 30);

          const events = docs.map((doc) => {
            const d = doc.data();
            return {
              id: doc.id,
              name: d.employeeName || "Employee",
              email: d.employeeEmail || "",
              initials: (d.employeeName || "EM")
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase(),
              department: d.department || "General Operations",
              location: d.locationName || "Main Lobby",
              type: d.type === "out" ? "out" : "in",
              late: d.late === true,
              earlyDeparture: d.earlyDeparture === true,
              time: new Date(d.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
              timestamp: d.timestamp,
              verifiedBy: d.verifiedBy || "kiosk_hmac_sha256",
            };
          });

          return Response.json({ ok: true, events });
        } catch (err: any) {
          console.error("GET /api/attendance/feed error:", err);
          return Response.json({ error: "Failed to fetch attendance feed" }, { status: 500 });
        }
      },
    },
  },
});
