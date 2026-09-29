import { createFileRoute } from "@tanstack/react-router";
import {
  firestoreAdmin,
  verifyCallerToken,
} from "@/integrations/firebase/admin.server";

export const Route = createFileRoute("/api/organization/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          let orgId = caller.orgId as string | undefined;

          // Robust fallback if custom claims are settling
          if (!orgId && caller.uid) {
            try {
              const userDoc = await firestoreAdmin.collection("users").doc(caller.uid).get();
              if (userDoc.exists && userDoc.data()?.orgId) {
                orgId = userDoc.data()!.orgId;
              } else {
                const orgsSnap = await firestoreAdmin
                  .collection("organizations")
                  .where("createdById", "==", caller.uid)
                  .limit(1)
                  .get();
                if (!orgsSnap.empty) {
                  orgId = orgsSnap.docs[0].id;
                }
              }
            } catch (e) {
              console.warn("Could not resolve orgId fallback:", e);
            }
          }

          if (!orgId) {
            return Response.json({ error: "No organization associated with this account" }, { status: 404 });
          }

          const orgDoc = await firestoreAdmin.collection("organizations").doc(orgId).get();
          if (!orgDoc.exists) {
            return Response.json({
              ok: true,
              organization: {
                id: orgId,
                name: "My Organization",
                plan: "Growth (14-Day Trial)",
                timezone: "UTC",
                createdAt: new Date().toISOString(),
              },
            });
          }

          const data = orgDoc.data();
          return Response.json({
            ok: true,
            organization: {
              id: orgId,
              name: data?.name || "My Organization",
              plan: data?.plan ? `${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)} Plan` : "Growth Plan",
              timezone: data?.timezone || "UTC",
              createdAt: data?.createdAt || new Date().toISOString(),
            },
          });
        } catch (err) {
          console.error("Fetch organization error:", err);
          return Response.json({ error: "Could not fetch organization details" }, { status: 500 });
        }
      },

      PATCH: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.orgId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          if (caller.role !== "org_admin") {
            return Response.json({ error: "Only organization admins can update organization settings" }, { status: 403 });
          }

          const body = await request.json();
          const name = (body?.name || "").trim();
          const timezone = (body?.timezone || "").trim();

          const updates: Record<string, string> = {
            updatedAt: new Date().toISOString(),
          };

          if (name && name.length >= 2) updates.name = name;
          if (timezone) updates.timezone = timezone;

          await firestoreAdmin.collection("organizations").doc(caller.orgId).set(updates, { merge: true });

          return Response.json({ ok: true, name: updates.name, timezone: updates.timezone });
        } catch (err) {
          console.error("Update organization error:", err);
          return Response.json({ error: "Failed to update organization" }, { status: 500 });
        }
      },
    },
  },
});
