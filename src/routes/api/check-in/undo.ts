import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { UNDO_WINDOW_MS } from "@/lib/attendance-day";
import { summaryDocId } from "@/lib/daily-summary";
import { correlationId, logEvent } from "@/lib/log.server";

/**
 * Undo my own most recent scan, within UNDO_WINDOW_MS of making it.
 *
 * The caller is the verified login, never a field in the body. The event is not deleted: it is
 * marked voided (who, when, why) so the audit trail still shows it happened, and the day's
 * summary is put back to exactly what it was before the scan. Everything else that reads
 * events skips voided ones.
 */
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{10,140}$/;
// A little slack for the phone's round trip so a tap at the last second still works.
const GRACE_MS = 3_000;

class UndoRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const Route = createFileRoute("/api/check-in/undo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cid = correlationId(request);
        let actor: { uid?: string; orgId?: string | null } = {};
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) return Response.json({ error: "Unauthorized" }, { status: 401 });
          if (!caller.orgId) return Response.json({ error: "No organization on this account" }, { status: 403 });
          actor = { uid: caller.uid, orgId: caller.orgId };

          const body = await request.json().catch(() => ({}));
          const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
          // Event ids are "{uid}_{scanId}": a person can only ever name their own.
          if (!EVENT_ID_PATTERN.test(eventId) || !eventId.startsWith(`${caller.uid}_`)) {
            return Response.json({ error: "That scan could not be found." }, { status: 404 });
          }

          const eventRef = firestoreAdmin.collection("clock_events").doc(eventId);
          const now = Date.now();

          const result = await firestoreAdmin.runTransaction(async (t) => {
            const eventSnap = await t.get(eventRef);
            if (!eventSnap.exists) throw new UndoRefused(404, "That scan could not be found.");
            const e = eventSnap.data()!;
            if (e.employeeId !== caller.uid || e.orgId !== caller.orgId) {
              throw new UndoRefused(404, "That scan could not be found.");
            }
            if (e.voidedAt) return { type: e.type as "in" | "out" };

            const age = now - new Date(e.timestamp).getTime();
            if (!Number.isFinite(age) || age > UNDO_WINDOW_MS + GRACE_MS) {
              throw new UndoRefused(409, "It is too late to undo that scan.");
            }
            // Scans from before undo existed carry no "before" picture, so they cannot be undone.
            if (e.summaryBefore === undefined || !e.dayKey) {
              throw new UndoRefused(409, "That scan can't be undone.");
            }

            const summaryRef = firestoreAdmin.collection("daily_summaries").doc(summaryDocId(caller.uid, e.dayKey));
            const summarySnap = await t.get(summaryRef);
            // Only the most recent scan can be undone.
            if (!summarySnap.exists || summarySnap.data()?.lastEventAt !== e.timestamp) {
              throw new UndoRefused(409, "Only your latest scan can be undone.");
            }

            t.update(eventRef, {
              voidedAt: new Date(now).toISOString(),
              voidedBy: caller.uid,
              voidReason: "employee_undo",
            });
            if (e.summaryBefore) t.set(summaryRef, e.summaryBefore);
            else t.delete(summaryRef);

            return { type: e.type as "in" | "out" };
          });

          logEvent({ action: "scan.undo", outcome: "ok", correlationId: cid, ...actor, fields: { type: result.type } });
          return Response.json({ ok: true, type: result.type });
        } catch (err: any) {
          if (err instanceof UndoRefused) {
            logEvent({ action: "scan.undo", outcome: "denied", correlationId: cid, ...actor });
            return Response.json({ error: err.message }, { status: err.status });
          }
          logEvent({ action: "scan.undo", outcome: "error", correlationId: cid, ...actor });
          console.error("POST /api/check-in/undo error:", err);
          return Response.json({ error: "Could not undo that scan. Please try again." }, { status: 500 });
        }
      },
    },
  },
});
