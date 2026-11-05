import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { buildDepartmentList } from "@/lib/departments";
import { loadOrgDepartments } from "@/lib/org-departments.server";

/**
 * The organization's department list.
 *  GET: org admins and managers read it (managers need it to invite and move their team).
 *  PUT: org admins replace it. A department someone is still in cannot be removed.
 * Who is calling and which organization comes from the verified token only.
 */
export const Route = createFileRoute("/api/organization/departments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller?.uid) return Response.json({ error: "Not authenticated" }, { status: 401 });
          const orgId = caller.orgId as string | undefined;
          if (!orgId || (caller.role !== "org_admin" && caller.role !== "manager")) {
            return Response.json({ error: "Only an organization admin or manager can see departments" }, { status: 403 });
          }
          const departments = await loadOrgDepartments(orgId);
          return Response.json({ ok: true, departments });
        } catch (err) {
          console.error("Load departments error:", err);
          return Response.json({ error: "Could not load the departments" }, { status: 500 });
        }
      },

      PUT: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller?.uid) return Response.json({ error: "Not authenticated" }, { status: 401 });
          const orgId = caller.orgId as string | undefined;
          if (!orgId || caller.role !== "org_admin") {
            return Response.json({ error: "Only an organization admin can change the departments" }, { status: 403 });
          }

          const rate = await checkRateLimit(`departments_${caller.uid}`, { limit: 30, windowMs: 60 * 60 * 1000 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const body = await request.json().catch(() => null);
          const built = buildDepartmentList(body?.departments);
          if (!built.ok) return Response.json({ error: built.error }, { status: 400 });

          // A department someone is still in cannot go: they would be left with a name that is no
          // longer on the list. The admin moves them first.
          const before = await loadOrgDepartments(orgId);
          const keep = new Set(built.list.map((d) => d.toLowerCase()));
          const removed = before.filter((d) => !keep.has(d.toLowerCase()));
          const inUse = await Promise.all(
            removed.map(async (name) => {
              const snap = await firestoreAdmin
                .collection("users")
                .where("orgId", "==", orgId)
                .where("department", "==", name)
                .limit(1)
                .get();
              return snap.empty ? null : name;
            }),
          );
          const blocked = inUse.filter((n): n is string => n !== null);
          if (blocked.length > 0) {
            return Response.json(
              {
                error:
                  blocked.length === 1
                    ? `"${blocked[0]}" still has people in it. Move them to another department first.`
                    : `${blocked.map((n) => `"${n}"`).join(", ")} still have people in them. Move them to another department first.`,
              },
              { status: 409 },
            );
          }

          await firestoreAdmin
            .collection("organizations")
            .doc(orgId)
            .set({ departments: built.list, updatedAt: new Date().toISOString() }, { merge: true });

          logEvent({
            action: "departments.update",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { count: built.list.length },
          });
          return Response.json({ ok: true, departments: built.list });
        } catch (err) {
          console.error("Update departments error:", err);
          return Response.json({ error: "Could not save the departments" }, { status: 500 });
        }
      },
    },
  },
});
