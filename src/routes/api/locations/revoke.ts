import { createFileRoute } from "@tanstack/react-router";
import { FieldValue } from "firebase-admin/firestore";
import { canManageKiosks, firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { invalidateKiosk } from "@/lib/kiosk-cache.server";

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

          // Remove the secret hash but keep the document, so the admin and manager portals can show
          // "Revoked" instead of the tablet silently vanishing. No hash means it can no longer mint tokens.
          const kioskRef = firestoreAdmin.collection("kiosks").doc(locationId);
          await kioskRef.set(
            {
              orgId: caller.orgId,
              locationId,
              kiosk_secret_hash: FieldValue.delete(),
              kiosk_paired_at: FieldValue.delete(),
              kiosk_revoked_at: new Date().toISOString(),
              kiosk_revoked_by: caller.uid,
            },
            { merge: true },
          );
          invalidateKiosk(locationId);

          return Response.json({ ok: true, message: "Kiosk hardware pairing revoked successfully." });
        } catch (err: any) {
          console.error("POST /api/locations/revoke error:", err);
          return Response.json({ error: "Failed to revoke kiosk" }, { status: 500 });
        }
      },
    },
  },
});
