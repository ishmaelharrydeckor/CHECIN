import { createFileRoute } from "@tanstack/react-router";
import {
  firestoreAdmin,
  getAuthAdmin,
  verifyCallerToken,
} from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { dayKey } from "@/lib/attendance-day";
import { summaryDocId } from "@/lib/daily-summary";
import {
  ASSIGNMENT_READ_CAP,
  assignmentId,
  canAssignTo,
  expandAssignmentRange,
  parseAssignRequest,
  parseClearRequest,
  snapshotFromShiftDoc,
  type CallerLike,
} from "@/lib/shift-requests";
import { callerFromToken, canCallerManageShifts } from "@/lib/shift-access.server";

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

interface ResolvedAssignee {
  uid: string;
  role: string | null;
  managerId: string | null;
  authDisplayName: string;
}

/**
 * Resolves each requested person from Firebase Auth custom claims in batches of 100.
 * Never trusts the Firestore `users` profile document for role, organization, or manager.
 */
async function resolveAndCheckAssignees(
  caller: CallerLike,
  orgId: string,
  employeeIds: string[],
): Promise<
  | { ok: true; targets: Map<string, ResolvedAssignee> }
  | { ok: false; status: number; error: string }
> {
  const targets = new Map<string, ResolvedAssignee>();

  for (let i = 0; i < employeeIds.length; i += 100) {
    const batchIds = employeeIds.slice(i, i + 100);
    const res = await getAuthAdmin().getUsers(batchIds.map((uid) => ({ uid })));
    for (const u of res.users) {
      const claims = u.customClaims ?? {};
      if (claims.orgId !== orgId) continue;
      const role = typeof claims.role === "string" ? claims.role : null;
      const managerId =
        typeof claims.managerId === "string"
          ? claims.managerId
          : role === "manager"
            ? u.uid
            : null;
      targets.set(u.uid, {
        uid: u.uid,
        role,
        managerId,
        authDisplayName: u.displayName || "",
      });
    }
  }

  for (const empId of employeeIds) {
    const target = targets.get(empId);
    // Same message and 404 whether the ID is unknown or belongs to another organization
    if (!target) {
      return {
        ok: false,
        status: 404,
        error: "One or more selected people were not found in your organization.",
      };
    }
    if (!canAssignTo(caller, target)) {
      return {
        ok: false,
        status: 403,
        error: "You can only assign or clear shifts for people on your own team.",
      };
    }
  }

  return { ok: true, targets };
}

async function loadPeopleWithTodaySummary(
  employeeIds: string[],
  today: string,
): Promise<Set<string>> {
  const hasSummary = new Set<string>();
  if (employeeIds.length === 0) return hasSummary;
  const refs = employeeIds.map((empId) =>
    firestoreAdmin.collection("daily_summaries").doc(summaryDocId(empId, today)),
  );
  const snaps = await firestoreAdmin.getAll(...refs);
  for (let i = 0; i < employeeIds.length; i++) {
    if (snaps[i]?.exists) {
      hasSummary.add(employeeIds[i]);
    }
  }
  return hasSummary;
}

async function loadOrgToday(orgId: string): Promise<string> {
  const orgSnap = await firestoreAdmin.collection("organizations").doc(orgId).get();
  const rawTz = orgSnap.exists ? orgSnap.data()?.timezone : undefined;
  const timezone = typeof rawTz === "string" && rawTz.trim().length > 0 ? rawTz.trim() : "UTC";
  return dayKey(Date.now(), timezone) || new Date().toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/shifts/assignments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (
            caller.role !== "org_admin" &&
            caller.role !== "manager" &&
            caller.role !== "employee"
          ) {
            return Response.json(
              { error: "You do not have access to shift assignments." },
              { status: 403 },
            );
          }

          const url = new URL(request.url);
          const fromDay = (url.searchParams.get("from") || "").trim();
          const toDay = (url.searchParams.get("to") || "").trim();
          const filterEmployeeId = (url.searchParams.get("employeeId") || "").trim();

          const rangeCheck = expandAssignmentRange({
            fromDay,
            toDay,
            weekdays: ALL_WEEKDAYS,
          });
          if (!rangeCheck.ok) {
            return Response.json({ error: rangeCheck.error }, { status: 400 });
          }

          // Scope strictly from the verified token claims; employeeId can narrow but never widen
          if (caller.role === "employee" && filterEmployeeId && filterEmployeeId !== caller.uid) {
            return Response.json({ ok: true, assignments: [], truncated: false });
          }

          let snap;
          if (caller.role === "org_admin") {
            if (filterEmployeeId) {
              snap = await firestoreAdmin
                .collection("shift_assignments")
                .where("orgId", "==", orgId)
                .where("employeeId", "==", filterEmployeeId)
                .where("dayKey", ">=", fromDay)
                .where("dayKey", "<=", toDay)
                .limit(ASSIGNMENT_READ_CAP)
                .get();
            } else {
              snap = await firestoreAdmin
                .collection("shift_assignments")
                .where("orgId", "==", orgId)
                .where("dayKey", ">=", fromDay)
                .where("dayKey", "<=", toDay)
                .limit(ASSIGNMENT_READ_CAP)
                .get();
            }
          } else if (caller.role === "manager") {
            snap = await firestoreAdmin
              .collection("shift_assignments")
              .where("orgId", "==", orgId)
              .where("managerId", "==", caller.uid)
              .where("dayKey", ">=", fromDay)
              .where("dayKey", "<=", toDay)
              .limit(ASSIGNMENT_READ_CAP)
              .get();
          } else {
            snap = await firestoreAdmin
              .collection("shift_assignments")
              .where("orgId", "==", orgId)
              .where("employeeId", "==", caller.uid)
              .where("dayKey", ">=", fromDay)
              .where("dayKey", "<=", toDay)
              .limit(ASSIGNMENT_READ_CAP)
              .get();
          }

          const truncated = snap.docs.length >= ASSIGNMENT_READ_CAP;
          const assignments = snap.docs
            .filter((doc) => !filterEmployeeId || doc.data().employeeId === filterEmployeeId)
            .map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                employeeId: typeof data.employeeId === "string" ? data.employeeId : "",
                employeeName: typeof data.employeeName === "string" ? data.employeeName : "",
                managerId: typeof data.managerId === "string" ? data.managerId : null,
                dayKey: typeof data.dayKey === "string" ? data.dayKey : "",
                shift: data.shift ?? null,
              };
            });

          return Response.json({ ok: true, assignments, truncated });
        } catch (err) {
          console.error("GET /api/shifts/assignments error:", err);
          return Response.json({ error: "Could not load shift assignments." }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (!canCallerManageShifts(caller)) {
            return Response.json(
              { error: "You do not have permission to assign shifts." },
              { status: 403 },
            );
          }

          const rate = await checkRateLimit(`shifts_assign_${caller.uid}`, {
            limit: 60,
            windowMs: 60 * 60 * 1000,
          });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const today = await loadOrgToday(orgId);
          const body = await request.json().catch(() => null);
          const parsed = parseAssignRequest(body, today);
          if (!parsed.ok) {
            return Response.json({ error: parsed.error }, { status: 400 });
          }
          const { shiftId, employeeIds, days } = parsed.value;

          const shiftSnap = await firestoreAdmin.collection("shifts").doc(shiftId).get();
          if (!shiftSnap.exists || shiftSnap.data()?.orgId !== orgId) {
            return Response.json({ error: "Shift not found." }, { status: 404 });
          }
          const shiftData = shiftSnap.data()!;
          if (shiftData.archived === true) {
            return Response.json(
              { error: "Archived shifts cannot be assigned." },
              { status: 400 },
            );
          }
          const snapshot = snapshotFromShiftDoc(shiftSnap.id, shiftData);
          if (!snapshot) {
            return Response.json(
              { error: "This shift has invalid details and cannot be assigned." },
              { status: 400 },
            );
          }

          const resolved = await resolveAndCheckAssignees(
            callerFromToken(caller),
            orgId,
            employeeIds,
          );
          if (!resolved.ok) {
            return Response.json({ error: resolved.error }, { status: resolved.status });
          }

          const userRefs = employeeIds.map((uid) => firestoreAdmin.collection("users").doc(uid));
          const userSnaps = userRefs.length > 0 ? await firestoreAdmin.getAll(...userRefs) : [];
          const nameByUid = new Map<string, string>();
          for (const snap of userSnaps) {
            const docName =
              snap.exists && typeof snap.data()?.displayName === "string"
                ? snap.data()!.displayName.trim()
                : "";
            const authName = resolved.targets.get(snap.id)?.authDisplayName.trim() || "";
            nameByUid.set(snap.id, docName || authName || "Employee");
          }

          const hasTodaySummary = days.includes(today)
            ? await loadPeopleWithTodaySummary(employeeIds, today)
            : new Set<string>();

          const batch = firestoreAdmin.batch();
          const assignedAt = new Date().toISOString();
          let written = 0;
          const skipped: { employeeId: string; dayKey: string; reason: string }[] = [];

          for (const empId of employeeIds) {
            const target = resolved.targets.get(empId)!;
            const employeeName = nameByUid.get(empId) || "Employee";
            for (const d of days) {
              if (d === today && hasTodaySummary.has(empId)) {
                skipped.push({
                  employeeId: empId,
                  dayKey: d,
                  reason: "Attendance is already recorded for today.",
                });
                continue;
              }
              const docRef = firestoreAdmin
                .collection("shift_assignments")
                .doc(assignmentId(empId, d));
              batch.set(docRef, {
                orgId,
                managerId: target.managerId,
                employeeId: empId,
                employeeName,
                dayKey: d,
                shiftId: snapshot.shiftId,
                shift: snapshot,
                assignedBy: caller.uid,
                assignedAt,
              });
              written++;
            }
          }

          if (written > 0) {
            await batch.commit();
          }

          logEvent({
            action: "shift.assign",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: {
              shiftId: snapshot.shiftId,
              people: employeeIds.length,
              days: days.length,
              written,
              skipped: skipped.length,
            },
          });

          return Response.json({ ok: true, written, skipped });
        } catch (err) {
          console.error("POST /api/shifts/assignments error:", err);
          return Response.json({ error: "Could not assign shifts." }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (!canCallerManageShifts(caller)) {
            return Response.json(
              { error: "You do not have permission to clear shift assignments." },
              { status: 403 },
            );
          }

          const rate = await checkRateLimit(`shifts_assign_${caller.uid}`, {
            limit: 60,
            windowMs: 60 * 60 * 1000,
          });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const today = await loadOrgToday(orgId);
          const body = await request.json().catch(() => null);
          const parsed = parseClearRequest(body, today);
          if (!parsed.ok) {
            return Response.json({ error: parsed.error }, { status: 400 });
          }
          const { employeeIds, days } = parsed.value;

          const resolved = await resolveAndCheckAssignees(
            callerFromToken(caller),
            orgId,
            employeeIds,
          );
          if (!resolved.ok) {
            return Response.json({ error: resolved.error }, { status: resolved.status });
          }

          const hasTodaySummary = days.includes(today)
            ? await loadPeopleWithTodaySummary(employeeIds, today)
            : new Set<string>();

          const batch = firestoreAdmin.batch();
          let removed = 0;
          const skipped: { employeeId: string; dayKey: string; reason: string }[] = [];

          for (const empId of employeeIds) {
            for (const d of days) {
              if (d === today && hasTodaySummary.has(empId)) {
                skipped.push({
                  employeeId: empId,
                  dayKey: d,
                  reason: "Attendance is already recorded for today.",
                });
                continue;
              }
              const docRef = firestoreAdmin
                .collection("shift_assignments")
                .doc(assignmentId(empId, d));
              batch.delete(docRef);
              removed++;
            }
          }

          if (removed > 0) {
            await batch.commit();
          }

          logEvent({
            action: "shift.clear",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: {
              people: employeeIds.length,
              days: days.length,
              removed,
              skipped: skipped.length,
            },
          });

          return Response.json({ ok: true, removed, skipped });
        } catch (err) {
          console.error("DELETE /api/shifts/assignments error:", err);
          return Response.json({ error: "Could not clear shift assignments." }, { status: 500 });
        }
      },
    },
  },
});
