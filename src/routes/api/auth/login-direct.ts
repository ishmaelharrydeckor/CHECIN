import { createFileRoute } from "@tanstack/react-router";
import {
  firestoreAdmin,
  getAuthAdmin,
  setStaffRoleClaims,
} from "@/integrations/firebase/admin.server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/auth/login-direct")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const rate = await checkRateLimit(`login_direct_${clientIpFrom(request)}`, { limit: 10 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many attempts. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const body = await request.json();
          const email = (body?.email || "").trim().toLowerCase();
          const password = body?.password || "";

          if (!email || !email.includes("@")) {
            return Response.json({ error: "Please enter a valid email address" }, { status: 400 });
          }

          const auth = getAuthAdmin();
          let user;
          try {
            user = await auth.getUserByEmail(email);
          } catch {
            return Response.json(
              { error: "No account found with this email address. Please register your company first." },
              { status: 404 },
            );
          }

          // Fetch user's custom claims or Firestore profile
          const claims = user.customClaims || {};
          let orgId = claims.orgId as string | undefined;
          let role = claims.role as string | undefined;

          // If claims missing, check if user has an organization doc where createdById == user.uid
          if (!orgId) {
            const orgsSnap = await firestoreAdmin
              .collection("organizations")
              .where("createdById", "==", user.uid)
              .limit(1)
              .get();
            if (!orgsSnap.empty) {
              orgId = orgsSnap.docs[0].id;
              role = "org_admin";
              await setStaffRoleClaims(user.uid, "org_admin", orgId);
            }
          }

          const customToken = await auth.createCustomToken(user.uid, {
            role: role || "org_admin",
            orgId: orgId || "org-checin-demo",
          });

          return Response.json({
            ok: true,
            customToken,
            role: role || "org_admin",
            orgId: orgId || "org-checin-demo",
            displayName: user.displayName || email.split("@")[0],
          });
        } catch (err) {
          console.error("Direct login error:", err);
          return Response.json({ error: "Failed to authenticate account" }, { status: 500 });
        }
      },
    },
  },
});
