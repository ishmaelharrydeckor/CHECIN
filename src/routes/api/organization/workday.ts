import { createFileRoute } from "@tanstack/react-router";
import { FieldValue } from "firebase-admin/firestore";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { loadStandardWorkday } from "@/lib/standard-workday.server";
import { parseWorkdayInput } from "@/lib/standard-workday";

/**
 * The organization's standard workday: how long a day is, and which weekdays, for people who have no shift. It only
 * gives those people an expected time on the timesheet (docs/TIMESHEET-DESIGN.md). Optional: until it is set, they
 * have none.
 *
 *  GET  an org admin or a manager sees it.
 *  PUT  an org admin sets it ({ minutes, workDays }) or removes it ({ clear: true }).
 *
 * Who is asking and for which organization come from the verified token only; nothing identity-related is read from
 * the request. The setting is stored on the organization's own document, which no browser can write.
 */
export const Route = createFileRoute("/api/organization/workday")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) return Response.json({ error: "Not authenticated" }, { status: 401 });
          if (caller.role !== "org_admin" && caller.role !== "manager") {
            return Response.json({ error: "Only an organization admin or manager can see this." }, { status: 403 });
          }
          return Response.json({ ok: true, workday: await loadStandardWorkday(orgId) }, { headers: { "Cache-Control": "private, no-store" } });
        } catch (err) {
          console.error("GET /api/organization/workday error:", err);
          return Response.json({ error: "Could not load the standard workday." }, { status: 500 });
        }
      },

      PUT: async ({ request }) => {
        const cid = correlationId(request);
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) return Response.json({ error: "Not authenticated" }, { status: 401 });
          if (caller.role !== "org_admin") {
            logEvent({ action: "org.workday.set", outcome: "denied", correlationId: cid, orgId, uid: caller.uid });
            return Response.json({ error: "Only an organization admin can change the standard workday." }, { status: 403 });
          }

          const rate = await checkRateLimit(`org_workday_${caller.uid}`, { limit: 30, windowMs: 60 * 60 * 1000 });
          if (!rate.allowed) {
            return Response.json({ error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` }, { status: 429 });
          }

          const parsed = parseWorkdayInput(await request.json().catch(() => null));
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

          const now = new Date().toISOString();
          await firestoreAdmin
            .collection("organizations")
            .doc(orgId)
            .set(
              parsed.value
                ? { standardDayMinutes: parsed.value.minutes, workDays: parsed.value.workDays, updatedAt: now }
                : { standardDayMinutes: FieldValue.delete(), workDays: FieldValue.delete(), updatedAt: now },
              { merge: true },
            );

          logEvent({
            action: "org.workday.set",
            outcome: "ok",
            correlationId: cid,
            orgId,
            uid: caller.uid,
            fields: parsed.value ? { minutes: parsed.value.minutes, days: parsed.value.workDays.length } : { cleared: true },
          });
          return Response.json({ ok: true, workday: parsed.value });
        } catch (err) {
          console.error("PUT /api/organization/workday error:", err);
          return Response.json({ error: "Could not save the standard workday." }, { status: 500 });
        }
      },
    },
  },
});
