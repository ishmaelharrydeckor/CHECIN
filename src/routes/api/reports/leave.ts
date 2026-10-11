import { createFileRoute } from "@tanstack/react-router";
import { loadOrgContext } from "@/lib/attendance-data.server";
import { authorizeReportCaller, loadScopedLeave } from "@/lib/report-data.server";
import { buildLeaveLedger, parseReportRange } from "@/lib/report-data";

/**
 * GET /api/reports/leave?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The leave ledger: every leave request in the caller's scope that overlaps the date range, with
 * the person's name, the readable leave type, the number of days, the status and the day it was
 * decided (in the organization's timezone). An org admin gets the whole organization, a manager
 * their own team (decided by the verified token only). At most 31 days.
 */
export const Route = createFileRoute("/api/reports/leave")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authorizeReportCaller(request);
          if ("response" in auth) return auth.response;
          const { scope } = auth;

          const url = new URL(request.url);
          const range = parseReportRange(url.searchParams.get("from"), url.searchParams.get("to"));
          if (!range.ok) return Response.json({ error: range.error }, { status: 400 });

          const [{ timezone, roster }, leave] = await Promise.all([
            loadOrgContext(scope),
            loadScopedLeave(scope),
          ]);

          const ledger = buildLeaveLedger({
            people: roster,
            leaves: leave.leaves,
            timezone,
            generatedAt: new Date().toISOString(),
            from: range.from,
            to: range.to,
            readTruncated: leave.truncated,
          });
          return Response.json(
            { ok: true, report: ledger },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        } catch (err: any) {
          console.error("GET /api/reports/leave error:", err);
          return Response.json({ error: "Could not build the leave ledger" }, { status: 500 });
        }
      },
    },
  },
});
