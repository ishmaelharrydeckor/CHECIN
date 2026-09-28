import { createFileRoute } from "@tanstack/react-router";
import {
  getUserClaims,
  setStaffRoleClaims,
  verifyCallerToken,
} from "@/integrations/firebase/admin.server";
import type { CorporateRole } from "@/lib/auth-claims";

/**
 * ChecIN Role Management Endpoint
 *
 * Supported role transitions (AGENTS.md):
 *  - An org_admin may grant 'manager' or 'employee' within their own orgId.
 *  - A manager may grant 'employee' scoped to their own team (managerId == caller.uid) within their own orgId.
 *  - Cannot change one's own role through this endpoint.
 */
export const Route = createFileRoute("/api/admin/roles")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }

          const callerRole = (caller.role as CorporateRole | undefined) ?? null;
          const callerOrgId = (caller.orgId as string | undefined) ?? null;
          const callerUid = caller.uid;

          if (!callerOrgId || !callerRole) {
            return Response.json(
              { error: "Caller does not belong to an active organization" },
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

          if (role === "manager") {
            if (callerRole !== "org_admin") {
              return Response.json(
                { error: "Only an organization admin can appoint managers" },
                { status: 403 },
              );
            }
            // A manager owns their team: managerId is their own uid
            await setStaffRoleClaims(targetUid, "manager", callerOrgId, targetUid);
            return Response.json({ ok: true, targetUid, role, orgId: callerOrgId, managerId: targetUid });
          }

          if (role === "employee") {
            let managerIdForEmployee: string | null = null;
            if (callerRole === "manager") {
              managerIdForEmployee = callerUid;
            } else if (callerRole === "org_admin") {
              managerIdForEmployee = assignedManagerId ?? callerUid;
            } else {
              return Response.json(
                { error: "Not authorized to add employees" },
                { status: 403 },
              );
            }

            await setStaffRoleClaims(targetUid, "employee", callerOrgId, managerIdForEmployee);
            return Response.json({
              ok: true,
              targetUid,
              role,
              orgId: callerOrgId,
              managerId: managerIdForEmployee,
            });
          }

          return Response.json(
            { error: "org_admin roles cannot be granted through this endpoint" },
            { status: 403 },
          );
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
        const callerOrgId = (caller.orgId as string | undefined) ?? null;
        const uid = targetUid || caller.uid;

        const target = await getUserClaims(uid);
        if (uid !== caller.uid && target.orgId !== callerOrgId) {
          return Response.json({ error: "Not authorized to view this user" }, { status: 403 });
        }

        return Response.json(target);
      },
    },
  },
});
