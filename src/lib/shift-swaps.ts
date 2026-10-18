/**
 * Pure rules for shift swaps (task 3.1, phase 7; see docs/SHIFTS-DESIGN.md, the "Shift swaps" row in
 * section 3b and `shift_swaps` in section 4).
 *
 * One person (the proposer) offers to swap their shift on one date with a colleague's. The colleague
 * accepts or declines; then the manager of both, or an org admin, approves or rejects. Only on approval
 * does the server exchange the two assignments, in one transaction, using `swapAssignments`.
 *
 * Statuses only move: pending -> accepted -> approved, or to declined / cancelled at the allowed
 * points. A final status never moves again, which is what stops a retried approval swapping twice.
 *
 * No Firebase, no `@/` imports and no clock reads (`today` and `at` are passed in), so every rule
 * can be tested directly with the Node test runner.
 */
import type { ShiftSnapshot } from "./shift-engine.ts";

export const SWAP_STATUSES = ["pending", "accepted", "approved", "declined", "cancelled"] as const;
export type SwapStatus = (typeof SWAP_STATUSES)[number];
export const SWAP_ACTIONS = ["accept", "decline", "cancel", "approve", "reject"] as const;
export type SwapAction = (typeof SWAP_ACTIONS)[number];
export const SWAP_NOTE_MAX_LENGTH = 200;
const MAX_REQUEST_ID_LENGTH = 64;

/** The parts of a stored swap the rules need. Managers are copied from the two people's claims. */
export interface SwapParties {
  proposerId: string;
  colleagueId: string;
  proposerManagerId: string | null;
  colleagueManagerId: string | null;
  status: string;
}

/** The verified caller, from the ID token only. */
export interface SwapCaller {
  uid: string;
  role: string | null;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
export type Decision = { ok: true; next: SwapStatus } | { ok: false; status: 400 | 403 | 409; error: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(key: unknown): key is string {
  if (typeof key !== "string" || !DAY_RE.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function isCleanId(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && !v.includes("/");
}

/** Pending and accepted swaps are still open; approved, declined and cancelled are final. */
export function isOpenSwap(status: unknown): boolean {
  return status === "pending" || status === "accepted";
}

/** Who may approve: the shared manager or an admin, or (different managers) an admin only. */
export function approverRule(
  proposerManagerId: string | null,
  colleagueManagerId: string | null,
): "manager_or_admin" | "admin_only" {
  return proposerManagerId !== null && proposerManagerId === colleagueManagerId ? "manager_or_admin" : "admin_only";
}

/** Deterministic id for one proposal request, so a retried propose writes the same document. */
export function swapDocId(proposerId: string, dayKey: string, requestId: string): string {
  if (!isCleanId(proposerId) || !isCleanId(requestId) || !isRealDay(dayKey)) {
    throw new Error("proposerId, dayKey and requestId must be valid and contain no '/'.");
  }
  return `${proposerId}_${dayKey}_${requestId}`;
}

function canApprove(swap: SwapParties, caller: SwapCaller): boolean {
  // Nobody approves a swap they are part of, even a manager swapping with their own report.
  if (caller.uid === swap.proposerId || caller.uid === swap.colleagueId) {
    return false;
  }
  if (caller.role === "org_admin") return true;
  return (
    caller.role === "manager" &&
    approverRule(swap.proposerManagerId, swap.colleagueManagerId) === "manager_or_admin" &&
    swap.proposerManagerId === caller.uid
  );
}

const STATUS_WORDS: Record<string, string> = {
  pending: "still waiting for your colleague",
  accepted: "already accepted and waiting for a manager",
  approved: "already approved",
  declined: "already declined",
  cancelled: "already cancelled",
};

function wrongStatus(status: string): Decision {
  return {
    ok: false,
    status: 409,
    error: `This swap is ${STATUS_WORDS[status] ?? "no longer open"}, so that cannot be done now.`,
  };
}

/**
 * Whether `caller` may do `action` to `swap` now, and the status it moves to. The route calls this
 * inside the transaction, on the freshly read swap, so two people acting at once cannot both win.
 */
export function decideSwapAction(swap: SwapParties | null, caller: SwapCaller | null, action: string): Decision {
  if (!swap || typeof swap !== "object" || !caller || !isCleanId(caller.uid)) {
    return { ok: false, status: 403, error: "You cannot change this swap." };
  }
  if (!(SWAP_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, status: 400, error: "Choose accept, decline, cancel, approve or reject." };
  }
  const isColleague = caller.uid === swap.colleagueId;
  const isProposer = caller.uid === swap.proposerId;

  switch (action as SwapAction) {
    case "accept":
    case "decline":
      if (!isColleague) {
        return { ok: false, status: 403, error: "Only the colleague asked can accept or decline this swap." };
      }
      if (swap.status !== "pending") return wrongStatus(swap.status);
      return { ok: true, next: action === "accept" ? "accepted" : "declined" };
    case "cancel":
      if (!isProposer) return { ok: false, status: 403, error: "Only the person who asked can cancel this swap." };
      if (!isOpenSwap(swap.status)) return wrongStatus(swap.status);
      return { ok: true, next: "cancelled" };
    case "approve":
    case "reject":
      if (!canApprove(swap, caller)) {
        return {
          ok: false,
          status: 403,
          error:
            approverRule(swap.proposerManagerId, swap.colleagueManagerId) === "admin_only"
              ? "These two people have different managers, so only an organization admin can decide this swap."
              : "Only their manager or an organization admin can decide this swap.",
        };
      }
      if (swap.status !== "accepted") return wrongStatus(swap.status);
      return { ok: true, next: action === "approve" ? "approved" : "declined" };
  }
}

/** The two people, either person's manager, and org admins. Nobody else. */
export function canSeeSwap(swap: SwapParties | null, caller: SwapCaller | null): boolean {
  if (!swap || !caller || !isCleanId(caller.uid)) return false;
  if (caller.role === "org_admin") return true;
  if (caller.uid === swap.proposerId || caller.uid === swap.colleagueId) return true;
  return caller.role === "manager" && (swap.proposerManagerId === caller.uid || swap.colleagueManagerId === caller.uid);
}

export interface SwapPerson {
  uid: string;
  /** That day's assignment, or null when the person has no shift. */
  assignment: { shiftId: string; shift: ShiftSnapshot | null } | null;
  /** Approved leave covers the day. */
  onLeave: boolean;
  /** Attendance is already recorded for them today (only matters when the day is today). */
  recordedToday: boolean;
}

/**
 * The checks made when a swap is proposed and again when it is approved, because leave, holidays,
 * assignments and attendance can all change in between.
 */
export function checkSwapEligibility(input: {
  today: string;
  dayKey: string;
  holiday: boolean;
  proposer: SwapPerson;
  colleague: SwapPerson;
}): { ok: true } | { ok: false; error: string } {
  const { today, dayKey, holiday, proposer, colleague } = input;
  if (!isRealDay(today) || !isRealDay(dayKey)) return { ok: false, error: "Choose a valid date." };
  if (dayKey < today) return { ok: false, error: "Shifts on past dates cannot be swapped." };
  if (proposer.uid === colleague.uid) return { ok: false, error: "Choose a colleague, not yourself." };
  if (!proposer.assignment) return { ok: false, error: "You have no shift on that day to swap." };
  if (!colleague.assignment) return { ok: false, error: "Your colleague has no shift on that day to swap." };
  if (proposer.assignment.shiftId === colleague.assignment.shiftId) {
    return { ok: false, error: "You are both on the same shift that day, so there is nothing to swap." };
  }
  if (holiday) return { ok: false, error: "That day is a public holiday, so it cannot be swapped." };
  if (proposer.onLeave) return { ok: false, error: "You are on approved leave that day." };
  if (colleague.onLeave) return { ok: false, error: "Your colleague is on approved leave that day." };
  if (dayKey === today && (proposer.recordedToday || colleague.recordedToday)) {
    return { ok: false, error: "Attendance is already recorded for today, so today's shifts cannot be swapped." };
  }
  return { ok: true };
}

export interface ProposeRequest {
  colleagueId: string;
  dayKey: string;
  note: string;
  requestId: string;
}

const PROPOSE_KEYS = new Set(["colleagueId", "dayKey", "note", "requestId"]);

/**
 * A proposal from the screen. The proposer is always the caller (from the token), so any field naming
 * a person, organization, manager, role or status is refused rather than silently ignored.
 */
export function parseProposeRequest(raw: unknown, today: string): Parsed<ProposeRequest> {
  if (!isRealDay(today)) return { ok: false, error: "Today's date is required." };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Choose a colleague and a date." };
  }
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (!PROPOSE_KEYS.has(key)) return { ok: false, error: "This request has a field that is not allowed." };
  }
  if (!isCleanId(r.colleagueId)) return { ok: false, error: "Choose a colleague to swap with." };
  if (!isRealDay(r.dayKey)) return { ok: false, error: "Choose a valid date." };
  if (r.dayKey < today) return { ok: false, error: "Shifts on past dates cannot be swapped." };
  let note = "";
  if (r.note !== undefined && r.note !== null) {
    if (typeof r.note !== "string") return { ok: false, error: "The note must be text." };
    note = r.note.trim();
    if (note.length > SWAP_NOTE_MAX_LENGTH) {
      return { ok: false, error: `Keep the note to ${SWAP_NOTE_MAX_LENGTH} characters or fewer.` };
    }
  }
  if (!isCleanId(r.requestId) || r.requestId.length > MAX_REQUEST_ID_LENGTH) {
    return { ok: false, error: "Something went wrong with this request. Please reload the page and try again." };
  }
  return { ok: true, value: { colleagueId: r.colleagueId.trim(), dayKey: r.dayKey, note, requestId: r.requestId.trim() } };
}

/** An action on an existing swap: its id and one of the five actions. */
export function parseSwapActionRequest(raw: unknown): Parsed<{ swapId: string; action: SwapAction }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Choose a swap." };
  const r = raw as Record<string, unknown>;
  if (!isCleanId(r.swapId) || r.swapId.length > 200) return { ok: false, error: "Choose a swap." };
  if (typeof r.action !== "string" || !(SWAP_ACTIONS as readonly string[]).includes(r.action)) {
    return { ok: false, error: "Choose accept, decline, cancel, approve or reject." };
  }
  return { ok: true, value: { swapId: r.swapId.trim(), action: r.action as SwapAction } };
}

/** A stored `shift_assignments` document, as far as a swap cares. */
export interface AssignmentDoc {
  orgId: string;
  managerId: string | null;
  employeeId: string;
  employeeName: string;
  dayKey: string;
  shiftId: string;
  shift: ShiftSnapshot | null;
  patternId?: string | null;
  [key: string]: unknown;
}

function isShiftSnapshot(v: unknown): v is ShiftSnapshot {
  return !!v && typeof v === "object" && typeof (v as ShiftSnapshot).shiftId === "string";
}

/**
 * The two documents after the swap: each person keeps their own identity (organization, manager,
 * name, day) and takes the other's shift. A swapped day counts as assigned by hand, so `patternId`
 * is dropped and no repeating pattern can rewrite it later. Inputs are not changed.
 */
export function swapAssignments(input: {
  proposer: AssignmentDoc | null;
  colleague: AssignmentDoc | null;
  swapId: string;
  approvedBy: string;
  at: string;
}): Parsed<{ proposer: AssignmentDoc; colleague: AssignmentDoc }> {
  const { proposer: p, colleague: c, swapId, approvedBy, at } = input;
  if (!p || !c) return { ok: false, error: "One of the two shifts no longer exists." };
  if (!isCleanId(swapId) || !isCleanId(approvedBy) || typeof at !== "string" || !at) {
    return { ok: false, error: "The swap is missing who approved it or when." };
  }
  if (p.orgId !== c.orgId) return { ok: false, error: "These shifts belong to different organizations." };
  if (p.dayKey !== c.dayKey) return { ok: false, error: "These shifts are on different days." };
  if (p.employeeId === c.employeeId) return { ok: false, error: "Both shifts belong to the same person." };
  if (!isShiftSnapshot(p.shift) || !isShiftSnapshot(c.shift)) {
    return { ok: false, error: "One of the two shifts has damaged details." };
  }
  if (p.shiftId === c.shiftId) {
    return { ok: false, error: "Both people are now on the same shift, so there is nothing to swap." };
  }

  const take = (own: AssignmentDoc, other: AssignmentDoc): AssignmentDoc => {
    const { patternId: _dropped, ...rest } = own;
    return {
      ...rest,
      shiftId: other.shiftId,
      shift: { ...(other.shift as ShiftSnapshot) },
      assignedBy: approvedBy,
      assignedAt: at,
      swapId,
    };
  };
  return { ok: true, value: { proposer: take(p, c), colleague: take(c, p) } };
}
