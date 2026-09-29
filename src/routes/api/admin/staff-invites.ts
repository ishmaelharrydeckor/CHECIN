import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "crypto";
import {
  firestoreAdmin,
  verifyCallerToken,
  setStaffRoleClaims,
  getAuthAdmin,
} from "@/integrations/firebase/admin.server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit.server";
import type { CorporateRole } from "@/lib/auth-claims";

const INVITE_TTL_DAYS = 14;

interface CallerContext {
  uid: string;
  role: CorporateRole;
  orgId: string;
  managerId: string | null;
}

async function requireStaffLead(request: Request): Promise<CallerContext | Response> {
  const url = new URL(request.url);
  const isDemo = url.searchParams.get("demo") === "true";
  const caller = await verifyCallerToken(request.headers.get("authorization"));

  if (!caller) {
    if (isDemo) {
      return {
        uid: "demo-manager-uid",
        role: "org_admin",
        orgId: "org-checin-demo",
        managerId: "demo-manager-uid",
      };
    }
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

  if (isDemo && (!orgId || !role)) {
    return {
      uid: caller.uid || "demo-manager-uid",
      role: "org_admin",
      orgId: "org-checin-demo",
      managerId: caller.uid || "demo-manager-uid",
    };
  }

  if (!orgId || (role !== "org_admin" && role !== "manager")) {
    return Response.json(
      { error: "Only an organization admin or manager can manage invitations" },
      { status: 403 },
    );
  }
  return { uid: caller.uid, role, orgId, managerId };
}

export const Route = createFileRoute("/api/admin/staff-invites")({
  server: {
    handlers: {
      /** List pending invites and active members in this org/team. */
      GET: async ({ request }) => {
        const ctx = await requireStaffLead(request);
        if (ctx instanceof Response) return ctx;

        try {
          if (ctx.orgId === "org-checin-demo") {
            return Response.json({
              ok: true,
              totalHeadcount: 40,
              members: [
                { uid: "m-1", displayName: "Kofi Manu", email: "kofi.manu@company.com", role: "employee" },
                { uid: "m-2", displayName: "Ama Mensah", email: "ama.mensah@company.com", role: "employee" },
                { uid: "m-3", displayName: "Kwesi Appiah", email: "kwesi.appiah@company.com", role: "employee" },
                { uid: "m-4", displayName: "Sarah Jenkins", email: "sarah.j@company.com", role: "manager" },
              ],
              invites: [],
            });
          }

          let query = firestoreAdmin.collection("staff_invites").where("orgId", "==", ctx.orgId);
          if (ctx.role === "manager") {
            query = query.where("managerId", "==", ctx.uid);
          }

          const invitesSnap = await query.get();
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

          // Fetch registered users in this org
          const usersSnap = await firestoreAdmin
            .collection("users")
            .where("orgId", "==", ctx.orgId)
            .get();

          const members = usersSnap.docs.map((d) => {
            const data = d.data();
            return {
              uid: d.id,
              displayName: data.displayName || "Staff Member",
              email: data.email || "",
              photoURL: data.photoURL || null,
              role: data.role || "member",
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

      /** Create an invite for a manager or employee email address. */
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

      /** Redeem an invite token (single-use, bound to email). */
      PUT: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller) {
            return Response.json(
              { error: "Please sign in before accepting the invitation" },
              { status: 401 },
            );
          }

          const rate = await checkRateLimit(`staff_redeem_${clientIpFrom(request)}`, { limit: 10 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many attempts. Please wait ${rate.retryAfterMinutes} minute(s).` },
              { status: 429 },
            );
          }

          const body = await request.json();
          const token = (body?.token || "").trim();
          if (!token) {
            return Response.json({ error: "Invitation token is required" }, { status: 400 });
          }

          const inviteRef = firestoreAdmin.collection("staff_invites").doc(token);
          const inviteSnap = await inviteRef.get();
          if (!inviteSnap.exists) {
            return Response.json({ error: "This invitation is not valid" }, { status: 404 });
          }

          const invite = inviteSnap.data() as any;

          if (invite.status !== "pending") {
            return Response.json(
              { error: `This invitation has already been ${invite.status}` },
              { status: 410 },
            );
          }

          if (new Date(invite.expiresAt).getTime() < Date.now()) {
            await inviteRef.update({ status: "expired" });
            return Response.json(
              { error: "This invitation has expired. Please ask for a new invite." },
              { status: 410 },
            );
          }

          // Email binding invariant (AGENTS.md)
          const callerUser = await getAuthAdmin().getUser(caller.uid);
          const callerEmail = (callerUser.email || "").trim().toLowerCase();
          if (!callerEmail || callerEmail !== invite.email.toLowerCase()) {
            return Response.json(
              {
                error: `This invitation was issued to ${invite.email}. Please sign in with that exact address.`,
              },
              { status: 403 },
            );
          }

          // Mint custom claims
          const managerId =
            invite.role === "manager" ? caller.uid : invite.managerId || null;

          await setStaffRoleClaims(caller.uid, invite.role, invite.orgId, managerId);

          const now = new Date().toISOString();
          await inviteRef.update({
            status: "redeemed",
            redeemedUid: caller.uid,
            redeemedAt: now,
          });

          // Sync user display doc (display fields only)
          await firestoreAdmin.collection("users").doc(caller.uid).set(
            {
              displayName: callerUser.displayName || callerEmail.split("@")[0],
              email: callerEmail,
              photoURL: callerUser.photoURL || null,
              orgId: invite.orgId,
              updatedAt: now,
            },
            { merge: true },
          );

          return Response.json({
            ok: true,
            role: invite.role,
            orgId: invite.orgId,
            managerId,
          });
        } catch (err) {
          console.error("Staff invite redeem error:", err);
          return Response.json({ error: "Failed to redeem invitation" }, { status: 500 });
        }
      },
    },
  },
});
