import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { parseHoursInput, DEFAULT_CHECKOUT_WINDOW_MINUTES } from "@/lib/attendance-windows";

export const Route = createFileRoute("/api/locations/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));

          const callerOrgId = caller?.orgId;

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
              reportingTime: data.reportingTime ?? null,
              closingTime: data.closingTime ?? null,
              checkoutWindowMinutes: data.checkoutWindowMinutes ?? DEFAULT_CHECKOUT_WINDOW_MINUTES,
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
              reportingTime: null,
              closingTime: null,
              checkoutWindowMinutes: DEFAULT_CHECKOUT_WINDOW_MINUTES,
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
          const caller = await verifyCallerToken(request.headers.get("authorization"));

          const callerOrgId = caller?.orgId;
          const callerUid = caller?.uid;

          if (!callerOrgId || !callerUid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          // Only org_admin can add locations
          if (caller.role !== "org_admin") {
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
              reportingTime: null,
              closingTime: null,
              checkoutWindowMinutes: DEFAULT_CHECKOUT_WINDOW_MINUTES,
              isPaired: false,
            },
          });
        } catch (err: any) {
          console.error("POST /api/locations error:", err);
          return Response.json({ error: "Failed to create location" }, { status: 500 });
        }
      },

      // Set reporting/closing hours. Org admins and managers may edit; the
      // location must belong to the caller's org (derived from the verified token).
      PATCH: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller?.uid || !caller.orgId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          if (caller.role !== "org_admin" && caller.role !== "manager") {
            return Response.json({ error: "Forbidden: Admin or Manager privileges required" }, { status: 403 });
          }

          const body = await request.json();
          const locationId = (body?.locationId || "").trim();
          if (!locationId) {
            return Response.json({ error: "Missing locationId" }, { status: 400 });
          }

          const { value, error } = parseHoursInput(body);
          if (error) return Response.json({ error }, { status: 400 });
          if (Object.keys(value).length === 0) {
            return Response.json({ error: "No hours supplied" }, { status: 400 });
          }

          const ref = firestoreAdmin.collection("locations").doc(locationId);
          const snap = await ref.get();
          if (!snap.exists || snap.data()?.orgId !== caller.orgId) {
            return Response.json({ error: "Location not found" }, { status: 404 });
          }

          const existing = snap.data()!;
          const reporting = value.reportingTime ?? existing.reportingTime;
          const closing = value.closingTime ?? existing.closingTime;
          if (reporting && closing && reporting >= closing) {
            return Response.json({ error: "Closing time must be after reporting time" }, { status: 400 });
          }

          await ref.set({ ...value, updatedAt: new Date().toISOString() }, { merge: true });

          return Response.json({
            ok: true,
            reportingTime: reporting ?? null,
            closingTime: closing ?? null,
            checkoutWindowMinutes:
              value.checkoutWindowMinutes ??
              existing.checkoutWindowMinutes ??
              DEFAULT_CHECKOUT_WINDOW_MINUTES,
          });
        } catch (err: any) {
          console.error("PATCH /api/locations error:", err);
          return Response.json({ error: "Failed to update location hours" }, { status: 500 });
        }
      },
    },
  },
});
