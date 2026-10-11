import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit, sanitizeRateLimitKey } from "@/lib/rate-limit.server";
import { resolveDashboardScope, type DashboardScope } from "@/lib/dashboard-scope";
import type { ReportLeave } from "@/lib/report-data";

/**
 * Shared server pieces for the two on-demand reports (/api/reports/register and /api/reports/leave).
 *
 * Who may ask, and how much they see, comes ONLY from the verified token (dashboard-scope.ts): an
 * org admin gets the whole organization, a manager only their own team, everyone else is refused.
 * Nothing about identity, role or organization is read from the request.
 */

/** Reports are on demand and read a lot, so each person gets a small hourly allowance. */
export const REPORTS_PER_HOUR = 60;
/** The most leave requests one report reads. A larger organization gets a "first N results" note. */
export const LEAVE_READ_CAP = 1500;
/** Holidays are a short list per organization. */
export const HOLIDAY_READ_CAP = 500;

export async function authorizeReportCaller(
  request: Request,
): Promise<{ scope: DashboardScope } | { response: Response }> {
  const caller = await verifyCallerToken(request.headers.get("authorization"));
  if (!caller || !caller.uid) {
    return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const scope = resolveDashboardScope(caller);
  if (!scope) {
    return {
      response: Response.json(
        { error: "Only an organization admin or manager can run reports" },
        { status: 403 },
      ),
    };
  }
  const limit = await checkRateLimit(sanitizeRateLimitKey(`reports_${scope.uid}`), {
    limit: REPORTS_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      response: Response.json(
        { error: "You have run a lot of reports. Please try again a little later." },
        { status: 429 },
      ),
    };
  }
  return { scope };
}

/** The organization's holiday dates ("YYYY-MM-DD"). Equality filter only, so no extra index. */
export async function loadHolidayDays(orgId: string): Promise<string[]> {
  const snap = await firestoreAdmin
    .collection("holidays")
    .where("orgId", "==", orgId)
    .limit(HOLIDAY_READ_CAP)
    .get();
  return snap.docs.map((d) => d.data().date).filter((v): v is string => typeof v === "string");
}

/**
 * Leave requests in the caller's scope (a manager sees only their own team's). Equality filters
 * only, so no extra index; the caller narrows by date. `status` limits the read when only
 * approved leave matters.
 */
export async function loadScopedLeave(
  scope: DashboardScope,
  status?: "approved",
): Promise<{ leaves: ReportLeave[]; truncated: boolean }> {
  let query: FirebaseFirestore.Query = firestoreAdmin
    .collection("leave_requests")
    .where("orgId", "==", scope.orgId);
  if (scope.role === "manager") query = query.where("managerId", "==", scope.uid);
  if (status) query = query.where("status", "==", status);
  const snap = await query.limit(LEAVE_READ_CAP).get();
  return {
    leaves: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReportLeave, "id">) })),
    truncated: snap.size >= LEAVE_READ_CAP,
  };
}
