import { createFileRoute } from "@tanstack/react-router";
import {
  firestoreAdmin,
  verifyCallerToken,
  setStaffRoleClaims,
  getAuthAdmin,
} from "@/integrations/firebase/admin.server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { isValidZone } from "@/lib/timezone-options";
import { buildDepartmentList, DEFAULT_DEPARTMENT } from "@/lib/departments";
import { trialEndsAtFrom } from "@/lib/plans";

export const Route = createFileRoute("/api/auth/register-org")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Rate-limit unauthenticated/new org creations
          const rate = await checkRateLimit(`register_org_${clientIpFrom(request)}`, {
            limit: 10,
            windowMs: 15 * 60 * 1000,
            failClosed: true,
          });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many attempts. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const body = await request.json();
          const orgName = (body?.orgName || "").trim();
          // No timezone sent means UTC. One that is sent but not recognised is refused, not quietly
          // replaced: a wrong timezone makes late flags and daily totals wrong without anyone noticing.
          const timezone = String(body?.timezone || "UTC").trim();
          if (!isValidZone(timezone)) {
            return Response.json(
              { error: "Please choose your timezone from the list." },
              { status: 400 },
            );
          }
          // Departments are optional at sign-up. Sent but invalid (too long, too many) is refused,
          // not cut. Not sent means just "General"; the admin can add more later.
          let departments: string[] = [DEFAULT_DEPARTMENT];
          if (body?.departments !== undefined && body?.departments !== null) {
            const built = buildDepartmentList(body.departments);
            if (!built.ok) return Response.json({ error: built.error }, { status: 400 });
            departments = built.list;
          }
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
              await auth.getUserByEmail(email);
              return Response.json(
                {
                  error:
                    "An account with this email address already exists. Please sign in first before registering an organization.",
                },
                { status: 409 },
              );
            } catch {
              if (!password || password.length < 6) {
                return Response.json(
                  { error: "A secure password with at least 6 characters is required." },
                  { status: 400 },
                );
              }
              const created = await auth.createUser({
                email,
                password,
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
            plan: "growth", // the plan the trial is a trial of
            // When the free trial ends. Organizations created before this field have no end date and keep every
            // feature (src/lib/plans.ts). Nothing enforces it until PLAN_ENFORCEMENT is switched on.
            trialEndsAt: trialEndsAtFrom(Date.now()),
            timezone,
            // A timezone chosen at sign-up was chosen on purpose; only the default UTC still needs confirming.
            timezoneConfirmed: Boolean(String(body?.timezone || "").trim()),
            departments,
            region: "nam5", // where this org's data lives; every org has one value today
            schemaVersion: 1,
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

          logEvent({
            action: "org.register",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: userUid,
          });

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
