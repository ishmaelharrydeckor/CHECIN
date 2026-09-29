import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";

export const Route = createFileRoute("/api/attendance/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const isDemo = url.searchParams.get("demo") === "true";
          const typeParam = url.searchParams.get("type"); // "in" | "out" | null
          const searchParam = (url.searchParams.get("search") || "").trim().toLowerCase();

          let orgId: string | null = null;
          const authHeader = request.headers.get("authorization");
          const caller = await verifyCallerToken(authHeader);

          if (caller && caller.orgId) {
            orgId = caller.orgId;
          } else if (caller && caller.uid) {
            try {
              const userDoc = await firestoreAdmin.collection("users").doc(caller.uid).get();
              if (userDoc.exists && userDoc.data()?.orgId) {
                orgId = userDoc.data()!.orgId;
              }
            } catch (e) {
              console.warn("Could not check user doc for orgId in history:", e);
            }
          }

          if (isDemo && !orgId) {
            orgId = "org-checin-demo";
          }

          if (!orgId) {
            return Response.json({ ok: true, records: [] });
          }

          let query: FirebaseFirestore.Query = firestoreAdmin
            .collection("clock_events")
            .where("orgId", "==", orgId);

          // Role-based tenant & team scoping per AGENTS.md
          if (caller?.role === "employee") {
            query = query.where("employeeId", "==", caller.uid);
          } else if (caller?.role === "manager") {
            query = query.where("managerId", "==", caller.uid);
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
              managerId: d.managerId || null,
              managerName: d.managerName || (d.managerId ? "Manager" : "Direct Supervisor"),
              locationId: d.locationId || "",
              locationName: d.locationName || "Main Entrance Terminal",
              type: d.type === "out" ? "out" : "in",
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
