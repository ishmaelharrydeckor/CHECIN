import { createFileRoute } from "@tanstack/react-router";
import {
  firestoreAdmin,
  verifyCallerToken,
  resolveTargetInScope,
  revokeUserSessions,
  setStaffRoleClaims,
} from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { MAX_FUTURE_SHIFTS_MOVED, MAX_PENDING_LEAVE_MOVED, planManagerMove } from "@/lib/manager-change";
import { dayKey } from "@/lib/attendance-day";

/**
 * Move an employee to another manager (design: docs/MANAGER-CHANGE-DESIGN.md).
 *
 * Org admins only. In one action it keeps everything that says "who manages this person" in step:
 *  1. the login permissions (the claims decide who their next scan is filed under),
 *  2. the roster copy on their profile,
 *  3. their pending leave requests (decided ones are history and stay as they are),
 *     and their shift assignments from today onwards (past ones are history and stay),
 *  4. one history record in `team_changes` (written by the server only).
 * Past check-ins and daily summaries are never touched: they keep the manager they were written with.
 * Who is calling and which organization both come from the verified token; the person and the new
 * manager are read from Firebase Auth claims, never from the client.
 */
export const Route = createFileRoute("/api/organization/member-manager")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          if (!caller?.uid) return Response.json({ error: "Not authenticated" }, { status: 401 });
          const orgId = caller.orgId as string | undefined;
          if (!orgId || caller.role !== "org_admin") {
            return Response.json({ error: "Only an organization admin can move people between teams." }, { status: 403 });
          }

          const rate = await checkRateLimit(`member_manager_${caller.uid}`, { limit: 60, windowMs: 60 * 60 * 1000 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const body = await request.json().catch(() => null);
          const targetUid = String(body?.uid || "").trim();
          const newManagerUid = String(body?.managerId || "").trim();

          const [target, newManager] = await Promise.all([
            targetUid ? resolveTargetInScope(caller, targetUid) : null,
            newManagerUid ? resolveTargetInScope(caller, newManagerUid) : null,
          ]);
          const decision = planManagerMove({ callerOrgId: orgId, targetUid, target, newManagerUid, newManager });
          if (!decision.ok) return Response.json({ error: decision.error }, { status: decision.status });

          // Pending leave moves with the person. Refuse before changing anything if there is too much.
          const pending = await firestoreAdmin
            .collection("leave_requests")
            .where("orgId", "==", orgId)
            .where("employeeId", "==", targetUid)
            .where("status", "==", "pending")
            .limit(MAX_PENDING_LEAVE_MOVED + 1)
            .get();
          if (pending.size > MAX_PENDING_LEAVE_MOVED) {
            return Response.json(
              {
                error: `This person has more than ${MAX_PENDING_LEAVE_MOVED} pending leave requests. Ask their manager to decide some of them first.`,
              },
              { status: 409 },
            );
          }

          // Shifts from today onwards follow the person, so the new manager's rota and dashboard see them
          // (each assignment carries a copy of the manager). Past shifts stay with the manager they had.
          const orgSnap = await firestoreAdmin.collection("organizations").doc(orgId).get();
          const rawTz = orgSnap.exists ? orgSnap.data()?.timezone : undefined;
          const tz = typeof rawTz === "string" && rawTz.trim().length > 0 ? rawTz.trim() : "UTC";
          const today = dayKey(Date.now(), tz) ?? new Date().toISOString().slice(0, 10);
          const futureShifts = await firestoreAdmin
            .collection("shift_assignments")
            .where("orgId", "==", orgId)
            .where("employeeId", "==", targetUid)
            .where("dayKey", ">=", today)
            .limit(MAX_FUTURE_SHIFTS_MOVED + 1)
            .get();
          if (futureShifts.size > MAX_FUTURE_SHIFTS_MOVED) {
            return Response.json(
              {
                error: `This person has more than ${MAX_FUTURE_SHIFTS_MOVED} shifts planned. Clear some of their future shifts first, then move them.`,
              },
              { status: 409 },
            );
          }

          const fromManagerId = target!.managerId;
          const now = new Date().toISOString();

          // The claims decide who the next scan is filed under, so they go first. If the records
          // below then fail, the claims are put back and nothing has changed.
          await setStaffRoleClaims(targetUid, "employee", orgId, newManagerUid);
          try {
            const batch = firestoreAdmin.batch();
            batch.set(
              firestoreAdmin.collection("users").doc(targetUid),
              { managerId: newManagerUid, managerChangedAt: now, updatedAt: now },
              { merge: true },
            );
            for (const doc of pending.docs) batch.update(doc.ref, { managerId: newManagerUid });
            for (const doc of futureShifts.docs) batch.update(doc.ref, { managerId: newManagerUid });
            batch.set(firestoreAdmin.collection("team_changes").doc(), {
              orgId,
              employeeId: targetUid,
              fromManagerId,
              toManagerId: newManagerUid,
              changedAt: now,
              changedBy: caller.uid,
              pendingLeaveMoved: pending.size,
              futureShiftsMoved: futureShifts.size,
            });
            await batch.commit();
          } catch (err) {
            console.error("Move to another manager failed after claims were set:", err);
            try {
              await setStaffRoleClaims(targetUid, "employee", orgId, fromManagerId);
            } catch (undoErr) {
              console.error("Could not put the claims back:", undoErr);
            }
            logEvent({
              action: "member.manager",
              outcome: "error",
              correlationId: correlationId(request),
              orgId,
              uid: caller.uid,
              fields: { target: targetUid },
            });
            return Response.json({ error: "Could not move the person. Nothing was changed." }, { status: 500 });
          }

          // Sign them out once so the new claims apply on their next token. If this fails the new
          // claims still apply when their current token expires (within the hour).
          try {
            await revokeUserSessions(targetUid);
          } catch (err) {
            console.warn("Could not revoke sessions after a manager change:", err);
          }

          logEvent({
            action: "member.manager",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { target: targetUid, pendingLeaveMoved: pending.size, futureShiftsMoved: futureShifts.size },
          });
          return Response.json({
            ok: true,
            managerId: newManagerUid,
            pendingLeaveMoved: pending.size,
            futureShiftsMoved: futureShifts.size,
          });
        } catch (err) {
          console.error("Member manager error:", err);
          return Response.json({ error: "Could not move the person" }, { status: 500 });
        }
      },
    },
  },
});
