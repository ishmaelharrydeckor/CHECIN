import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "crypto";
import {
  firestoreAdmin,
  verifyCallerToken,
  setStaffRoleClaims,
  resolveTargetInScope,
  getAuthAdmin,
} from "@/integrations/firebase/admin.server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import type { CorporateRole } from "@/lib/auth-claims";

const INVITE_TTL_DAYS = 14;

interface CallerContext {
  uid: string;
  email: string | null;
  role: CorporateRole;
  orgId: string;
  managerId: string | null;
}

async function requireStaffLead(request: Request): Promise<CallerContext | Response> {
  const caller = await verifyCallerToken(request.headers.get("authorization"));

  if (!caller) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let role = (caller.role as CorporateRole | undefined) ?? null;
  let orgId = (caller.orgId as string | undefined) ?? null;
  let managerId = (caller.managerId as string | undefined) ?? null;

  // Fallback: If custom claims in ID token are not yet refreshed on client
  if (!orgId || !role) {
    try {
      const userDoc = await firestoreAdmin.collection("users").doc(caller.uid).get();
      if (userDoc.exists) {
        const udata = userDoc.data();
        if (udata?.orgId) {
          orgId = udata.orgId;
          const orgDoc = await firestoreAdmin.collection("organizations").doc(udata.orgId).get();
          if (orgDoc.exists) {
            const odata = orgDoc.data();
            if (odata?.createdById === caller.uid) {
              role = "org_admin";
              managerId = caller.uid;
              setStaffRoleClaims(caller.uid, "org_admin", udata.orgId, caller.uid).catch(console.error);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not check fallback user doc:", e);
    }
  }

  if (!orgId || (role !== "org_admin" && role !== "manager")) {
    return Response.json(
      { error: "Only an organization admin or manager can manage invitations" },
      { status: 403 },
    );
  }
  return { uid: caller.uid, email: caller.email ?? null, role, orgId, managerId };
}

export const Route = createFileRoute("/api/admin/staff-invites")({
  server: {
    handlers: {
      /** List pending invites and active members in this org/team OR verify single invite token publicly. */
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");

        // Public Token Lookup (Unauthenticated is explicitly allowed for invited recipients)
        if (token) {
          // Unauthenticated, so throttled like every other public route.
          const lookupRate = await checkRateLimit(`staff_lookup_${clientIpFrom(request)}`, {
            limit: 60,
            failClosed: true,
          });
          if (!lookupRate.allowed) {
            return Response.json(
              { error: `Too many attempts. Please wait ${lookupRate.retryAfterMinutes} minute(s).` },
              { status: 429 },
            );
          }
          try {
            const inviteRef = firestoreAdmin.collection("staff_invites").doc(token);
            const snap = await inviteRef.get();
            if (!snap.exists) {
              return Response.json({ error: "Invalid invitation link" }, { status: 404 });
            }
            const data = snap.data()!;
            if (data.status !== "pending") {
              return Response.json(
                { error: `This invitation has already been ${data.status}` },
                { status: 410 },
              );
            }
            if (new Date(data.expiresAt).getTime() < Date.now()) {
              return Response.json(
                { error: "This invitation has expired. Please ask your administrator for a new invite." },
                { status: 410 },
              );
            }

            let orgName = "Your Organization";
            try {
              const orgDoc = await firestoreAdmin.collection("organizations").doc(data.orgId).get();
              if (orgDoc.exists && orgDoc.data()?.name) {
                orgName = orgDoc.data()!.name;
              }
            } catch (e) {
              console.warn("Could not load org name for invite:", e);
            }

            // Check if invited email already has an existing account in Firebase Auth
            let hasExistingAccount = false;
            try {
              const auth = getAuthAdmin();
              await auth.getUserByEmail(data.email.toLowerCase());
              hasExistingAccount = true;
            } catch {
              hasExistingAccount = false;
            }

            return Response.json({
              ok: true,
              invite: {
                email: data.email,
                role: data.role,
                orgId: data.orgId,
                orgName,
                expiresAt: data.expiresAt,
                hasExistingAccount,
              },
            });
          } catch (err) {
            console.error("Invite token check error:", err);
            return Response.json({ error: "Could not verify invitation token" }, { status: 500 });
          }
        }

        const ctx = await requireStaffLead(request);
        if (ctx instanceof Response) return ctx;

        try {
          let query = firestoreAdmin.collection("staff_invites").where("orgId", "==", ctx.orgId);
          if (ctx.role === "manager") {
            query = query.where("managerId", "==", ctx.uid);
          }

          // Listing cap: an org with more invites than this sees the first page only (paging comes with the team screen).
          const invitesSnap = await query.limit(500).get();
          const now = Date.now();
          const invites = invitesSnap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                email: data.email,
                role: data.role,
                status: data.status,
                createdAt: data.createdAt,
                expiresAt: data.expiresAt,
                expired: data.status === "pending" && new Date(data.expiresAt).getTime() < now,
              };
            })
            .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

          // Fetch registered users in this org (scoped to team if caller is manager)
          let usersQuery = firestoreAdmin
            .collection("users")
            .where("orgId", "==", ctx.orgId);

          if (ctx.role === "manager") {
            usersQuery = usersQuery.where("managerId", "==", ctx.uid);
          }

          const usersSnap = await usersQuery.limit(2000).get();

          const members = usersSnap.docs.map((d) => {
            const data = d.data();
            return {
              uid: d.id,
              displayName: data.displayName || "Staff Member",
              email: data.email || "",
              photoURL: data.photoURL || null,
              role: data.role || "member",
              department: data.department || (data.role === "org_admin" ? "Leadership" : data.role === "manager" ? "Management" : "Operations"),
            };
          });

          const totalHeadcount = Math.max(1, members.length);

          return Response.json({
            ok: true,
            totalHeadcount,
            members,
            invites,
          });
        } catch (err) {
          console.error("Staff invite listing error:", err);
          return Response.json({ error: "Could not load staff invites" }, { status: 500 });
        }
      },

      /** Create an invite for a manager or employee email address with strict security guards. */
      POST: async ({ request }) => {
        const ctx = await requireStaffLead(request);
        if (ctx instanceof Response) return ctx;

        try {
          const body = await request.json();
          const email = (body?.email || "").trim().toLowerCase();
          const role: CorporateRole = body?.role === "manager" ? "manager" : "employee";
          let assignedManagerId: string | null = null;

          if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            return Response.json({ error: "A valid corporate email address is required" }, { status: 400 });
          }

          const auth = getAuthAdmin();

          // 1. Guard against self-invite
          let callerEmail = ctx.email;
          if (!callerEmail) {
            try {
              const callerUser = await auth.getUser(ctx.uid);
              callerEmail = callerUser.email?.toLowerCase() || null;
            } catch {
              // ignore
            }
          }
          if (callerEmail && email === callerEmail.toLowerCase()) {
            return Response.json(
              { error: "You cannot invite yourself to your own organization." },
              { status: 400 },
            );
          }

          // 2. Guard against inviting an already active member in this organization
          const memberSnap = await firestoreAdmin
            .collection("users")
            .where("orgId", "==", ctx.orgId)
            .where("email", "==", email)
            .limit(1)
            .get();

          if (!memberSnap.empty) {
            return Response.json(
              { error: "This email address is already an active member of your organization." },
              { status: 400 },
            );
          }

          // 3. Guard against duplicate active pending invites for this email in this org
          const activeInvitesSnap = await firestoreAdmin
            .collection("staff_invites")
            .where("orgId", "==", ctx.orgId)
            .where("email", "==", email)
            .where("status", "==", "pending")
            .limit(20)
            .get();

          const nowMs = Date.now();
          const hasActiveInvite = activeInvitesSnap.docs.some((d) => {
            const exp = d.data()?.expiresAt;
            return exp && new Date(exp).getTime() > nowMs;
          });

          if (hasActiveInvite) {
            return Response.json(
              { error: "An active invitation has already been issued to this email address." },
              { status: 400 },
            );
          }

          // 4. Guard against inviting someone who is already an org_admin in any organization
          try {
            const existingAuthUser = await auth.getUserByEmail(email);
            if (existingAuthUser?.customClaims?.role === "org_admin") {
              return Response.json(
                { error: "This user is already an Organization Administrator and cannot be invited as a staff member." },
                { status: 400 },
              );
            }
          } catch {
            // User does not exist in Auth yet, which is completely fine for new invites
          }

          if (ctx.role === "manager") {
            if (role !== "employee") {
              return Response.json(
                { error: "Managers may only invite employees to their team" },
                { status: 403 },
              );
            }
            assignedManagerId = ctx.uid;
          } else if (ctx.role === "org_admin") {
            if (role === "manager") {
              assignedManagerId = null; // Will be set to the user's own uid upon redemption
            } else {
              assignedManagerId = body?.managerId || ctx.uid;
              // An explicit team must be a real manager in the admin's own org
              if (assignedManagerId !== ctx.uid) {
                const mgr = await resolveTargetInScope(ctx, String(assignedManagerId));
                if (!mgr || mgr.role !== "manager") {
                  return Response.json(
                    { error: "The selected manager was not found in your organization" },
                    { status: 400 },
                  );
                }
              }
            }
          }

          const token = randomBytes(32).toString("hex");
          const now = new Date();
          const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

          await firestoreAdmin.collection("staff_invites").doc(token).set({
            token,
            email,
            role,
            orgId: ctx.orgId,
            managerId: assignedManagerId,
            invitedBy: ctx.uid,
            status: "pending",
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          });

          const url = new URL(request.url);
          const origin = request.headers.get("origin") || `${url.protocol}//${url.host}`;
          const inviteUrl = `${origin}/accept-invite/${token}`;

          return Response.json({
            ok: true,
            inviteUrl,
            invite: {
              email,
              role,
              token,
              expiresAt: expiresAt.toISOString(),
            },
          });
        } catch (err) {
          console.error("Staff invite creation error:", err);
          return Response.json({ error: "Could not create staff invite" }, { status: 500 });
        }
      },

      /** Redeem an invite token (single-use, bound to email, atomic transaction). */
      PUT: async ({ request }) => {
        try {
          const rate = await checkRateLimit(`staff_redeem_${clientIpFrom(request)}`, {
            limit: 15,
            failClosed: true,
          });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many attempts. Please wait ${rate.retryAfterMinutes} minute(s).` },
              { status: 429 },
            );
          }

          const body = await request.json();
          const token = (body?.token || "").trim();
          const fullName = (body?.fullName || "").trim();
          const department = String(body?.department || "General").trim().slice(0, 60) || "General";
          const password = (body?.password || "").trim();

          if (!token) {
            return Response.json({ error: "Invitation token is required" }, { status: 400 });
          }

          const auth = getAuthAdmin();
          const caller = await verifyCallerToken(request.headers.get("authorization"));

          // 1. Transactional read & atomic status validation
          const inviteRef = firestoreAdmin.collection("staff_invites").doc(token);

          let targetUid: string;
          let targetEmail: string;
          let targetDisplayName = fullName;
          let inviteRole: CorporateRole;
          let inviteOrgId: string;
          let assignedManagerId: string | null;

          const inviteData = await firestoreAdmin.runTransaction(async (t) => {
            const snap = await t.get(inviteRef);
            if (!snap.exists) {
              throw new Error("NOT_FOUND: This invitation is not valid");
            }
            const inv = snap.data()!;
            if (inv.status !== "pending") {
              throw new Error(`STATUS: This invitation has already been ${inv.status}`);
            }
            if (new Date(inv.expiresAt).getTime() < Date.now()) {
              t.update(inviteRef, { status: "expired" });
              throw new Error("EXPIRED: This invitation has expired. Please ask your administrator for a new invite.");
            }
            return inv;
          });

          targetEmail = inviteData.email.toLowerCase();
          inviteRole = inviteData.role;
          inviteOrgId = inviteData.orgId;
          assignedManagerId = inviteData.managerId || null;

          // 2. Check if user already exists in Firebase Auth
          let existingUser = null;
          try {
            existingUser = await auth.getUserByEmail(targetEmail);
          } catch {
            existingUser = null;
          }

          if (existingUser) {
            // Existing accounts MUST authenticate. Never overwrite passwords.
            if (!caller) {
              return Response.json(
                {
                  error: `An existing ChecIN account is registered to ${targetEmail}. Please sign in with your credentials to accept this invitation.`,
                  requiresSignIn: true,
                },
                { status: 401 },
              );
            }

            const callerUser = await auth.getUser(caller.uid);
            const callerEmail = (callerUser.email || "").trim().toLowerCase();
            if (callerEmail !== targetEmail) {
              return Response.json(
                {
                  error: `This invitation was issued to ${targetEmail}. You are currently signed in as ${callerEmail}.`,
                },
                { status: 403 },
              );
            }
            targetUid = caller.uid;
            targetDisplayName = fullName || callerUser.displayName || targetEmail.split("@")[0];
          } else {
            // Genuinely new user -> require secure password and create account
            if (!password || password.length < 6) {
              return Response.json(
                { error: "Please enter a secure password with at least 6 characters" },
                { status: 400 },
              );
            }
            targetDisplayName = fullName || targetEmail.split("@")[0];
            const createdUser = await auth.createUser({
              email: targetEmail,
              password,
              displayName: targetDisplayName,
              emailVerified: true,
            });
            targetUid = createdUser.uid;
          }

          // 3. Mark invite as redeemed atomically
          // Conditional claim: only one concurrent request can flip pending -> redeemed.
          const nowIso = new Date().toISOString();
          await firestoreAdmin.runTransaction(async (t) => {
            const fresh = await t.get(inviteRef);
            if (!fresh.exists || fresh.data()?.status !== "pending") {
              throw new Error("STATUS: This invitation has already been redeemed");
            }
            t.update(inviteRef, {
              status: "redeemed",
              redeemedUid: targetUid,
              redeemedAt: nowIso,
            });
          });

          // 4. Determine managerId and set custom claims
          const finalManagerId = inviteRole === "manager" ? targetUid : assignedManagerId;
          await setStaffRoleClaims(targetUid, inviteRole, inviteOrgId, finalManagerId);

          // 5. Sync user display doc (display fields only - NEVER a role field per AGENTS.md)
          await firestoreAdmin.collection("users").doc(targetUid).set(
            {
              displayName: targetDisplayName,
              email: targetEmail,
              department,
              photoURL: null,
              orgId: inviteOrgId,
              managerId: finalManagerId,
              updatedAt: nowIso,
            },
            { merge: true },
          );

          // 6. Mint custom token so the client browser can authenticate immediately
          const customToken = await auth.createCustomToken(targetUid, {
            role: inviteRole,
            orgId: inviteOrgId,
            managerId: finalManagerId,
          });

          logEvent({
            action: "invite.redeem",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId: inviteOrgId,
            uid: targetUid,
            fields: { role: inviteRole },
          });

          return Response.json({
            ok: true,
            role: inviteRole,
            orgId: inviteOrgId,
            managerId: finalManagerId,
            displayName: targetDisplayName,
            customToken,
          });
        } catch (err: any) {
          const msg = err?.message || "";
          if (msg.startsWith("NOT_FOUND:")) {
            return Response.json({ error: msg.replace("NOT_FOUND: ", "") }, { status: 404 });
          }
          if (msg.startsWith("STATUS:") || msg.startsWith("EXPIRED:")) {
            return Response.json({ error: msg.replace(/^(STATUS|EXPIRED): /, "") }, { status: 410 });
          }

          console.error("Staff invite redeem error:", err);
          return Response.json({ error: "Failed to redeem invitation" }, { status: 500 });
        }
      },
    },
  },
});
