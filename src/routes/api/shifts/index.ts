import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { MAX_ACTIVE_SHIFTS, parseShiftInput } from "@/lib/shift-requests";
import { canCallerEditShift, canCallerManageShifts } from "@/lib/shift-access.server";

function formatShiftRow(id: string, data: Record<string, unknown>) {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    type: typeof data.type === "string" ? data.type : "day",
    start: typeof data.start === "string" ? data.start : null,
    end: typeof data.end === "string" ? data.end : null,
    graceMinutes: typeof data.graceMinutes === "number" ? data.graceMinutes : 0,
    expectedMinutes: typeof data.expectedMinutes === "number" ? data.expectedMinutes : null,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
    archived: data.archived === true,
  };
}

export const Route = createFileRoute("/api/shifts/")({
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
            return Response.json({ error: "You do not have access to this organization." }, { status: 403 });
          }

          const url = new URL(request.url);
          const wantArchived = url.searchParams.get("archived") === "1";
          if (wantArchived && caller.role !== "org_admin") {
            return Response.json(
              { error: "Only an organization admin can view archived shifts." },
              { status: 403 },
            );
          }

          const snap = await firestoreAdmin
            .collection("shifts")
            .where("orgId", "==", orgId)
            .limit(200)
            .get();

          const shifts = snap.docs
            .map((doc) => formatShiftRow(doc.id, doc.data()))
            .filter((row) => wantArchived || !row.archived);

          return Response.json({ ok: true, shifts });
        } catch (err) {
          console.error("GET /api/shifts error:", err);
          return Response.json({ error: "Could not load shifts." }, { status: 500 });
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
              { error: "You do not have permission to create or manage shifts." },
              { status: 403 },
            );
          }

          const rate = await checkRateLimit(`shifts_write_${caller.uid}`, {
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
          const parsed = parseShiftInput(body);
          if (!parsed.ok) {
            return Response.json({ error: parsed.error }, { status: 400 });
          }

          const existingSnap = await firestoreAdmin
            .collection("shifts")
            .where("orgId", "==", orgId)
            .limit(200)
            .get();
          const activeCount = existingSnap.docs.filter((d) => d.data().archived !== true).length;
          if (activeCount >= MAX_ACTIVE_SHIFTS) {
            return Response.json(
              {
                error: `Your organization already has ${MAX_ACTIVE_SHIFTS} active shifts. Archive an unused shift first.`,
              },
              { status: 400 },
            );
          }

          const now = new Date().toISOString();
          const ref = firestoreAdmin.collection("shifts").doc();
          const record = {
            orgId,
            ...parsed.value,
            createdBy: caller.uid,
            createdAt: now,
            updatedAt: now,
            archived: false,
          };
          await ref.set(record);

          logEvent({
            action: "shift.create",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { shiftId: ref.id, type: parsed.value.type },
          });

          return Response.json({
            ok: true,
            shift: formatShiftRow(ref.id, record),
          });
        } catch (err) {
          console.error("POST /api/shifts error:", err);
          return Response.json({ error: "Could not create the shift." }, { status: 500 });
        }
      },

      PUT: async ({ request }) => {
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
              { error: "You do not have permission to edit shifts." },
              { status: 403 },
            );
          }

          const rate = await checkRateLimit(`shifts_write_${caller.uid}`, {
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
          const shiftId = typeof body?.id === "string" ? body.id.trim() : "";
          if (!shiftId || shiftId.includes("/")) {
            return Response.json({ error: "Choose a shift to update." }, { status: 400 });
          }

          const ref = firestoreAdmin.collection("shifts").doc(shiftId);
          const snap = await ref.get();
          if (!snap.exists || snap.data()?.orgId !== orgId) {
            return Response.json({ error: "Shift not found." }, { status: 404 });
          }

          const existing = snap.data()!;
          const createdBy = typeof existing.createdBy === "string" ? existing.createdBy : null;
          if (!canCallerEditShift(caller, createdBy)) {
            return Response.json(
              { error: "You can only edit shifts that you created." },
              { status: 403 },
            );
          }

          const parsed = parseShiftInput(body);
          if (!parsed.ok) {
            return Response.json({ error: parsed.error }, { status: 400 });
          }

          const updatedAt = new Date().toISOString();
          await ref.set(
            {
              ...parsed.value,
              updatedAt,
            },
            { merge: true },
          );

          logEvent({
            action: "shift.update",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { shiftId, type: parsed.value.type },
          });

          return Response.json({
            ok: true,
            shift: formatShiftRow(shiftId, {
              ...existing,
              ...parsed.value,
              updatedAt,
            }),
          });
        } catch (err) {
          console.error("PUT /api/shifts error:", err);
          return Response.json({ error: "Could not update the shift." }, { status: 500 });
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
              { error: "You do not have permission to archive shifts." },
              { status: 403 },
            );
          }

          const rate = await checkRateLimit(`shifts_write_${caller.uid}`, {
            limit: 60,
            windowMs: 60 * 60 * 1000,
          });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const url = new URL(request.url);
          const shiftId = (url.searchParams.get("id") || "").trim();
          if (!shiftId || shiftId.includes("/")) {
            return Response.json({ error: "Choose a shift to archive." }, { status: 400 });
          }

          const ref = firestoreAdmin.collection("shifts").doc(shiftId);
          const snap = await ref.get();
          if (!snap.exists || snap.data()?.orgId !== orgId) {
            return Response.json({ error: "Shift not found." }, { status: 404 });
          }

          const existing = snap.data()!;
          const createdBy = typeof existing.createdBy === "string" ? existing.createdBy : null;
          if (!canCallerEditShift(caller, createdBy)) {
            return Response.json(
              { error: "You can only archive shifts that you created." },
              { status: 403 },
            );
          }

          await ref.set(
            {
              archived: true,
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );

          logEvent({
            action: "shift.archive",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { shiftId },
          });

          return Response.json({ ok: true, id: shiftId, archived: true });
        } catch (err) {
          console.error("DELETE /api/shifts error:", err);
          return Response.json({ error: "Could not archive the shift." }, { status: 500 });
        }
      },
    },
  },
});
