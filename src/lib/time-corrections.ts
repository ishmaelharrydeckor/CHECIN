/**
 * Time corrections for a forgotten check-out (docs/PAYROLL-OVERTIME-DESIGN.md, section 3.4), as pure functions.
 *
 * A person who checked in and never checked out has a day with short hours that nobody can fix, so payroll can
 * never be exact. A correction records the missing check-out with a reason; a manager (or admin) approves it. The
 * original scans are NEVER edited: a correction is its own record, and a day's summary is rebuilt from the scans
 * plus the approved corrections, which stand in as a check-out placed after the open check-in.
 *
 * Rules in short:
 *  - one correction fixes one thing, a missing check-out, on a day that really has an open check-in;
 *  - the proposed time must be after that check-in, not in the future, and within the longest session we support;
 *  - the person who asked can never be the one who decides;
 *  - an approved correction is dropped (and reported) if the day now has a real check-out after the check-in;
 *  - a day inside a locked pay period cannot be corrected until an admin reopens the period.
 *
 * Pure: no database, no clock reads (the caller passes the time), no device time, no alias imports.
 */
import type { SummaryEvent } from "./daily-summary.ts";
import { MAX_SHIFT_MINUTES } from "./shift-engine.ts";

export type CorrectionStatus = "pending" | "approved" | "declined" | "cancelled";

export interface TimeCorrection {
  /** The person, the day and a counter, so a declined request can be made again without losing the old one. */
  id: string;
  orgId: string;
  employeeId: string;
  /** The person's manager on that day. Decides who may approve. */
  managerId: string | null;
  dayKey: string;
  /** The missing check-out, as an exact instant (ISO). */
  proposedAt: string;
  reason: string;
  status: CorrectionStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
}

export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 500;
/** The longest a single session can be, taken from the longest shift we support. */
export const MAX_SESSION_MS = MAX_SHIFT_MINUTES * 60_000;

export interface Actor {
  uid: string;
  role: string;
  orgId: string;
}

// ----------------------------------------------------------------------------- ids and time

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** A time written as an exact instant, as a number of milliseconds; NaN for anything else. */
function instantMs(value: unknown): number {
  return typeof value === "string" && ISO_INSTANT.test(value) ? Date.parse(value) : Number.NaN;
}

/** The id for a person's next correction on a day: the first is `_1`, then `_2`, and so on. */
export function nextCorrectionId(existingIds: readonly string[], employeeId: string, dayKey: string): string {
  if (typeof employeeId !== "string" || employeeId === "") throw new RangeError("A correction needs a person.");
  const prefix = `${employeeId}_${dayKey}_`;
  let highest = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > highest) highest = n;
  }
  return `${prefix}${highest + 1}`;
}

// ----------------------------------------------------------------------------- asking

export interface RequestInput {
  dayKey: string;
  /** Start of the day's open session (from the day's summary), or null when the person is checked out. */
  openSince: string | null;
  proposedAt: unknown;
  reason: unknown;
  nowMs: number;
  /** The corrections already made for this person on this day. */
  existing: readonly Pick<TimeCorrection, "status">[];
  /** True when the day is inside a locked pay period. */
  dayIsLocked?: boolean;
}

export type RequestResult =
  | { ok: true; value: { proposedAt: string; reason: string } }
  | { ok: false; error: string };

export function validateCorrectionRequest(input: RequestInput): RequestResult {
  if (input.dayIsLocked === true) {
    return { ok: false, error: "This day is in a pay period that has been locked. Ask an organization admin to reopen it." };
  }
  const openMs = instantMs(input.openSince);
  if (Number.isNaN(openMs)) return { ok: false, error: "There is no open check-in on that day, so there is nothing to correct." };

  if (input.existing.some((c) => c.status === "approved")) {
    return { ok: false, error: "That day has already been corrected." };
  }
  if (input.existing.some((c) => c.status === "pending")) {
    return { ok: false, error: "A correction for that day is already waiting for a decision." };
  }

  const proposedMs = instantMs(input.proposedAt);
  if (Number.isNaN(proposedMs)) return { ok: false, error: "Choose the time the person actually left." };
  if (proposedMs <= openMs) return { ok: false, error: "The check-out must be after the check-in." };
  if (proposedMs > input.nowMs) return { ok: false, error: "The check-out can't be in the future." };
  if (proposedMs - openMs > MAX_SESSION_MS) {
    return { ok: false, error: `A single stay can't be longer than ${MAX_SHIFT_MINUTES / 60} hours. Check the time.` };
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `Write why the check-out was missed, between ${MIN_REASON_LENGTH} and ${MAX_REASON_LENGTH} characters.` };
  }
  return { ok: true, value: { proposedAt: new Date(proposedMs).toISOString(), reason } };
}

/** Who may ask: a person for themselves, their manager for their team, an org admin for anyone in the organization. */
export function canRequestCorrection(caller: Actor, employee: { uid: string; orgId: string; managerId: string | null }): boolean {
  if (!caller.uid || !caller.orgId || caller.orgId !== employee.orgId) return false;
  if (caller.role === "org_admin") return true;
  if (caller.role === "manager") return employee.managerId === caller.uid;
  if (caller.role === "employee") return employee.uid === caller.uid;
  return false;
}

// ----------------------------------------------------------------------------- deciding

/**
 * Who may approve or decline: the day's manager or an org admin of the same organization, and never the person
 * who asked (so nobody signs off their own correction). An employee never decides.
 */
export function canDecideCorrection(caller: Actor, c: Pick<TimeCorrection, "orgId" | "managerId" | "requestedBy">): boolean {
  if (!caller.uid || !caller.orgId || caller.orgId !== c.orgId) return false;
  if (caller.uid === c.requestedBy) return false;
  if (caller.role === "org_admin") return true;
  return caller.role === "manager" && typeof c.managerId === "string" && c.managerId !== "" && c.managerId === caller.uid;
}

export type StepResult = { ok: true; correction: TimeCorrection } | { ok: false; error: string };

/** Approve or decline a pending correction, once. The original is not changed. */
export function decideCorrection(c: TimeCorrection, decision: string, caller: Actor, at: string): StepResult {
  if (decision !== "approve" && decision !== "decline") return { ok: false, error: "Choose approve or decline." };
  if (Number.isNaN(instantMs(at))) return { ok: false, error: "The time of the decision is missing." };
  if (caller.uid === c.requestedBy && caller.orgId === c.orgId) {
    return { ok: false, error: "You can't decide a correction you asked for. Someone else has to." };
  }
  if (!canDecideCorrection(caller, c)) return { ok: false, error: "You can only decide corrections for your own team." };
  if (c.status !== "pending") return { ok: false, error: "This correction has already been decided." };
  return {
    ok: true,
    correction: { ...c, status: decision === "approve" ? "approved" : "declined", decidedBy: caller.uid, decidedAt: at },
  };
}

/** The person who asked can withdraw a request that is still waiting. */
export function cancelCorrection(c: TimeCorrection, caller: Actor, at: string): StepResult {
  if (Number.isNaN(instantMs(at))) return { ok: false, error: "The time of the change is missing." };
  if (caller.uid !== c.requestedBy || caller.orgId !== c.orgId) return { ok: false, error: "Only the person who asked can withdraw it." };
  if (c.status !== "pending") return { ok: false, error: "Only a correction that is still waiting can be withdrawn." };
  return { ok: true, correction: { ...c, status: "cancelled", decidedBy: caller.uid, decidedAt: at } };
}

// ----------------------------------------------------------------------------- using them

/** A stand-in check-out made from an approved correction. The correction's id says where it came from. */
export interface CorrectedEvent extends SummaryEvent {
  correctionId: string;
}

export interface ApplyResult {
  /** The day's events with the approved corrections placed in, in time order. The input is not changed. */
  events: SummaryEvent[];
  applied: string[];
  /** Approved corrections that no longer fit, with why. They are reported, never forced in. */
  ignored: { id: string; reason: string }[];
}

/**
 * Places the approved corrections into a day's events so the summary can be rebuilt from them. A correction fits only
 * while the day's last real event is the open check-in it was made for. Applying the same corrections twice gives the
 * same events.
 */
export function applyCorrections(events: readonly SummaryEvent[], corrections: readonly TimeCorrection[]): ApplyResult {
  const real = events.filter((e) => !("correctionId" in e));
  const already = new Set(events.filter((e): e is CorrectedEvent => "correctionId" in e).map((e) => e.correctionId));
  const counted = real.filter((e) => e.outsideWindow !== true).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const last = counted.at(-1);

  const added: CorrectedEvent[] = [];
  const applied: string[] = [];
  const ignored: ApplyResult["ignored"] = [];

  const approved = corrections.filter((c) => c.status === "approved").sort((a, b) => a.id.localeCompare(b.id));
  for (const c of approved) {
    if (already.has(c.id)) {
      applied.push(c.id);
      continue;
    }
    if (!last || last.type !== "in") {
      ignored.push({ id: c.id, reason: "The day no longer has an open check-in." });
      continue;
    }
    if (added.length > 0) {
      ignored.push({ id: c.id, reason: "The day was already corrected." });
      continue;
    }
    const proposedMs = instantMs(c.proposedAt);
    if (Number.isNaN(proposedMs) || proposedMs <= Date.parse(last.timestamp)) {
      ignored.push({ id: c.id, reason: "The corrected check-out is not after the check-in." });
      continue;
    }
    added.push({ type: "out", timestamp: new Date(proposedMs).toISOString(), earlyDeparture: false, correctionId: c.id });
    applied.push(c.id);
  }

  const all: SummaryEvent[] = [...events, ...added].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { events: all, applied, ignored };
}

/** What is waiting for this person to decide. */
export function pendingToDecide(corrections: readonly TimeCorrection[], caller: Actor): TimeCorrection[] {
  return corrections.filter((c) => c.status === "pending" && canDecideCorrection(caller, c));
}
