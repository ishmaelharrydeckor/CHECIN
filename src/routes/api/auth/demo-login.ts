import { createFileRoute } from "@tanstack/react-router";
import {
  firestoreAdmin,
  getAuthAdmin,
  setStaffRoleClaims,
} from "@/integrations/firebase/admin.server";

export const Route = createFileRoute("/api/auth/demo-login")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const auth = getAuthAdmin();
          const demoEmail = "demo-admin@checin.app";
          const orgId = "org-checin-demo";

          let user;
          try {
            user = await auth.getUserByEmail(demoEmail);
          } catch {
            user = await auth.createUser({
              email: demoEmail,
              displayName: "Demo Organization Admin",
              emailVerified: true,
            });
          }

          // Ensure custom claims are active
          await setStaffRoleClaims(user.uid, "org_admin", orgId);

          // Ensure organization document exists
          await firestoreAdmin.collection("organizations").doc(orgId).set(
            {
              name: "Acme Innovations Ltd",
              plan: "growth",
              timezone: "Africa/Accra",
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );

          // Mint custom token
          const customToken = await auth.createCustomToken(user.uid, {
            role: "org_admin",
            orgId,
          });

          return Response.json({
            ok: true,
            customToken,
            user: {
              uid: user.uid,
              email: demoEmail,
              displayName: "Demo Organization Admin",
              orgId,
              role: "org_admin",
            },
          });
        } catch (err) {
          console.error("Demo login error:", err);
          return Response.json({ error: "Could not generate demo session" }, { status: 500 });
        }
      },
    },
  },
});
