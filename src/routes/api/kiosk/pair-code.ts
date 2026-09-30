import { createFileRoute } from "@tanstack/react-router";
import { randomInt } from "node:crypto";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";

export const Route = createFileRoute("/api/kiosk/pair-code")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));

          const callerOrgId = caller?.orgId;
          const callerUid = caller?.uid;

          if (!caller || !callerOrgId || !callerUid) {
            return Response.json({ error: "Unauthorized: Missing organization membership" }, { status: 401 });
          }

          if (caller.role !== "org_admin" && caller.role !== "manager") {
            return Response.json({ error: "Forbidden: Org Admin or Manager privileges required to pair kiosks" }, { status: 403 });
          }

          const body = await request.json();
          const locationId = (body?.locationId || "").trim();
          if (!locationId) {
            return Response.json({ error: "Missing locationId" }, { status: 400 });
          }

          // The location must already exist in the caller's org. Locations are created only by
          // org admins (POST /api/locations); pairing never creates them.
          const locDoc = await firestoreAdmin.collection("locations").doc(locationId).get();
          if (!locDoc.exists || locDoc.data()?.orgId !== callerOrgId) {
            return Response.json({ error: "Location not found in your organization" }, { status: 404 });
          }
          const locationName: string = locDoc.data()!.name || "Entrance Point";

          // Generate 6-digit code from a cryptographically secure source
          const rawCode = randomInt(100000, 1000000).toString();
          const code = `CHK-${rawCode}`;

          // Expire in 10 minutes (AGENTS.md Kiosk pairing flow)
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

          // Store in Admin-SDK-only collection kiosk_pairings
          await firestoreAdmin.collection("kiosk_pairings").doc(code).set({
            code,
            orgId: callerOrgId,
            locationId,
            locationName,
            status: "pending",
            createdBy: callerUid,
            createdAt: new Date().toISOString(),
            expiresAt,
          });

          return Response.json({
            ok: true,
            code,
            expiresAt,
            locationId,
            locationName,
          });
        } catch (err: any) {
          console.error("POST /api/kiosk/pair-code error:", err);
          return Response.json({ error: "Failed to generate pairing code" }, { status: 500 });
        }
      },
    },
  },
});
