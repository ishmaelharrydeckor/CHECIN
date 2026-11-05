import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { parseRefusedQuery } from "@/lib/shift-rota";

/**
 * GET /api/shifts/refused-scans?limit=&cursor=
 *
 * The short notes written when a check-in was refused for being outside a shift's allowed time (see
 * docs/SHIFTS-DESIGN.md). They are not attendance records. Org admins see the whole organization and
 * managers only their own team; employees get 403. Who is calling and which organization both come from
 * the verified token, never from the request. Newest first, one page at a time (`cursor` is the `at` of
 * the last note already shown).
 */
export const Route = createFileRoute("/api/shifts/refused-scans")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (caller.role !== "org_admin" && caller.role !== "manager") {
            return Response.json(
              { error: "Only an organization admin or manager can see refused check-ins." },
              { status: 403 },
            );
          }

          const url = new URL(request.url);
          const parsed = parseRefusedQuery(url.searchParams.get("limit"), url.searchParams.get("cursor"));
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
          const { pageSize, cursor } = parsed;

          let query: FirebaseFirestore.Query = firestoreAdmin.collection("refused_scans").where("orgId", "==", orgId);
          if (caller.role === "manager") query = query.where("managerId", "==", caller.uid);
          query = query.orderBy("at", "desc");
          if (cursor) query = query.startAfter(cursor);

          // One extra document tells us whether there is another page, without a second read.
          const [snap, orgSnap] = await Promise.all([
            query.limit(pageSize + 1).get(),
            firestoreAdmin.collection("organizations").doc(orgId).get(),
          ]);
          const rawTz = orgSnap.exists ? orgSnap.data()?.timezone : undefined;
          const timezone = typeof rawTz === "string" && rawTz.trim().length > 0 ? rawTz.trim() : "UTC";

          const str = (v: unknown) => (typeof v === "string" ? v : "");
          const docs = snap.docs.slice(0, pageSize);
          const notes = docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              employeeId: str(x.employeeId),
              employeeName: str(x.employeeName) || "Employee",
              at: str(x.at),
              reason: str(x.reason),
              shiftName: str(x.shiftName),
              shiftStart: typeof x.shiftStart === "string" ? x.shiftStart : null,
              shiftEnd: typeof x.shiftEnd === "string" ? x.shiftEnd : null,
              opensAt: str(x.opensAt),
              closesAt: str(x.closesAt),
              recorded: x.recorded === true,
            };
          });
          const hasMore = snap.docs.length > pageSize;
          const nextCursor = hasMore && notes.length > 0 ? notes[notes.length - 1].at : null;

          return Response.json(
            { ok: true, notes, hasMore, nextCursor, timezone },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (err) {
          console.error("GET /api/shifts/refused-scans error:", err);
          return Response.json({ error: "Could not load refused check-ins." }, { status: 500 });
        }
      },
    },
  },
});
