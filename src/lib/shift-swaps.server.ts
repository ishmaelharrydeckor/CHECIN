/**
 * Server side of shift swaps (task 3.1, phase 7). The rules are in `shift-swaps.ts`; this file only
 * reads Firestore and Firebase Auth. Every person's role, organization and manager comes from their
 * verified custom claims, never from a profile document or the request.
 */
import { firestoreAdmin, getAuthAdmin } from "@/integrations/firebase/admin.server";
import { dayKey } from "./attendance-day.ts";
import { summaryDocId } from "./daily-summary.ts";
import { assignmentId, type ShiftSnapshot } from "./shift-engine.ts";
import { assignmentFromDoc } from "./shift-scan.ts";
import { dayCoveredByLeave } from "./wfh.ts";
import type { SwapParty, SwapPerson } from "./shift-swaps.ts";

export const SWAPS = "shift_swaps";
export const SWAP_LIST_CAP = 100;
const LEAVE_CHECK_CAP = 200;

export interface SwapOrgContext {
  today: string;
  swapsEnabled: boolean;
}

/** The organization's day (its own timezone, UTC when none) and whether swaps are switched on. */
export async function loadSwapOrg(orgId: string): Promise<SwapOrgContext> {
  const snap = await firestoreAdmin.collection("organizations").doc(orgId).get();
  const data = snap.exists ? snap.data() : undefined;
  const rawTz = data?.timezone;
  const tz = typeof rawTz === "string" && rawTz.trim().length > 0 ? rawTz.trim() : "UTC";
  return {
    today: dayKey(Date.now(), tz) || new Date().toISOString().slice(0, 10),
    swapsEnabled: data?.shiftSwapsEnabled === true,
  };
}

export interface ClaimedPerson {
  uid: string;
  role: string | null;
  managerId: string | null;
  authName: string;
}

/** Each person's role and manager from their claims, only for people in `orgId`. */
export async function loadClaimedPeople(orgId: string, uids: string[]): Promise<Map<string, ClaimedPerson>> {
  const out = new Map<string, ClaimedPerson>();
  const unique = [...new Set(uids)];
  if (unique.length === 0) return out;
  const res = await getAuthAdmin().getUsers(unique.map((uid) => ({ uid })));
  for (const u of res.users) {
    const claims = u.customClaims ?? {};
    if (claims.orgId !== orgId) continue;
    const role = typeof claims.role === "string" ? claims.role : null;
    const managerId =
      typeof claims.managerId === "string" ? claims.managerId : role === "manager" ? u.uid : null;
    out.set(u.uid, { uid: u.uid, role, managerId, authName: u.displayName || "" });
  }
  return out;
}

/** Only staff who can hold shifts take part in swaps. */
export function canHoldShifts(person: ClaimedPerson | undefined): person is ClaimedPerson {
  return !!person && (person.role === "employee" || person.role === "manager");
}

/** True when the organization's holiday calendar has `day`. Equality filters only, so no extra index. */
export async function isHoliday(orgId: string, day: string): Promise<boolean> {
  const snap = await firestoreAdmin
    .collection("holidays")
    .where("orgId", "==", orgId)
    .where("date", "==", day)
    .limit(1)
    .get();
  return !snap.empty;
}

/** Approved leave covering `day` for this person. Equality filters only; the date is checked here. */
export async function isOnLeave(orgId: string, uid: string, day: string): Promise<boolean> {
  const snap = await firestoreAdmin
    .collection("leave_requests")
    .where("orgId", "==", orgId)
    .where("employeeId", "==", uid)
    .where("status", "==", "approved")
    .limit(LEAVE_CHECK_CAP)
    .get();
  return dayCoveredByLeave([day], snap.docs.map((d) => d.data())) !== null;
}

/**
 * Everything the eligibility check needs about one person on one day, read outside a transaction
 * (proposal). Approval reads the assignments and today's attendance again inside its transaction.
 */
export async function loadSwapPerson(
  orgId: string,
  person: ClaimedPerson,
  day: string,
  today: string,
): Promise<{ check: SwapPerson; party: SwapParty | null }> {
  const assignmentRef = firestoreAdmin.collection("shift_assignments").doc(assignmentId(person.uid, day));
  const userRef = firestoreAdmin.collection("users").doc(person.uid);
  const summaryRef = firestoreAdmin.collection("daily_summaries").doc(summaryDocId(person.uid, today));
  const [assignmentSnap, userSnap, summarySnap] = await firestoreAdmin.getAll(assignmentRef, userRef, summaryRef);
  const onLeave = await isOnLeave(orgId, person.uid, day);

  const parsed = assignmentSnap.exists ? assignmentFromDoc(assignmentSnap.data(), orgId, day) : null;
  const assignment = parsed ? { shiftId: parsed.shift.shiftId, shift: parsed.shift as ShiftSnapshot } : null;
  const profileName = userSnap.exists ? String(userSnap.data()?.displayName ?? "").trim() : "";
  const name = (profileName || person.authName || "Employee").slice(0, 80);

  return {
    check: { uid: person.uid, assignment, onLeave, recordedToday: day === today && summarySnap.exists },
    party: assignment ? { uid: person.uid, name, managerId: person.managerId, assignment } : null,
  };
}
