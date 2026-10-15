import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { createTtlCache } from "./ttl-cache.server.ts";
import type { DashboardScope } from "./dashboard-scope.ts";
import type { RawEvent, RosterMember, TodayLeave } from "./attendance-today.ts";
import type { DailySummary } from "./daily-summary.ts";
import { IN_QUERY_LIMIT, chunk, mergeByKey, movedInMembers } from "./manager-history.ts";
import { readShiftSettings, type ShiftSettings } from "./shift-requests.ts";
import { assignmentFromDoc } from "./shift-scan.ts";
import type { ShiftSnapshot } from "./shift-engine.ts";

/**
 * Data access for the manager dashboard routes (/api/attendance/today and /week).
 *
 * Every query here is scoped by the DashboardScope derived from the verified
 * token (see dashboard-scope.ts): an org admin sees the whole organization, a
 * manager only managerId == their own uid.
 */

export const TODAY_EVENT_CAP = 1500;
export const WEEK_EVENT_CAP = 4000;
/** Most summaries one dashboard answer reads: 2,000 people, or a few days of a smaller team. */
export const SUMMARY_CAP = 2000;
export const WEEK_SUMMARY_CAP = 6000;
/** Most approved-leave documents one dashboard answer reads. */
export const TODAY_LEAVE_CAP = 1500;
/** The activity list on the dashboard only ever shows this many events. */
export const RECENT_EVENT_LIMIT = 20;
export const SHIFT_ASSIGNMENT_CAP_TODAY = 4000;
export const SHIFT_ASSIGNMENT_CAP_RANGE = 12000;

interface OrgContext {
  timezone: string;
  roster: RosterMember[];
  shifts: ShiftSettings;
}

// The roster and timezone change rarely; caching them keeps a poll from re-reading every user.
const ORG_CONTEXT_TTL_MS = 5 * 60_000;
const orgContextCache = createTtlCache<OrgContext>(ORG_CONTEXT_TTL_MS);

function cacheKey(scope: DashboardScope): string {
  return `${scope.orgId}:${scope.role === "manager" ? scope.uid : "*"}`;
}

/** Organization timezone and the people this caller is responsible for. */
export async function loadOrgContext(scope: DashboardScope): Promise<OrgContext> {
  const key = cacheKey(scope);
  const cached = orgContextCache.get(key);
  if (cached) return cached;

  let usersQuery: FirebaseFirestore.Query = firestoreAdmin
    .collection("users")
    .where("orgId", "==", scope.orgId);
  if (scope.role === "manager") usersQuery = usersQuery.where("managerId", "==", scope.uid);

  const [orgSnap, usersSnap] = await Promise.all([
    firestoreAdmin.collection("organizations").doc(scope.orgId).get(),
    // Ceiling above the design maximum (1,000 per org); the P4 dashboard work replaces this read with summaries.
    usersQuery.limit(2000).get(),
  ]);

  const timezone = (orgSnap.exists && (orgSnap.data()?.timezone as string)) || "UTC";
  const shifts = readShiftSettings(orgSnap.exists ? orgSnap.data() : undefined);
  const roster: RosterMember[] = usersSnap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      displayName: data.displayName || undefined,
      email: data.email || undefined,
      department: data.department || undefined,
      managerChangedAt: typeof data.managerChangedAt === "string" ? data.managerChangedAt : undefined,
    };
  });

  const value = { timezone, roster, shifts };
  orgContextCache.set(key, value);
  return value;
}

/** Clock events for the caller's scope in [startMs, endMs), newest first, capped. */
export async function loadScopedEvents(
  scope: DashboardScope,
  startMs: number,
  endMs: number,
  cap: number,
): Promise<{ events: RawEvent[]; truncated: boolean }> {
  let query: FirebaseFirestore.Query = firestoreAdmin
    .collection("clock_events")
    .where("orgId", "==", scope.orgId);
  if (scope.role === "manager") query = query.where("managerId", "==", scope.uid);

  const snap = await query
    .where("timestamp", ">=", new Date(startMs).toISOString())
    .where("timestamp", "<", new Date(endMs).toISOString())
    .orderBy("timestamp", "desc")
    .limit(cap)
    .get();

  const events: RawEvent[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.voidedAt) continue; // undone by the employee
    if (!d.employeeId || !d.timestamp || (d.type !== "in" && d.type !== "out")) continue;
    events.push({
      id: doc.id,
      employeeId: d.employeeId,
      employeeName: d.employeeName,
      employeeEmail: d.employeeEmail,
      department: d.department,
      locationName: d.locationName,
      type: d.type,
      timestamp: d.timestamp,
      late: d.late === true,
      earlyDeparture: d.earlyDeparture === true,
    });
  }
  return { events, truncated: snap.size >= cap };
}

/**
 * Daily summaries for the caller's scope for the days fromDay..toDay (inclusive,
 * "YYYY-MM-DD" in the org timezone). One document per person per day, so this
 * reads about (people x days) documents, not one per scan.
 */
export async function loadScopedSummaries(
  scope: DashboardScope,
  fromDay: string,
  toDay: string,
  cap: number,
): Promise<{ summaries: DailySummary[]; truncated: boolean }> {
  let query: FirebaseFirestore.Query = firestoreAdmin
    .collection("daily_summaries")
    .where("orgId", "==", scope.orgId);
  if (scope.role === "manager") query = query.where("managerId", "==", scope.uid);

  // A single day is an equality filter (no extra index); a range needs the
  // (orgId, dayKey) / (orgId, managerId, dayKey) indexes in firestore.indexes.json.
  query =
    fromDay === toDay
      ? query.where("dayKey", "==", fromDay)
      : query.where("dayKey", ">=", fromDay).where("dayKey", "<=", toDay);

  const snap = await query.limit(cap).get();
  let summaries = snap.docs.map((d) => d.data() as DailySummary);
  let truncated = snap.size >= cap;

  // A manager also sees the earlier days of people who joined their team during this range: those
  // days are filed under the previous manager, so they are found by employee id. A team where
  // nobody has moved in reads nothing extra. (docs/MANAGER-CHANGE-DESIGN.md)
  if (scope.role === "manager") {
    const { timezone, roster } = await loadOrgContext(scope);
    const moved = movedInMembers(roster, timezone, fromDay).filter((m) => m.uid !== scope.uid);
    if (moved.length > 0) {
      const batches = await Promise.all(
        chunk(
          moved.map((m) => m.uid),
          IN_QUERY_LIMIT,
        ).map(async (uids) => {
          let q: FirebaseFirestore.Query = firestoreAdmin
            .collection("daily_summaries")
            .where("orgId", "==", scope.orgId)
            .where("employeeId", "in", uids);
          q =
            fromDay === toDay
              ? q.where("dayKey", "==", fromDay)
              : q.where("dayKey", ">=", fromDay).where("dayKey", "<=", toDay);
          const extra = await q.limit(cap).get();
          return { rows: extra.docs.map((d) => d.data() as DailySummary), full: extra.size >= cap };
        }),
      );
      summaries = mergeByKey(summaries, batches.flatMap((b) => b.rows), (s) => `${s.employeeId}|${s.dayKey}`);
      truncated = truncated || batches.some((b) => b.full);
      if (summaries.length > cap) {
        summaries = summaries.slice(0, cap);
        truncated = true;
      }
    }
  }
  return { summaries, truncated };
}

/**
 * Approved leave that covers `day` for the caller's scope (a manager sees their own team's). The database
 * returns only leave that has not ended yet (`endDate >= day`), so old leave is never read; leave that
 * starts later is dropped here. Needs the (orgId, status, endDate) and (orgId, managerId, status, endDate)
 * indexes in firestore.indexes.json.
 */
export async function loadApprovedLeaveOnDay(
  scope: DashboardScope,
  day: string,
): Promise<{ leaves: TodayLeave[]; truncated: boolean }> {
  let query: FirebaseFirestore.Query = firestoreAdmin
    .collection("leave_requests")
    .where("orgId", "==", scope.orgId);
  if (scope.role === "manager") query = query.where("managerId", "==", scope.uid);
  const snap = await query
    .where("status", "==", "approved")
    .where("endDate", ">=", day)
    .limit(TODAY_LEAVE_CAP)
    .get();
  const leaves = snap.docs
    .map((d) => d.data() as TodayLeave)
    .filter((l) => typeof l.startDate === "string" && l.startDate <= day);
  return { leaves, truncated: snap.size >= TODAY_LEAVE_CAP };
}

/**
 * Shift assignments for the caller's scope in [fromDay, toDay] (inclusive, "YYYY-MM-DD").
 * An org admin sees the whole organization; a manager sees assignments where managerId == their uid.
 */
export async function loadShiftAssignments(
  scope: DashboardScope,
  fromDay: string,
  toDay: string,
  cap: number,
): Promise<{
  assignments: { employeeId: string; dayKey: string; shift: ShiftSnapshot }[];
  truncated: boolean;
}> {
  let query: FirebaseFirestore.Query = firestoreAdmin
    .collection("shift_assignments")
    .where("orgId", "==", scope.orgId);
  if (scope.role === "manager") query = query.where("managerId", "==", scope.uid);

  query =
    fromDay === toDay
      ? query.where("dayKey", "==", fromDay)
      : query.where("dayKey", ">=", fromDay).where("dayKey", "<=", toDay);

  const snap = await query.limit(cap).get();
  const assignments: { employeeId: string; dayKey: string; shift: ShiftSnapshot }[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const employeeId = typeof data.employeeId === "string" ? data.employeeId : "";
    if (!employeeId) continue;
    const parsed = assignmentFromDoc(data, scope.orgId);
    if (!parsed) continue;
    assignments.push({
      employeeId,
      dayKey: parsed.dayKey,
      shift: parsed.shift,
    });
  }
  return { assignments, truncated: snap.size >= cap };
}

/** The most work-from-home days one dashboard or register read returns. */
export const WFH_TODAY_CAP = 2000;
export const WFH_RANGE_CAP = 6000;

/**
 * Work-from-home days for the caller's scope in [fromDay, toDay] (inclusive). An org admin sees the
 * whole organization; a manager sees days filed under them. Needs the wfh_days (orgId, dayKey) and
 * (orgId, managerId, dayKey) indexes.
 */
export async function loadWfhRange(
  scope: DashboardScope,
  fromDay: string,
  toDay: string,
  cap: number,
): Promise<{ days: { employeeId: string; dayKey: string }[]; truncated: boolean }> {
  let query: FirebaseFirestore.Query = firestoreAdmin.collection("wfh_days").where("orgId", "==", scope.orgId);
  if (scope.role === "manager") query = query.where("managerId", "==", scope.uid);
  query =
    fromDay === toDay
      ? query.where("dayKey", "==", fromDay)
      : query.where("dayKey", ">=", fromDay).where("dayKey", "<=", toDay);
  const snap = await query.limit(cap).get();
  const days: { employeeId: string; dayKey: string }[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.employeeId === "string" && typeof data.dayKey === "string") {
      days.push({ employeeId: data.employeeId, dayKey: data.dayKey });
    }
  }
  return { days, truncated: snap.size >= cap };
}
