import { createFileRoute } from "@tanstack/react-router";
import { FieldValue } from "firebase-admin/firestore";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { summaryDocId } from "@/lib/daily-summary";
import { loadOrgToday } from "@/lib/org-day.server";
import {
  appendHistory,
  canExcuse,
  excuseDecision,
  parseExcuseRequest,
  parseRevokeRequest,
  type HistoryEntry,
} from "@/lib/late-excuse";

/**
 * Excuse (POST) or un-excuse (DELETE) a late mark (docs/LATE-EXCUSE-DESIGN.md).
 *
 * The caller's identity, role and organization come only from the verified token. Which team a day
 * belongs to comes from the stored attendance (the summary's managerId), never from the request.
 * Nothing about a scan changes: the original late flag stays; the day is stamped `lateExcused` and an
 * audit document is kept, both in one transaction.
 */

class Refused extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function actorName(caller: { name?: unknown; email?: unknown }): string {
  const name = str(caller.name).trim();
  if (name) return name.slice(0, 80);
  const local = str(caller.email).split("@")[0]?.trim();
  return (local || "A manager").slice(0, 80);
}

export const Route = createFileRoute("/api/attendance/late-excuse")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cid = correlationId(request);
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) return Response.json({ error: "Not authenticated" }, { status: 401 });
          const role = caller.role === "org_admin" || caller.role === "manager" ? caller.role : null;
          if (!role) {
            return Response.json({ error: "Only a manager or an administrator can excuse a late mark." }, { status: 403 });
          }

          const rate = await checkRateLimit(`late_excuse_${caller.uid}`, { limit: 30, windowMs: 60 * 60 * 1000 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const today = await loadOrgToday(orgId);
          const parsed = parseExcuseRequest(await request.json().catch(() => null), today);
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
          const { dayKey: day, employeeIds, reason } = parsed.value;

          const sumRefs = employeeIds.map((id) => firestoreAdmin.collection("daily_summaries").doc(summaryDocId(id, day)));
          const excRefs = employeeIds.map((id) => firestoreAdmin.collection("late_excuses").doc(summaryDocId(id, day)));
          const decidedAt = new Date().toISOString();
          const decidedByName = actorName(caller);

          const result = await firestoreAdmin.runTransaction(async (t) => {
            const snaps = await t.getAll(...sumRefs, ...excRefs);
            const n = employeeIds.length;
            const skipped: { employeeId: string; reason: string }[] = [];
            const writes: { i: number; managerId: string | null; name: string; history: HistoryEntry[] }[] = [];

            for (let i = 0; i < n; i++) {
              const employeeId = employeeIds[i];
              const s = snaps[i];
              const data = s.exists ? s.data() : undefined;
              // A day in another organization looks the same as a day that does not exist.
              if (!data || data.orgId !== orgId) {
                skipped.push({ employeeId, reason: "no_record" });
                continue;
              }
              const managerId = typeof data.managerId === "string" ? data.managerId : null;
              if (!canExcuse({ uid: caller.uid, role }, { employeeId, managerId })) {
                throw new Refused(403, "You can only excuse people on your own team, and not your own late mark.");
              }
              const decision = excuseDecision(data);
              if (decision !== "ok") {
                skipped.push({ employeeId, reason: decision });
                continue;
              }
              const prior = snaps[n + i].exists ? snaps[n + i].data()?.history : undefined;
              writes.push({
                i,
                managerId,
                name: str(data.employeeName).trim().slice(0, 80) || "Employee",
                history: appendHistory(Array.isArray(prior) ? (prior as HistoryEntry[]) : undefined, {
                  action: "excused",
                  by: caller.uid,
                  at: decidedAt,
                  reason,
                }),
              });
            }

            for (const w of writes) {
              t.update(sumRefs[w.i], { lateExcused: true });
              t.set(
                excRefs[w.i],
                {
                  orgId,
                  managerId: w.managerId,
                  employeeId: employeeIds[w.i],
                  employeeName: w.name,
                  dayKey: day,
                  status: "excused",
                  reason,
                  decidedBy: caller.uid,
                  decidedByName,
                  decidedAt,
                  history: w.history,
                },
                { merge: true },
              );
            }
            return { excused: writes.length, skipped };
          });

          logEvent({
            action: "late.excuse",
            outcome: "ok",
            correlationId: cid,
            orgId,
            uid: caller.uid,
            fields: { requested: employeeIds.length, excused: result.excused, skipped: result.skipped.length },
          });
          return Response.json({ ok: true, ...result });
        } catch (err) {
          if (err instanceof Refused) {
            return Response.json({ error: err.message }, { status: err.status });
          }
          console.error("POST /api/attendance/late-excuse error:", err);
          return Response.json({ error: "Could not excuse those late marks." }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        const cid = correlationId(request);
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) return Response.json({ error: "Not authenticated" }, { status: 401 });
          const role = caller.role === "org_admin" || caller.role === "manager" ? caller.role : null;
          if (!role) {
            return Response.json({ error: "Only a manager or an administrator can undo an excuse." }, { status: 403 });
          }

          const rate = await checkRateLimit(`late_excuse_${caller.uid}`, { limit: 30, windowMs: 60 * 60 * 1000 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const today = await loadOrgToday(orgId);
          const parsed = parseRevokeRequest(await request.json().catch(() => null), today);
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
          const { dayKey: day, employeeId, reason } = parsed.value;

          const sumRef = firestoreAdmin.collection("daily_summaries").doc(summaryDocId(employeeId, day));
          const excRef = firestoreAdmin.collection("late_excuses").doc(summaryDocId(employeeId, day));
          const at = new Date().toISOString();

          await firestoreAdmin.runTransaction(async (t) => {
            const [s, e] = await t.getAll(sumRef, excRef);
            const summary = s.exists ? s.data() : undefined;
            const excuse = e.exists ? e.data() : undefined;
            // Same answer for "not there", "not excused" and "not yours": ids cannot be probed.
            const notFound = new Refused(404, "That excuse was not found.");
            if (!summary || summary.orgId !== orgId || !excuse || excuse.orgId !== orgId) throw notFound;
            if (excuse.status !== "excused" || summary.lateExcused !== true) throw notFound;
            const managerId = typeof summary.managerId === "string" ? summary.managerId : null;
            if (!canExcuse({ uid: caller.uid, role }, { employeeId, managerId })) throw notFound;
            // Only an administrator, or the person who excused it, can take an excuse back.
            if (role !== "org_admin" && excuse.decidedBy !== caller.uid) {
              throw new Refused(403, "Only the person who excused this, or an administrator, can undo it.");
            }
            t.update(sumRef, { lateExcused: FieldValue.delete() });
            t.set(
              excRef,
              {
                status: "revoked",
                revokedBy: caller.uid,
                revokedAt: at,
                revokedReason: reason,
                history: appendHistory(Array.isArray(excuse.history) ? (excuse.history as HistoryEntry[]) : undefined, {
                  action: "revoked",
                  by: caller.uid,
                  at,
                  reason,
                }),
              },
              { merge: true },
            );
          });

          logEvent({ action: "late.revoke", outcome: "ok", correlationId: cid, orgId, uid: caller.uid, fields: { day } });
          return Response.json({ ok: true });
        } catch (err) {
          if (err instanceof Refused) {
            return Response.json({ error: err.message }, { status: err.status });
          }
          console.error("DELETE /api/attendance/late-excuse error:", err);
          return Response.json({ error: "Could not undo that excuse." }, { status: 500 });
        }
      },
    },
  },
});
