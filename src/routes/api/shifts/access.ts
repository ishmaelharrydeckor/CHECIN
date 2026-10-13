import { createFileRoute } from "@tanstack/react-router";
import {
  firestoreAdmin,
  getAuthAdmin,
  getUserClaims,
  revokeUserSessions,
  verifyCallerToken,
} from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { setShiftAdminClaim } from "@/lib/shift-access.server";

interface ShiftManagerRow {
  uid: string;
  displayName: string;
  email: string;
  shiftAdmin: boolean;
}

/** Managers in one org. Roles live in claims, so they're read from Auth (not the users doc), 100 at a time. */
async function listOrgManagers(orgId: string, excludeUid: string): Promise<ShiftManagerRow[]> {
  const usersSnap = await firestoreAdmin
    .collection("users")
    .where("orgId", "==", orgId)
    .limit(500)
    .get();
  const docs = usersSnap.docs.filter((d) => d.id !== excludeUid);

  const managers: ShiftManagerRow[] = [];
  for (let i = 0; i < docs.length; i += 100) {
    const batch = docs.slice(i, i + 100);
    const result = await getAuthAdmin().getUsers(batch.map((d) => ({ uid: d.id })));
    for (const u of result.users) {
      const claims = u.customClaims ?? {};
      if (claims.role !== "manager" || claims.orgId !== orgId) continue;
      const data = batch.find((d) => d.id === u.uid)?.data();
      managers.push({
        uid: u.uid,
        displayName: data?.displayName || u.displayName || "Manager",
        email: u.email || data?.email || "",
        shiftAdmin: claims.shiftAdmin === true,
      });
    }
  }
  return managers;
}

/**
 * Lets an org admin decide which managers may create shifts and assign their own team.
 * The permission is a `shiftAdmin` custom claim, written only here with the Admin SDK.
 * Org admin only; the target must be a manager in the caller's own org.
 */
export const Route = createFileRoute("/api/shifts/access")({
  server: {
    handlers: {
      /** Managers in the caller's org and whether each may manage shifts. */
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });
          if (!caller?.orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (caller.role !== "org_admin") {
            return Response.json(
              { error: "Only an organization admin can view this" },
              { status: 403 },
            );
          }

          return Response.json({
            ok: true,
            managers: await listOrgManagers(caller.orgId, caller.uid),
          });
        } catch (err) {
          console.error("shifts-access GET error:", err);
          return Response.json({ error: "Could not load managers" }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });
          if (!caller?.orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (caller.role !== "org_admin") {
            return Response.json(
              { error: "Only an organization admin can allow managers to manage shifts" },
              { status: 403 },
            );
          }

          const rate = await checkRateLimit(`shifts_access_${caller.uid}`, {
            limit: 60,
            windowMs: 60 * 60 * 1000,
          });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const body = await request.json().catch(() => null);

          // Bulk: every manager currently in the caller's org (the org comes from the token)
          if (body?.all === true) {
            if (typeof body?.allowed !== "boolean") {
              return Response.json({ error: "allowed (true/false) is required" }, { status: 400 });
            }
            const managers = (await listOrgManagers(caller.orgId, caller.uid)).filter(
              (m) => m.shiftAdmin !== body.allowed,
            );
            for (const m of managers) {
              await setShiftAdminClaim(m.uid, body.allowed);
              await revokeUserSessions(m.uid);
            }
            logEvent({
              action: "shift.access_all",
              outcome: "ok",
              correlationId: correlationId(request),
              orgId: caller.orgId,
              uid: caller.uid,
              fields: { changed: managers.length, allowed: body.allowed },
            });
            return Response.json({ ok: true, allowed: body.allowed, changed: managers.length });
          }

          const targetUid = typeof body?.targetUid === "string" ? body.targetUid.trim() : "";
          if (!targetUid || typeof body?.allowed !== "boolean") {
            return Response.json(
              { error: "targetUid and allowed (true/false) are required" },
              { status: 400 },
            );
          }

          // Same 404 for "unknown", "other org" and "not a manager" so ids can't be probed
          let target;
          try {
            target = await getUserClaims(targetUid);
          } catch {
            target = null;
          }
          if (!target || target.orgId !== caller.orgId || target.role !== "manager") {
            return Response.json(
              { error: "Manager not found in your organization" },
              { status: 404 },
            );
          }

          await setShiftAdminClaim(targetUid, body.allowed);
          // Forces the manager's old token out so the change applies immediately
          await revokeUserSessions(targetUid);

          logEvent({
            action: "shift.access",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId: caller.orgId,
            uid: caller.uid,
            fields: { target: targetUid, allowed: body.allowed },
          });
          return Response.json({ ok: true, targetUid, allowed: body.allowed });
        } catch (err) {
          console.error("shifts-access POST error:", err);
          return Response.json({ error: "Could not update permission" }, { status: 500 });
        }
      },
    },
  },
});
