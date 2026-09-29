import { createFileRoute } from "@tanstack/react-router";
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

          if (caller.role !== "org_admin") {
            return Response.json({ error: "Forbidden: Org Admin privileges required to pair kiosks" }, { status: 403 });
          }

          const body = await request.json();
          const locationId = (body?.locationId || "").trim();
          if (!locationId) {
            return Response.json({ error: "Missing locationId" }, { status: 400 });
          }

          // Verify location belongs to caller's org, or auto-provision if initial location
          const locDoc = await firestoreAdmin.collection("locations").doc(locationId).get();
          let locationName = "Main Entrance Lobby";

          if (!locDoc.exists) {
            const defaultNames: Record<string, string> = {
              "loc-01": "Main Lobby Entrance",
              "loc-02": "South Gate Entrance",
              "loc-main-lobby": "Main Entrance Lobby",
            };
            locationName = defaultNames[locationId] || `Entrance (${locationId})`;
            await firestoreAdmin.collection("locations").doc(locationId).set({
              name: locationName,
              orgId: callerOrgId,
              createdAt: new Date().toISOString(),
              createdById: callerUid,
            });
          } else {
            const locData = locDoc.data()!;
            if (locData.orgId !== callerOrgId) {
              return Response.json({ error: "Location not found in your organization" }, { status: 404 });
            }
            locationName = locData.name || "Entrance Point";
          }

          // Generate 6-digit random code
          const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
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
