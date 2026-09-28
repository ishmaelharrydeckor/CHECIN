import { createFileRoute } from "@tanstack/react-router";
import {
  firestoreAdmin,
  verifyCallerToken,
  setStaffRoleClaims,
  getAuthAdmin,
} from "@/integrations/firebase/admin.server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/auth/register-org")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Rate-limit unauthenticated/new org creations
          const rate = await checkRateLimit(`register_org_${clientIpFrom(request)}`, {
            limit: 10,
            windowMs: 15 * 60 * 1000,
          });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many attempts. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const body = await request.json();
          const orgName = (body?.orgName || "").trim();
          const timezone = (body?.timezone || "UTC").trim();
          const email = (body?.email || "").trim().toLowerCase();
          const password = body?.password || "";

          if (!orgName || orgName.length < 2) {
            return Response.json(
              { error: "Organization name must be at least 2 characters long" },
              { status: 400 },
            );
          }

          const caller = await verifyCallerToken(request.headers.get("authorization"));
          const auth = getAuthAdmin();

          let userUid: string;
          let userEmail: string;
          let userDisplayName: string;
          let customToken: string | null = null;

          if (caller) {
            userUid = caller.uid;
            userEmail = caller.email || email;
            userDisplayName = caller.name || caller.email?.split("@")[0] || "Org Admin";

            // If caller already has an orgId claim, prevent overwriting
            if (caller.orgId) {
              return Response.json(
                { error: "This account is already associated with an organization" },
                { status: 400 },
              );
            }
          } else {
            // Direct email/password registration
            if (!email || !email.includes("@")) {
              return Response.json(
                { error: "A valid corporate email address is required to register." },
                { status: 400 },
              );
            }

            try {
              const existing = await auth.getUserByEmail(email);
              userUid = existing.uid;
              userEmail = existing.email || email;
              userDisplayName = existing.displayName || email.split("@")[0];
            } catch {
              const created = await auth.createUser({
                email,
                password: password && password.length >= 6 ? password : "ChecIN" + Math.random().toString(36).slice(-8),
                displayName: email.split("@")[0],
                emailVerified: true,
              });
              userUid = created.uid;
              userEmail = created.email || email;
              userDisplayName = created.displayName || email.split("@")[0];
            }
          }

          // Create organizations document (AGENTS.md Data Model)
          const orgRef = firestoreAdmin.collection("organizations").doc();
          const orgId = orgRef.id;

          await orgRef.set({
            name: orgName,
            plan: "growth", // Default 14-day trial
            timezone,
            createdAt: new Date().toISOString(),
            createdById: userUid,
          });

          // Set custom claims: { role: "org_admin", orgId }
          await setStaffRoleClaims(userUid, "org_admin", orgId);

          // Mint custom token so the client can log in immediately
          customToken = await auth.createCustomToken(userUid, {
            role: "org_admin",
            orgId,
          });

          // Sync user display doc (display fields only - NEVER a role field per AGENTS.md)
          await firestoreAdmin.collection("users").doc(userUid).set(
            {
              displayName: userDisplayName,
              email: userEmail,
              orgId,
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );

          return Response.json({
            ok: true,
            orgId,
            orgName,
            role: "org_admin",
            customToken,
          });
        } catch (err) {
          console.error("register-org error:", err);
          return Response.json({ error: "Failed to register organization" }, { status: 500 });
        }
      },
    },
  },
});
