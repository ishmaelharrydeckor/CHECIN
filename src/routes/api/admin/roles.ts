import { createFileRoute } from "@tanstack/react-router";
import {
  getUserClaims,
  resolveTargetInScope,
  revokeUserSessions,
  setStaffRoleClaims,
  verifyCallerToken,
} from "@/integrations/firebase/admin.server";
import type { CorporateRole } from "@/lib/auth-claims";

/**
 * ChecIN Role Management Endpoint
 *
 * The target user is always resolved from Firebase Auth claims and must be in
 * the caller's scope BEFORE any change is made:
 *  - An org_admin may grant 'manager' or 'employee' to users in their own orgId.
 *    Org admins can never be changed through this endpoint.
 *  - A manager may only set 'employee' on a user already on their own team.
 *    A manager can never modify another manager or an admin.
 *  - Cannot change one's own role through this endpoint.
 */
export const Route = createFileRoute("/api/admin/roles")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });
          if (!caller) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }

          const callerRole = (caller.role as CorporateRole | undefined) ?? null;
          const callerOrgId = (caller.orgId as string | undefined) ?? null;
          const callerUid = caller.uid;

          if (!callerOrgId || (callerRole !== "org_admin" && callerRole !== "manager")) {
            return Response.json(
              { error: "Only an organization admin or manager can change roles" },
              { status: 403 },
            );
          }

          const body = await request.json();
          const targetUid: string | undefined = body?.targetUid;
          const role: CorporateRole | undefined = body?.role;
          const assignedManagerId: string | undefined = body?.managerId;

          if (!targetUid || !role) {
            return Response.json({ error: "targetUid and role are required" }, { status: 400 });
          }
          if (targetUid === callerUid) {
            return Response.json({ error: "Cannot change your own role" }, { status: 403 });
          }
          if (role !== "manager" && role !== "employee") {
            return Response.json(
              { error: "org_admin roles cannot be granted through this endpoint" },
              { status: 403 },
            );
          }

          // Scope check: the target must exist, be in the caller's org (and team, for managers).
          // Same 404 for "unknown" and "other org" so ids can't be probed across tenants.
          const target = await resolveTargetInScope(caller, targetUid);
          if (!target) {
            return Response.json({ error: "User not found in your organization" }, { status: 404 });
          }
          if (target.role === "org_admin") {
            return Response.json(
              { error: "Organization admins cannot be changed through this endpoint" },
              { status: 403 },
            );
          }

          if (role === "manager") {
            if (callerRole !== "org_admin") {
              return Response.json(
                { error: "Only an organization admin can appoint managers" },
                { status: 403 },
              );
            }
            // A manager owns their team: managerId is their own uid
            await setStaffRoleClaims(targetUid, "manager", callerOrgId, targetUid);
            await revokeUserSessions(targetUid);
            return Response.json({ ok: true, targetUid, role, orgId: callerOrgId, managerId: targetUid });
          }

          // role === "employee"
          let managerIdForEmployee: string;
          if (callerRole === "manager") {
            managerIdForEmployee = callerUid;
          } else {
            managerIdForEmployee = assignedManagerId ?? callerUid;
            if (managerIdForEmployee !== callerUid) {
              // Must be a real manager in the same org (claims, not the client-writable users doc)
              const mgr = await resolveTargetInScope(caller, managerIdForEmployee);
              if (!mgr || mgr.role !== "manager") {
                return Response.json(
                  { error: "The assigned manager was not found in your organization" },
                  { status: 400 },
                );
              }
            }
          }

          await setStaffRoleClaims(targetUid, "employee", callerOrgId, managerIdForEmployee);
          await revokeUserSessions(targetUid);
          return Response.json({
            ok: true,
            targetUid,
            role,
            orgId: callerOrgId,
            managerId: managerIdForEmployee,
          });
        } catch (err) {
          console.error("roles endpoint error:", err);
          return Response.json({ error: "Internal error" }, { status: 500 });
        }
      },

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const targetUid = url.searchParams.get("uid");
        const caller = await verifyCallerToken(request.headers.get("authorization"));
        if (!caller) {
          return Response.json({ error: "Not authenticated" }, { status: 401 });
        }
        const uid = targetUid || caller.uid;

        if (uid === caller.uid) {
          return Response.json(await getUserClaims(uid));
        }

        // Looking up someone else: org admins (org-wide) and managers (own team) only
        const target = await resolveTargetInScope(caller, uid);
        if (!target) {
          return Response.json({ error: "Not authorized to view this user" }, { status: 403 });
        }
        return Response.json(target);
      },
    },
  },
});
