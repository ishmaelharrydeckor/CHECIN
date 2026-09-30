import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";

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
          const searchParam = (url.searchParams.get("search") || "").trim().toLowerCase();

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

          let snap;
          try {
            snap = await query.orderBy("timestamp", "desc").limit(200).get();
          } catch (queryErr: any) {
            console.warn("[History] Index fallback:", queryErr?.message);
            snap = await query.limit(200).get();
          }

          let docs = snap.docs;
          docs.sort((a, b) => {
            const timeA = new Date(a.data().timestamp || 0).getTime();
            const timeB = new Date(b.data().timestamp || 0).getTime();
            return timeB - timeA;
          });

          let records = docs.map((doc) => {
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

          // In-memory filters for type and search term
          if (typeParam && (typeParam === "in" || typeParam === "out")) {
            records = records.filter((r) => r.type === typeParam);
          }

          if (searchParam) {
            records = records.filter(
              (r) =>
                r.employeeName.toLowerCase().includes(searchParam) ||
                r.email.toLowerCase().includes(searchParam) ||
                r.locationName.toLowerCase().includes(searchParam),
            );
          }

          return Response.json({ ok: true, records });
        } catch (err: any) {
          console.error("GET /api/attendance/history error:", err);
          return Response.json({ error: "Failed to fetch attendance history" }, { status: 500 });
        }
      },
    },
  },
});
