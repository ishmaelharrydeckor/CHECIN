/**
 * Moving an employee to another manager (design: docs/MANAGER-CHANGE-DESIGN.md).
 *
 * Only an organization admin may do it. Old check-ins, summaries and decided leave are never
 * rewritten; they keep the manager they were written with. These are the decisions, kept free of
 * Firebase so they can be tested on their own.
 */

/** The person's role, organization and manager as read from Firebase Auth claims (never the client). */
export interface ClaimsLike {
  role: string | null;
  orgId: string | null;
  managerId: string | null;
}

/** A move moves at most this many pending leave requests along with the person. */
export const MAX_PENDING_LEAVE_MOVED = 50;

export type MoveDecision = { ok: true } | { ok: false; status: number; error: string };

export function planManagerMove(input: {
  callerOrgId: string;
  targetUid: string;
  /** null when the person does not exist or is outside the caller's organization. */
  target: ClaimsLike | null;
  newManagerUid: string;
  /** null when the new manager does not exist or is outside the caller's organization. */
  newManager: ClaimsLike | null;
}): MoveDecision {
  const { callerOrgId, targetUid, target, newManagerUid, newManager } = input;

  if (!targetUid || !newManagerUid) {
    return { ok: false, status: 400, error: "Choose a person and a manager." };
  }
  if (!target || target.orgId !== callerOrgId) {
    return { ok: false, status: 404, error: "That person was not found in your organization." };
  }
  if (target.role !== "employee") {
    return {
      ok: false,
      status: 400,
      error: "Only employees can be moved to another manager. To change a manager's team, move the people in it.",
    };
  }
  if (!newManager || newManager.orgId !== callerOrgId) {
    return { ok: false, status: 400, error: "The new manager was not found in your organization." };
  }
  if (newManager.role !== "manager" && newManager.role !== "org_admin") {
    return { ok: false, status: 400, error: "Choose a manager (or an administrator), not an employee." };
  }
  if (newManagerUid === targetUid) {
    return { ok: false, status: 400, error: "A person cannot be their own manager." };
  }
  if (target.managerId === newManagerUid) {
    return { ok: false, status: 400, error: "That person is already on this team." };
  }
  return { ok: true };
}

/**
 * People who would be left without a manager if this manager stopped being one. `teamUids` are the
 * people whose manager is `managerUid`; the manager themself is always in that set and does not count.
 */
export function peopleLeftBehind(teamUids: readonly string[], managerUid: string): string[] {
  return teamUids.filter((uid) => uid !== managerUid);
}
