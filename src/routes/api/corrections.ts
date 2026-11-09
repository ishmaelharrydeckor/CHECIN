import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, resolveTargetInScope, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { applyEventToSummary, summaryDocId, type DailySummary } from "@/lib/daily-summary";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import {
  cancelCorrection,
  canRequestCorrection,
  decideCorrection,
  nextCorrectionId,
  pendingToDecide,
  validateCorrectionRequest,
  type Actor,
  type TimeCorrection,
} from "@/lib/time-corrections";

/**
 * Time corrections for a forgotten check-out (docs/PAYROLL-OVERTIME-DESIGN.md, 3.4; the rules are in
 * src/lib/time-corrections.ts).
 *
 *  GET  ?view=mine     my own corrections, newest day first
 *  GET  ?view=review   corrections waiting for me to decide (my team for a manager, the organization for an admin)
 *  POST { action: "request", dayKey, proposedAt, reason, employeeId? }   ask for a missing check-out to be recorded
 *  POST { action: "decide", id, decision: "approve" | "decline" }        the day's manager or an admin decides
 *  POST { action: "cancel", id }                                         the person who asked withdraws it
 *
 * Who is asking, their role, organization and team come from the verified token. The request names only the day, the
 * time, the reason and (optionally) whom it is for, and the route checks that person is in the caller's scope. The
 * scans themselves are never edited: approving rebuilds the day's summary with the correction as a stand-in check-out.
 */
class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const COLLECTION = "time_corrections";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{3,200}$/;
const LIST_LIMIT = 50;
const REVIEW_LIMIT = 100;
const SAME_DAY_LIMIT = 20;

interface Caller extends Actor {
  managerId: string | null;
}

async function authCaller(request: Request): Promise<{ ok: true; caller: Caller } | { ok: false; response: Response }> {
  const verified = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
  const orgId = typeof verified?.orgId === "string" ? verified.orgId : "";
  if (!verified?.uid || !orgId) return { ok: false, response: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  const role = verified.role;
  if (role !== "org_admin" && role !== "manager" && role !== "employee") {
    return { ok: false, response: Response.json({ error: "You do not have access to this." }, { status: 403 }) };
  }
  const managerId = typeof verified.managerId === "string" && verified.managerId ? verified.managerId : null;
  return { ok: true, caller: { uid: verified.uid, role, orgId, managerId } };
}

const view = (c: TimeCorrection): TimeCorrection & { employeeName?: string } => ({ ...c });

export const Route = createFileRoute("/api/corrections")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authCaller(request);
          if (!auth.ok) return auth.response;
          const { caller } = auth;
          const which = new URL(request.url).searchParams.get("view") || "mine";

          if (which === "mine") {
            const snap = await firestoreAdmin
              .collection(COLLECTION)
              .where("orgId", "==", caller.orgId)
              .where("employeeId", "==", caller.uid)
              .orderBy("dayKey", "desc")
              .limit(LIST_LIMIT)
              .get();
            return Response.json({ ok: true, corrections: snap.docs.map((d) => view(d.data() as TimeCorrection)) }, { headers: { "Cache-Control": "private, no-store" } });
          }

          if (which === "review") {
            if (caller.role === "employee") return Response.json({ error: "Only a manager or an admin can review corrections." }, { status: 403 });
            let q: FirebaseFirestore.Query = firestoreAdmin.collection(COLLECTION).where("orgId", "==", caller.orgId);
            if (caller.role === "manager") q = q.where("managerId", "==", caller.uid);
            const snap = await q.where("status", "==", "pending").orderBy("requestedAt", "desc").limit(REVIEW_LIMIT).get();
            const mine = pendingToDecide(snap.docs.map((d) => d.data() as TimeCorrection), caller);
            return Response.json({ ok: true, corrections: mine.map(view) }, { headers: { "Cache-Control": "private, no-store" } });
          }

          return Response.json({ error: "Choose mine or review." }, { status: 400 });
        } catch (err) {
          console.error("GET /api/corrections error:", err);
          return Response.json({ error: "Could not load the corrections." }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        const cid = correlationId(request);
        let actor: { uid?: string; orgId?: string } = {};
        try {
          const auth = await authCaller(request);
          if (!auth.ok) return auth.response;
          const { caller } = auth;
          actor = { uid: caller.uid, orgId: caller.orgId };

          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Choose what to do." }, { status: 400 });
          const b = body as Record<string, unknown>;

          const rate = await checkRateLimit(`corrections_${caller.uid}`, { limit: 60, windowMs: 60 * 60 * 1000 });
          if (!rate.allowed) {
            return Response.json({ error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` }, { status: 429 });
          }

          // ------------------------------------------------------------------------------------ ask
          if (b.action === "request") {
            const dayKey = typeof b.dayKey === "string" ? b.dayKey : "";
            if (!DAY_RE.test(dayKey)) throw new Refused(400, "Choose the day.");

            // Whom it is for: the caller by default, or someone in their scope. Their team comes from their claims.
            const wanted = typeof b.employeeId === "string" ? b.employeeId.trim() : "";
            let person: { uid: string; orgId: string; managerId: string | null };
            if (!wanted || wanted === caller.uid) {
              person = { uid: caller.uid, orgId: caller.orgId, managerId: caller.managerId };
            } else {
              if (wanted.includes("/")) throw new Refused(404, "That person was not found in your organization.");
              const t = await resolveTargetInScope(caller, wanted);
              if (!t || !t.orgId) throw new Refused(404, "That person was not found in your organization or team.");
              person = { uid: wanted, orgId: t.orgId, managerId: t.managerId };
            }
            if (!canRequestCorrection(caller, person)) throw new Refused(403, "You can't ask for a correction for that person.");

            const summaryRef = firestoreAdmin.collection("daily_summaries").doc(summaryDocId(person.uid, dayKey));
            const result = await firestoreAdmin.runTransaction(async (t) => {
              const summarySnap = await t.get(summaryRef);
              const summary = summarySnap.exists ? (summarySnap.data() as DailySummary) : null;
              if (!summary || summary.orgId !== caller.orgId) {
                throw new Refused(404, "There is no check-in on that day, so there is nothing to correct.");
              }
              const sameDay = await t.get(
                firestoreAdmin
                  .collection(COLLECTION)
                  .where("orgId", "==", caller.orgId)
                  .where("employeeId", "==", person.uid)
                  .where("dayKey", "==", dayKey)
                  .limit(SAME_DAY_LIMIT),
              );
              const existing = sameDay.docs.map((d) => d.data() as TimeCorrection);

              const checked = validateCorrectionRequest({
                dayKey,
                openSince: summary.state === "in" && typeof summary.openSince === "string" ? summary.openSince : null,
                proposedAt: b.proposedAt,
                reason: b.reason,
                nowMs: Date.now(),
                existing,
                dayIsLocked: false, // pay periods are not stored yet; the lock check joins when they are
              });
              if (!checked.ok) throw new Refused(400, checked.error);

              const nowIso = new Date().toISOString();
              const id = nextCorrectionId(existing.map((c) => c.id), person.uid, dayKey);
              const doc: TimeCorrection & { employeeName: string } = {
                id,
                orgId: caller.orgId,
                employeeId: person.uid,
                employeeName: typeof summary.employeeName === "string" ? summary.employeeName : "",
                // The manager on that day's summary, so a later move does not reroute it.
                managerId: typeof summary.managerId === "string" && summary.managerId ? summary.managerId : person.managerId,
                dayKey,
                proposedAt: checked.value.proposedAt,
                reason: checked.value.reason,
                status: "pending",
                requestedBy: caller.uid,
                requestedAt: nowIso,
              };
              t.create(firestoreAdmin.collection(COLLECTION).doc(id), doc);
              return doc;
            });

            logEvent({ action: "correction.request", outcome: "ok", correlationId: cid, orgId: caller.orgId, uid: caller.uid, fields: { correctionId: result.id, forSelf: result.employeeId === caller.uid } });
            return Response.json({ ok: true, correction: view(result) });
          }

          // ------------------------------------------------------------------------- decide or withdraw
          const id = typeof b.id === "string" ? b.id.trim() : "";
          if (!ID_RE.test(id)) throw new Refused(404, "Correction not found.");
          const ref = firestoreAdmin.collection(COLLECTION).doc(id);

          if (b.action === "decide") {
            const decision = typeof b.decision === "string" ? b.decision : "";
            const nowIso = new Date().toISOString();
            const done = await firestoreAdmin.runTransaction(async (t) => {
              const snap = await t.get(ref);
              const c = snap.exists ? (snap.data() as TimeCorrection) : null;
              if (!c || c.orgId !== caller.orgId) throw new Refused(404, "Correction not found.");

              const r = decideCorrection(c, decision, caller, nowIso);
              if (!r.ok) throw new Refused(/already been decided/.test(r.error) ? 409 : /Choose approve/.test(r.error) ? 400 : 403, r.error);

              if (r.correction.status === "approved") {
                // The day is rebuilt with the correction as a stand-in check-out. The scans are not touched.
                const summaryRef = firestoreAdmin.collection("daily_summaries").doc(summaryDocId(c.employeeId, c.dayKey));
                const sSnap = await t.get(summaryRef);
                const prev = sSnap.exists ? (sSnap.data() as DailySummary) : null;
                if (!prev || prev.orgId !== caller.orgId || prev.state !== "in" || typeof prev.openSince !== "string") {
                  throw new Refused(409, "The person is no longer checked in on that day, so this can't be applied. You can decline it.");
                }
                if (Date.parse(c.proposedAt) <= Date.parse(prev.openSince)) {
                  throw new Refused(409, "The corrected check-out is not after the check-in, so this can't be applied. You can decline it.");
                }
                const next = applyEventToSummary(prev, { type: "out", timestamp: c.proposedAt, earlyDeparture: false }, prev, nowIso);
                t.set(summaryRef, { ...next, correctedBy: c.id });
              }
              t.update(ref, { status: r.correction.status, decidedBy: r.correction.decidedBy, decidedAt: r.correction.decidedAt });
              return r.correction;
            });
            logEvent({ action: "correction.decide", outcome: "ok", correlationId: cid, orgId: caller.orgId, uid: caller.uid, fields: { correctionId: id, decision: done.status } });
            return Response.json({ ok: true, correction: view(done) });
          }

          if (b.action === "cancel") {
            const nowIso = new Date().toISOString();
            const done = await firestoreAdmin.runTransaction(async (t) => {
              const snap = await t.get(ref);
              const c = snap.exists ? (snap.data() as TimeCorrection) : null;
              if (!c || c.orgId !== caller.orgId) throw new Refused(404, "Correction not found.");
              const r = cancelCorrection(c, caller, nowIso);
              if (!r.ok) throw new Refused(/Only the person who asked/.test(r.error) ? 403 : 409, r.error);
              t.update(ref, { status: r.correction.status, decidedBy: r.correction.decidedBy, decidedAt: r.correction.decidedAt });
              return r.correction;
            });
            logEvent({ action: "correction.cancel", outcome: "ok", correlationId: cid, orgId: caller.orgId, uid: caller.uid, fields: { correctionId: id } });
            return Response.json({ ok: true, correction: view(done) });
          }

          return Response.json({ error: "Choose request, decide or cancel." }, { status: 400 });
        } catch (err) {
          if (err instanceof Refused) {
            logEvent({ action: "correction", outcome: "denied", correlationId: cid, orgId: actor.orgId ?? null, uid: actor.uid ?? null, fields: { status: err.status } });
            return Response.json({ error: err.message }, { status: err.status });
          }
          logEvent({ action: "correction", outcome: "error", correlationId: cid, orgId: actor.orgId ?? null, uid: actor.uid ?? null });
          console.error("POST /api/corrections error:", err);
          return Response.json({ error: "Could not update the correction." }, { status: 500 });
        }
      },
    },
  },
});
