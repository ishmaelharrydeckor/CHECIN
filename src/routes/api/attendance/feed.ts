import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";

export const Route = createFileRoute("/api/attendance/feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const isDemo = url.searchParams.get("demo") === "true";

          let orgId: string | null = null;
          const authHeader = request.headers.get("authorization");
          const caller = await verifyCallerToken(authHeader);

          if (caller && caller.orgId) {
            orgId = caller.orgId;
          }

          // Fetch latest clock events ordered by timestamp (single-field index, no composite index needed)
          const snap = await firestoreAdmin
            .collection("clock_events")
            .orderBy("timestamp", "desc")
            .limit(50)
            .get();

          let docs = snap.docs;
          if (orgId && !isDemo && orgId !== "org-checin-demo" && orgId !== "demo-org") {
            docs = docs.filter((doc) => doc.data().orgId === orgId);
          }
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
              department: d.department || "General",
              location: d.locationName || "Main Lobby",
              type: d.type === "out" ? "out" : "in",
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
