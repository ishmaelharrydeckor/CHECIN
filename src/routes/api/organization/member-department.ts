import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken, resolveTargetInScope } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { matchDepartment } from "@/lib/departments";
import { loadOrgDepartments } from "@/lib/org-departments.server";

/**
 * Move one person to a department from the organization's list.
 * An org admin can move anyone in the organization. A manager can move only the employees on their
 * own team. The person themselves can never change their own department. Who is calling and the
 * organization come from the verified token; the target is checked against Firebase Auth claims.
 */
export const Route = createFileRoute("/api/organization/member-department")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller?.uid) return Response.json({ error: "Not authenticated" }, { status: 401 });
          const orgId = caller.orgId as string | undefined;
          if (!orgId || (caller.role !== "org_admin" && caller.role !== "manager")) {
            return Response.json({ error: "Only an organization admin or manager can change a department" }, { status: 403 });
          }

          const rate = await checkRateLimit(`member_department_${caller.uid}`, { limit: 120, windowMs: 60 * 60 * 1000 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const body = await request.json().catch(() => null);
          const targetUid = String(body?.uid || "").trim();
          if (!targetUid) return Response.json({ error: "Choose a person." }, { status: 400 });

          const target = await resolveTargetInScope(caller, targetUid);
          if (!target) {
            return Response.json({ error: "That person was not found in your team." }, { status: 404 });
          }
          // Managers move employees. Moving a manager or an admin is the admin's call.
          if (caller.role === "manager" && target.role !== "employee") {
            return Response.json({ error: "Only an organization admin can change a manager's department." }, { status: 403 });
          }

          const list = await loadOrgDepartments(orgId);
          const department = matchDepartment(list, body?.department);
          if (!department) {
            return Response.json({ error: "Please choose a department from your list." }, { status: 400 });
          }

          await firestoreAdmin
            .collection("users")
            .doc(targetUid)
            .set({ department, updatedAt: new Date().toISOString() }, { merge: true });

          logEvent({
            action: "member.department",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { target: targetUid },
          });
          return Response.json({ ok: true, department });
        } catch (err) {
          console.error("Member department error:", err);
          return Response.json({ error: "Could not change the department" }, { status: 500 });
        }
      },
    },
  },
});
