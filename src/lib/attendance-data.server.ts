import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { createTtlCache } from "./ttl-cache.server.ts";
import type { DashboardScope } from "./dashboard-scope.ts";
import type { RawEvent, RosterMember } from "./attendance-today.ts";

/**
 * Data access for the manager dashboard routes (/api/attendance/today and /week).
 *
 * Every query here is scoped by the DashboardScope derived from the verified
 * token (see dashboard-scope.ts): an org admin sees the whole organization, a
 * manager only managerId == their own uid.
 */

export const TODAY_EVENT_CAP = 1500;
export const WEEK_EVENT_CAP = 4000;

interface OrgContext {
  timezone: string;
  roster: RosterMember[];
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
  const roster: RosterMember[] = usersSnap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      displayName: data.displayName || undefined,
      email: data.email || undefined,
      department: data.department || undefined,
    };
  });

  const value = { timezone, roster };
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
