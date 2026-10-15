import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { dayKey } from "@/lib/attendance-day";
import { loadHolidayDays } from "@/lib/report-data.server";
import {
  WFH_HISTORY_DAYS,
  WFH_MAX_AHEAD_DAYS,
  WFH_READ_CAP,
  addDays,
  dayCoveredByLeave,
  parseDeclareRequest,
  parseRemoveRequest,
  wfhId,
} from "@/lib/wfh";

/**
 * Work from home (docs/WFH-DESIGN.md). A day is a self-declaration, one document per person per day.
 * Clients never write the collection: everything goes through here, and who is asking, which
 * organization and which team all come from the verified token, never from the request.
 */

const LEAVE_CHECK_CAP = 300;

async function loadOrgToday(orgId: string): Promise<string> {
  const orgSnap = await firestoreAdmin.collection("organizations").doc(orgId).get();
  const rawTz = orgSnap.exists ? orgSnap.data()?.timezone : undefined;
  const timezone = typeof rawTz === "string" && rawTz.trim().length > 0 ? rawTz.trim() : "UTC";
  return dayKey(Date.now(), timezone) || new Date().toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/wfh")({
  server: {
    handlers: {
      // The signed-in person's own declared days, from a month back to a month ahead.
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          const today = await loadOrgToday(orgId);
          const snap = await firestoreAdmin
            .collection("wfh_days")
            .where("orgId", "==", orgId)
            .where("employeeId", "==", caller.uid)
            .where("dayKey", ">=", addDays(today, -WFH_HISTORY_DAYS))
            .where("dayKey", "<=", addDays(today, WFH_MAX_AHEAD_DAYS))
            .limit(WFH_READ_CAP)
            .get();
          const days = snap.docs
            .map((d) => ({
              dayKey: typeof d.data().dayKey === "string" ? (d.data().dayKey as string) : "",
              declaredAt: typeof d.data().createdAt === "string" ? (d.data().createdAt as string) : "",
            }))
            .filter((d) => d.dayKey)
            .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
          return Response.json({ ok: true, days, maxAheadDays: WFH_MAX_AHEAD_DAYS, today });
        } catch (err) {
          console.error("GET /api/wfh error:", err);
          return Response.json({ error: "Could not load your work-from-home days." }, { status: 500 });
        }
      },

      // Declare days for yourself. Nobody can declare for someone else.
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (caller.role !== "org_admin" && caller.role !== "manager" && caller.role !== "employee") {
            return Response.json({ error: "You do not have access to this." }, { status: 403 });
          }

          const rate = await checkRateLimit(`wfh_declare_${caller.uid}`, {
            limit: 30,
            windowMs: 60 * 60 * 1000,
          });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const today = await loadOrgToday(orgId);
          const parsed = parseDeclareRequest(await request.json().catch(() => null), today);
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
          const { days } = parsed.value;

          const [holidays, leaveSnap] = await Promise.all([
            loadHolidayDays(orgId),
            firestoreAdmin
              .collection("leave_requests")
              .where("orgId", "==", orgId)
              .where("employeeId", "==", caller.uid)
              .where("status", "==", "approved")
              .limit(LEAVE_CHECK_CAP)
              .get(),
          ]);
          const holiday = days.find((d) => holidays.includes(d));
          if (holiday) {
            return Response.json({ error: `${holiday} is a holiday, so there is nothing to declare.` }, { status: 400 });
          }
          const onLeave = dayCoveredByLeave(days, leaveSnap.docs.map((d) => d.data()));
          if (onLeave) {
            return Response.json({ error: `Leave is already approved on ${onLeave}.` }, { status: 400 });
          }

          const managerId =
            typeof caller.managerId === "string" ? caller.managerId : caller.role === "manager" ? caller.uid : null;
          const userSnap = await firestoreAdmin.collection("users").doc(caller.uid).get();
          const profileName = userSnap.exists ? String(userSnap.data()?.displayName ?? "").trim() : "";
          const employeeName = (profileName || (typeof caller.name === "string" ? caller.name : "") || "Employee").slice(0, 80);

          // Days already declared keep their original time, so a repeat request changes nothing.
          const refs = days.map((d) => firestoreAdmin.collection("wfh_days").doc(wfhId(caller.uid, d)));
          const existing = await firestoreAdmin.getAll(...refs);
          const createdAt = new Date().toISOString();
          const batch = firestoreAdmin.batch();
          let written = 0;
          days.forEach((d, i) => {
            if (existing[i]?.exists) return;
            batch.set(refs[i], { orgId, managerId, employeeId: caller.uid, employeeName, dayKey: d, createdAt });
            written++;
          });
          if (written > 0) await batch.commit();

          logEvent({
            action: "wfh.declare",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { days: days.length, written },
          });
          return Response.json({ ok: true, written });
        } catch (err) {
          console.error("POST /api/wfh error:", err);
          return Response.json({ error: "Could not save those days." }, { status: 500 });
        }
      },

      // Cancel a day. An employee cancels their own; a manager (own team) or admin removes someone's.
      DELETE: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (caller.role !== "org_admin" && caller.role !== "manager" && caller.role !== "employee") {
            return Response.json({ error: "You do not have access to this." }, { status: 403 });
          }

          const rate = await checkRateLimit(`wfh_remove_${caller.uid}`, {
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
          const parsed = parseRemoveRequest(await request.json().catch(() => null), today);
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
          const { day, employeeId } = parsed.value;
          const targetId = employeeId ?? caller.uid;

          const ref = firestoreAdmin.collection("wfh_days").doc(wfhId(targetId, day));
          const snap = await ref.get();
          const data = snap.data();
          // Same answer for "not there" and "not yours", so ids cannot be probed across organizations.
          const notFound = Response.json({ error: "That day was not found." }, { status: 404 });
          if (!snap.exists || !data || data.orgId !== orgId) return notFound;
          if (targetId !== caller.uid) {
            const mayRemove =
              caller.role === "org_admin" || (caller.role === "manager" && data.managerId === caller.uid);
            if (!mayRemove) return notFound;
          }

          await ref.delete();
          logEvent({
            action: targetId === caller.uid ? "wfh.cancel" : "wfh.remove",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { day },
          });
          return Response.json({ ok: true });
        } catch (err) {
          console.error("DELETE /api/wfh error:", err);
          return Response.json({ error: "Could not cancel that day." }, { status: 500 });
        }
      },
    },
  },
});
