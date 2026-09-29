import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";

export const Route = createFileRoute("/api/locations/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const isDemo = url.searchParams.get("demo") === "true";
          const caller = await verifyCallerToken(request.headers.get("authorization"));

          const callerOrgId = caller?.orgId || (isDemo ? "org-checin-demo" : null);

          if (!callerOrgId) {
            return Response.json({ error: "Unauthorized: Missing organization membership" }, { status: 401 });
          }

          const locsSnap = await firestoreAdmin
            .collection("locations")
            .where("orgId", "==", callerOrgId)
            .get();

          const locations = [];
          for (const doc of locsSnap.docs) {
            const data = doc.data();
            // Check if kiosk is paired in Admin-only kiosks collection
            const kioskDoc = await firestoreAdmin.collection("kiosks").doc(doc.id).get();
            const isPaired = kioskDoc.exists && !!kioskDoc.data()?.kiosk_secret_hash;
            const pairedAt = kioskDoc.data()?.kiosk_paired_at || null;

            locations.push({
              id: doc.id,
              name: data.name,
              orgId: data.orgId,
              createdAt: data.createdAt,
              isPaired,
              pairedAt,
            });
          }

          // If no locations exist yet for this org, auto-seed a default "Main Entrance Lobby"
          if (locations.length === 0) {
            const defaultRef = firestoreAdmin.collection("locations").doc();
            const now = new Date().toISOString();
            await defaultRef.set({
              name: "Main Entrance Lobby",
              orgId: callerOrgId,
              createdAt: now,
            });
            locations.push({
              id: defaultRef.id,
              name: "Main Entrance Lobby",
              orgId: callerOrgId,
              createdAt: now,
              isPaired: false,
              pairedAt: null,
            });
          }

          return Response.json({ ok: true, locations });
        } catch (err: any) {
          console.error("GET /api/locations error:", err);
          return Response.json({ error: "Failed to fetch locations" }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const isDemo = url.searchParams.get("demo") === "true";
          const caller = await verifyCallerToken(request.headers.get("authorization"));

          const callerOrgId = caller?.orgId || (isDemo ? "org-checin-demo" : null);
          const callerUid = caller?.uid || "demo-admin";

          if (!callerOrgId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          // Only org_admin can add locations
          if (caller && caller.role !== "org_admin" && !isDemo) {
            return Response.json({ error: "Forbidden: Org Admin privileges required to create physical locations" }, { status: 403 });
          }

          const body = await request.json();
          const name = (body?.name || "").trim();

          if (!name || name.length < 2) {
            return Response.json({ error: "Location name must be at least 2 characters" }, { status: 400 });
          }

          const newRef = firestoreAdmin.collection("locations").doc();
          const now = new Date().toISOString();

          await newRef.set({
            name,
            orgId: callerOrgId,
            createdAt: now,
            createdById: callerUid,
          });

          return Response.json({
            ok: true,
            location: {
              id: newRef.id,
              name,
              orgId: callerOrgId,
              createdAt: now,
              isPaired: false,
            },
          });
        } catch (err: any) {
          console.error("POST /api/locations error:", err);
          return Response.json({ error: "Failed to create location" }, { status: 500 });
        }
      },
    },
  },
});
