import { createFileRoute } from "@tanstack/react-router";
import { canManageKiosks, firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";

export const Route = createFileRoute("/api/locations/revoke")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // checkRevoked so a manager whose tablet permission was just removed is cut off at once
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });

          if (!caller || !caller.orgId) {
            return Response.json({ error: "Unauthorized: Missing organization membership" }, { status: 401 });
          }

          // Org admins, or managers an admin has explicitly allowed
          if (!canManageKiosks(caller)) {
            return Response.json(
              { error: "Forbidden: Your organization admin hasn't allowed you to revoke tablets." },
              { status: 403 },
            );
          }

          const body = await request.json();
          const locationId = (body?.locationId || "").trim();

          if (!locationId) {
            return Response.json({ error: "Missing locationId" }, { status: 400 });
          }

          // Verify location belongs to this caller's organization
          const locDoc = await firestoreAdmin.collection("locations").doc(locationId).get();
          if (!locDoc.exists || locDoc.data()?.orgId !== caller.orgId) {
            return Response.json(
              { error: "Location not found in your organization." },
              { status: 404 },
            );
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
