import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { formatClock } from "@/lib/attendance-today";
import { summaryDocId } from "@/lib/daily-summary";
import { loadOrgToday } from "@/lib/org-day.server";
import { buildReviewRows, windowStart, type ExcuseDetail } from "@/lib/late-excuse";

const OWN_SUMMARY_CAP = 40;

/**
 * GET /api/attendance/late-mine: the signed-in person's OWN late days inside the excusable window,
 * with their note and whether a manager excused each one (docs/LATE-EXCUSE-DESIGN.md). Nothing in
 * the request chooses the person: it is always the caller. Reads the caller's summaries for at most
 * 15 days and their excuse documents by id, so it is bounded and needs no extra index.
 */
export const Route = createFileRoute("/api/attendance/late-mine")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) return Response.json({ error: "Not authenticated" }, { status: 401 });
          if (caller.role !== "org_admin" && caller.role !== "manager" && caller.role !== "employee") {
            return Response.json({ error: "You do not have access to this." }, { status: 403 });
          }

          const orgSnap = await firestoreAdmin.collection("organizations").doc(orgId).get();
          const rawTz = orgSnap.exists ? orgSnap.data()?.timezone : undefined;
          const timezone = typeof rawTz === "string" && rawTz.trim().length > 0 ? rawTz.trim() : "UTC";
          const today = await loadOrgToday(orgId);
          const from = windowStart(today);

          const snap = await firestoreAdmin
            .collection("daily_summaries")
            .where("orgId", "==", orgId)
            .where("employeeId", "==", caller.uid)
            .where("dayKey", ">=", from)
            .where("dayKey", "<=", today)
            .limit(OWN_SUMMARY_CAP)
            .get();
          const summaries = snap.docs.map((d) => d.data());
          const lateDays = summaries.filter((s) => s.late === true && s.firstIn).map((s) => String(s.dayKey));

          const excuses = new Map<string, ExcuseDetail>();
          if (lateDays.length > 0) {
            const refs = lateDays.map((day) =>
              firestoreAdmin.collection("late_excuses").doc(summaryDocId(caller.uid, day)),
            );
            const docs = await firestoreAdmin.getAll(...refs);
            for (const d of docs) {
              if (d.exists && d.data()?.orgId === orgId) excuses.set(d.id, d.data() as ExcuseDetail);
            }
          }

          const { rows } = buildReviewRows({
            summaries,
            excuses,
            clock: (iso) => formatClock(iso, timezone),
          });
          return Response.json(
            { ok: true, rows, today, windowStart: from },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (err) {
          console.error("GET /api/attendance/late-mine error:", err);
          return Response.json({ error: "Could not load your late days." }, { status: 500 });
        }
      },
    },
  },
});
