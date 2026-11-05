import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { summaryDocId } from "@/lib/daily-summary";
import { loadOrgToday } from "@/lib/org-day.server";
import { parseNoteRequest } from "@/lib/late-excuse";

/**
 * POST /api/attendance/late-note: the signed-in person adds a short note to THEIR OWN late day
 * (docs/LATE-EXCUSE-DESIGN.md). The day belongs to the caller, so the body carries no person. The
 * note only helps a manager decide; it never excuses anything by itself.
 */
export const Route = createFileRoute("/api/attendance/late-note")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cid = correlationId(request);
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) return Response.json({ error: "Not authenticated" }, { status: 401 });
          if (caller.role !== "org_admin" && caller.role !== "manager" && caller.role !== "employee") {
            return Response.json({ error: "You do not have access to this." }, { status: 403 });
          }

          const rate = await checkRateLimit(`late_note_${caller.uid}`, { limit: 20, windowMs: 60 * 60 * 1000 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const today = await loadOrgToday(orgId);
          const parsed = parseNoteRequest(await request.json().catch(() => null), today);
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
          const { dayKey: day, note } = parsed.value;

          const sumSnap = await firestoreAdmin.collection("daily_summaries").doc(summaryDocId(caller.uid, day)).get();
          const summary = sumSnap.exists ? sumSnap.data() : undefined;
          if (!summary || summary.orgId !== orgId || !summary.firstIn || summary.late !== true) {
            return Response.json({ error: "There is no late mark on that day to explain." }, { status: 404 });
          }

          await firestoreAdmin
            .collection("late_excuses")
            .doc(summaryDocId(caller.uid, day))
            .set(
              {
                orgId,
                managerId: typeof summary.managerId === "string" ? summary.managerId : null,
                employeeId: caller.uid,
                employeeName: String(summary.employeeName ?? "Employee").trim().slice(0, 80) || "Employee",
                dayKey: day,
                employeeNote: note,
                noteAt: new Date().toISOString(),
              },
              { merge: true },
            );

          logEvent({ action: "late.note", outcome: "ok", correlationId: cid, orgId, uid: caller.uid, fields: { day } });
          return Response.json({ ok: true });
        } catch (err) {
          console.error("POST /api/attendance/late-note error:", err);
          return Response.json({ error: "Could not save your note." }, { status: 500 });
        }
      },
    },
  },
});
