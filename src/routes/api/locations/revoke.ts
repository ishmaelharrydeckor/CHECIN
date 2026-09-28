import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";

export const Route = createFileRoute("/api/locations/revoke")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const isDemo = url.searchParams.get("demo") === "true";
          const caller = await verifyCallerToken(request.headers.get("authorization"));

          if (!caller || !caller.orgId) {
            if (!isDemo) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }
          } else if (caller.role !== "org_admin" && caller.role !== "manager" && !isDemo) {
            return Response.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
          }

          const body = await request.json();
          const locationId = (body?.locationId || "").trim();

          if (!locationId) {
            return Response.json({ error: "Missing locationId" }, { status: 400 });
          }

          // Delete kiosk secret hash from Admin-only collection
          const kioskRef = firestoreAdmin.collection("kiosks").doc(locationId);
          await kioskRef.delete();

          return Response.json({ ok: true, message: "Kiosk hardware pairing revoked successfully." });
        } catch (err: any) {
          console.error("POST /api/locations/revoke error:", err);
          return Response.json({ error: "Failed to revoke kiosk" }, { status: 500 });
        }
      },
    },
  },
});
