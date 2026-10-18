/**
 * Server side of repeating shift patterns (task 3.1, phase 6). The rules are in `shift-patterns.ts`;
 * this file only reads and writes Firestore.
 *
 * `fillPattern` is THE fill step: the create and edit routes, the Rota top-up and the nightly refill
 * job all call it. It is safe to run again and again for any pattern: each run is one transaction,
 * covers at most 62 days, writes only days not yet filled, never duplicates (assignment ids are
 * `{employeeId}_{dayKey}`) and never overwrites a manual assignment or another pattern's day.
 */
import { firestoreAdmin, getAuthAdmin } from "@/integrations/firebase/admin.server";
import { dayKey } from "./attendance-day.ts";
import { addDays } from "./attendance-today.ts";
import { summaryDocId } from "./daily-summary.ts";
import { assignmentId, type ShiftSnapshot } from "./shift-engine.ts";
import { canAssignTo, snapshotFromShiftDoc, type CallerLike } from "./shift-requests.ts";
import {
  fillTarget,
  nextFillDay,
  nextFillWindow,
  parsePatternRule,
  patternShiftIds,
  planFill,
  planTrim,
  shiftIdForDay,
  type ExistingDay,
  type PatternRule,
  type PatternState,
  type SkipReason,
} from "./shift-patterns.ts";

export const PATTERNS = "shift_patterns";
/** Patterns topped up per Rota load or per nightly-job call, so one request stays short. */
export const TOPUP_MAX_PATTERNS = 10;
/** One fill run covers 62 days and the target is today + 62, so two runs always reach it. */
const MAX_RUNS_PER_FILL = 2;
/** A pattern fills at most ~63 days ahead, so this comfortably holds one pattern's future days. */
const TRIM_READ_CAP = 500;
const PATTERN_LIST_CAP = 500;

export type PatternStatus = "active" | "ended";

export interface StoredPattern extends PatternState {
  id: string;
  orgId: string;
  employeeId: string;
  employeeName: string;
  managerId: string | null;
  status: PatternStatus;
  createdBy: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads a stored pattern; returns null if the document is damaged (it is then never filled). */
export function patternFromDoc(id: string, data: Record<string, unknown> | undefined): StoredPattern | null {
  if (!data) return null;
  const rule = parsePatternRule(data.rule);
  if (!rule.ok) return null;
  if (typeof data.orgId !== "string" || !data.orgId) return null;
  if (typeof data.employeeId !== "string" || !data.employeeId) return null;
  if (typeof data.startDay !== "string" || !DAY_RE.test(data.startDay)) return null;
  const endDay = typeof data.endDay === "string" && DAY_RE.test(data.endDay) ? data.endDay : null;
  const filledThrough =
    typeof data.filledThrough === "string" && DAY_RE.test(data.filledThrough) ? data.filledThrough : null;
  return {
    id,
    orgId: data.orgId,
    employeeId: data.employeeId,
    employeeName: typeof data.employeeName === "string" ? data.employeeName : "",
    managerId: typeof data.managerId === "string" ? data.managerId : null,
    status: data.status === "active" ? "active" : "ended",
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    rule: rule.value,
    startDay: data.startDay,
    endDay,
    filledThrough,
  };
}

/** Today's day key in the organization's timezone (UTC when none is set). */
export async function orgToday(orgId: string): Promise<string> {
  const snap = await firestoreAdmin.collection("organizations").doc(orgId).get();
  const raw = snap.exists ? snap.data()?.timezone : undefined;
  const tz = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "UTC";
  return dayKey(Date.now(), tz) || new Date().toISOString().slice(0, 10);
}

export interface PatternPerson {
  uid: string;
  role: string | null;
  managerId: string | null;
  authDisplayName: string;
}

/** A person's role and manager from their verified custom claims (never from a profile document). */
export async function loadPeople(orgId: string, uids: string[]): Promise<Map<string, PatternPerson>> {
  const out = new Map<string, PatternPerson>();
  for (let i = 0; i < uids.length; i += 100) {
    const res = await getAuthAdmin().getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of res.users) {
      const claims = u.customClaims ?? {};
      if (claims.orgId !== orgId) continue;
      const role = typeof claims.role === "string" ? claims.role : null;
      const managerId =
        typeof claims.managerId === "string" ? claims.managerId : role === "manager" ? u.uid : null;
      out.set(u.uid, { uid: u.uid, role, managerId, authDisplayName: u.displayName || "" });
    }
  }
  return out;
}

/** Same rule as manual assignment: admin anyone, a manager with the switch their own team only. */
export async function checkPeople(
  caller: CallerLike,
  orgId: string,
  uids: string[],
): Promise<{ ok: true; people: Map<string, PatternPerson> } | { ok: false; status: number; error: string }> {
  const people = await loadPeople(orgId, uids);
  for (const uid of uids) {
    const person = people.get(uid);
    // Same message and 404 whether the id is unknown or belongs to another organization
    if (!person) {
      return { ok: false, status: 404, error: "One or more selected people were not found in your organization." };
    }
    if (!canAssignTo(caller, person)) {
      return { ok: false, status: 403, error: "You can only set up shift patterns for people on your own team." };
    }
  }
  return { ok: true, people };
}

/** Every shift the rule uses must exist in this organization, be active and have valid details. */
export async function checkRuleShifts(
  orgId: string,
  rule: PatternRule,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const ids = patternShiftIds(rule);
  const snaps = await firestoreAdmin.getAll(...ids.map((id) => firestoreAdmin.collection("shifts").doc(id)));
  for (const snap of snaps) {
    if (!snap.exists || snap.data()?.orgId !== orgId) {
      return { ok: false, status: 404, error: "Shift not found." };
    }
    if (snap.data()?.archived === true) {
      return { ok: false, status: 400, error: "Archived shifts cannot be used in a pattern." };
    }
    if (!snapshotFromShiftDoc(snap.id, snap.data())) {
      return { ok: false, status: 400, error: "A shift in this pattern has invalid details and cannot be used." };
    }
  }
  return { ok: true };
}

export interface FillResult {
  patternId: string;
  written: number;
  skipped: Partial<Record<SkipReason, number>>;
  ended: boolean; // the person left the organization, so the pattern was ended
}

async function endPattern(ref: FirebaseFirestore.DocumentReference, today: string, reason: string) {
  const now = new Date().toISOString();
  await ref.update({ status: "ended", endDay: today, endedReason: reason, updatedAt: now });
}

/**
 * Fills one pattern up to today + 62 days (at most two bounded runs). Safe to call at any time and
 * as often as wanted, including by a nightly job: it does nothing when the pattern is already filled
 * or has ended. `today` defaults to the organization's day.
 */
export async function fillPattern(patternId: string, opts: { today?: string } = {}): Promise<FillResult | null> {
  const ref = firestoreAdmin.collection(PATTERNS).doc(patternId);
  const first = await ref.get();
  const stored = first.exists ? patternFromDoc(first.id, first.data()) : null;
  if (!stored || stored.status !== "active") return null;

  const { orgId, employeeId } = stored;
  const today = opts.today ?? (await orgToday(orgId));
  const result: FillResult = { patternId, written: 0, skipped: {}, ended: false };

  // The person's manager comes from their claims now, not from when the pattern was made, so a
  // manager change is followed on the next fill. Someone who left the organization stops the pattern.
  const person = (await loadPeople(orgId, [employeeId])).get(employeeId);
  if (!person || (person.role !== "employee" && person.role !== "manager")) {
    await endPattern(ref, today, "person_left");
    result.ended = true;
    return result;
  }

  for (let run = 0; run < MAX_RUNS_PER_FILL; run++) {
    // The transaction may run its body more than once, so it returns its counts instead of adding them up.
    const outcome = await firestoreAdmin.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const p = snap.exists ? patternFromDoc(snap.id, snap.data()) : null;
      if (!p || p.status !== "active" || p.orgId !== orgId || p.employeeId !== employeeId) return null;

      const window = nextFillWindow(p, today);
      const nextDay = nextFillDay(p);
      if (!window) {
        if (snap.data()?.nextFillDay !== nextDay) tx.update(ref, { nextFillDay: nextDay });
        return null;
      }

      const ruleDays: string[] = [];
      for (let d = window.from; d <= window.to; d = addDays(d, 1)) {
        if (shiftIdForDay(p.rule, p.startDay, d)) ruleDays.push(d);
      }
      const shiftIds = patternShiftIds(p.rule);
      const assignmentRefs = ruleDays.map((d) =>
        firestoreAdmin.collection("shift_assignments").doc(assignmentId(employeeId, d)),
      );
      const shiftRefs = shiftIds.map((id) => firestoreAdmin.collection("shifts").doc(id));
      const summaryRef = ruleDays.includes(today)
        ? firestoreAdmin.collection("daily_summaries").doc(summaryDocId(employeeId, today))
        : null;

      const snaps = await tx.getAll(...assignmentRefs, ...shiftRefs, ...(summaryRef ? [summaryRef] : []));
      const assignmentSnaps = snaps.slice(0, assignmentRefs.length);
      const shiftSnaps = snaps.slice(assignmentRefs.length, assignmentRefs.length + shiftRefs.length);
      const recordedToday = summaryRef ? snaps[snaps.length - 1].exists : false;

      const existing = new Map<string, ExistingDay>();
      assignmentSnaps.forEach((s, i) => {
        if (!s.exists) return;
        const data = s.data() ?? {};
        existing.set(ruleDays[i], {
          patternId: typeof data.patternId === "string" ? data.patternId : null,
          shiftId: typeof data.shiftId === "string" ? data.shiftId : "",
        });
      });

      const shifts = new Map<string, { archived: boolean }>();
      const snapshots = new Map<string, ShiftSnapshot>();
      for (const s of shiftSnaps) {
        const data = s.data();
        if (!s.exists || data?.orgId !== orgId) continue;
        const snapshot = snapshotFromShiftDoc(s.id, data);
        if (!snapshot) continue; // damaged shift: treated as missing
        shifts.set(s.id, { archived: data?.archived === true });
        snapshots.set(s.id, snapshot);
      }

      const plan = planFill({ patternId, pattern: p, today, existing, recordedToday, shifts });
      const now = new Date().toISOString();
      for (const w of plan.writes) {
        tx.set(firestoreAdmin.collection("shift_assignments").doc(assignmentId(employeeId, w.dayKey)), {
          orgId,
          managerId: person.managerId,
          employeeId,
          employeeName: p.employeeName || "Employee",
          dayKey: w.dayKey,
          shiftId: w.shiftId,
          shift: snapshots.get(w.shiftId)!,
          assignedBy: p.createdBy,
          assignedAt: now,
          patternId,
        });
      }

      const skipped: Partial<Record<SkipReason, number>> = {};
      for (const s of plan.skipped) skipped[s.reason] = (skipped[s.reason] ?? 0) + 1;
      const after = { ...p, filledThrough: plan.filledThrough };
      tx.update(ref, {
        filledThrough: plan.filledThrough,
        nextFillDay: nextFillDay(after),
        managerId: person.managerId,
        lastFill: { at: now, written: plan.writes.length, skipped },
        updatedAt: now,
      });

      return { written: plan.writes.length, skipped, more: nextFillWindow(after, today) !== null };
    });
    if (!outcome) break;
    result.written += outcome.written;
    for (const [k, v] of Object.entries(outcome.skipped)) {
      const key = k as SkipReason;
      result.skipped[key] = (result.skipped[key] ?? 0) + (v ?? 0);
    }
    if (!outcome.more) break;
  }
  return result;
}

/**
 * Removes this pattern's own assignments after `keepThrough` (never today or the past, never a
 * manual or another pattern's day) and saves `fields` on the pattern, in one batch.
 */
export async function trimAndSavePattern(
  pattern: StoredPattern,
  keepThrough: string | null,
  today: string,
  fields: Record<string, unknown>,
): Promise<number> {
  const batch = firestoreAdmin.batch();
  let removed = 0;
  if (keepThrough !== null) {
    const after = keepThrough > today ? keepThrough : today;
    const snap = await firestoreAdmin
      .collection("shift_assignments")
      .where("orgId", "==", pattern.orgId)
      .where("employeeId", "==", pattern.employeeId)
      .where("patternId", "==", pattern.id)
      .where("dayKey", ">", after)
      .limit(TRIM_READ_CAP)
      .get();
    const days = planTrim({
      patternId: pattern.id,
      keepThrough,
      today,
      existing: snap.docs.map((d) => ({
        dayKey: String(d.data().dayKey ?? ""),
        patternId: typeof d.data().patternId === "string" ? d.data().patternId : null,
      })),
    });
    for (const d of days) {
      batch.delete(firestoreAdmin.collection("shift_assignments").doc(assignmentId(pattern.employeeId, d)));
      removed++;
    }
  }
  batch.update(firestoreAdmin.collection(PATTERNS).doc(pattern.id), fields);
  await batch.commit();
  return removed;
}

/**
 * Tops up the patterns that are due (their next unfilled day is on or before today + 62), oldest
 * first, at most `max` per call. With `orgId` it covers one organization (the Rota top-up; add
 * `managerId` for a manager's own team). Without `orgId` it covers every organization, for the
 * nightly job; each pattern is then filled against its own organization's day.
 */
export async function fillDuePatterns(opts: {
  orgId?: string;
  managerId?: string;
  max?: number;
  today?: string;
}): Promise<{ checked: number; written: number; failed: number }> {
  const max = Math.min(Math.max(1, opts.max ?? TOPUP_MAX_PATTERNS), 200);
  // Across organizations the earliest timezone may already be a day ahead of UTC.
  const today = opts.today ?? (opts.orgId ? await orgToday(opts.orgId) : addDays(new Date().toISOString().slice(0, 10), 1));
  let query: FirebaseFirestore.Query = firestoreAdmin.collection(PATTERNS);
  if (opts.orgId) query = query.where("orgId", "==", opts.orgId);
  if (opts.orgId && opts.managerId) query = query.where("managerId", "==", opts.managerId);
  const snap = await query
    .where("status", "==", "active")
    .where("nextFillDay", "<=", fillTarget(today))
    .orderBy("nextFillDay")
    .limit(max)
    .get();

  let written = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    // One damaged pattern must not stop the others from being filled.
    try {
      const r = await fillPattern(doc.id, opts.orgId ? { today } : {});
      written += r?.written ?? 0;
    } catch (err) {
      failed++;
      console.error(`fillPattern ${doc.id} failed:`, err);
    }
  }
  return { checked: snap.size, written, failed };
}

/** Active (and optionally ended) patterns in the caller's scope, bounded. */
export async function listPatterns(scope: {
  orgId: string;
  managerId?: string;
  employeeId?: string;
  includeEnded: boolean;
}): Promise<{ patterns: { pattern: StoredPattern; lastFill: unknown }[]; truncated: boolean }> {
  const statuses: PatternStatus[] = scope.includeEnded ? ["active", "ended"] : ["active"];
  const out: { pattern: StoredPattern; lastFill: unknown }[] = [];
  let truncated = false;
  for (const status of statuses) {
    let query: FirebaseFirestore.Query = firestoreAdmin
      .collection(PATTERNS)
      .where("orgId", "==", scope.orgId)
      .where("status", "==", status);
    if (scope.managerId) query = query.where("managerId", "==", scope.managerId);
    if (scope.employeeId) query = query.where("employeeId", "==", scope.employeeId);
    const cap = status === "active" ? PATTERN_LIST_CAP : 100;
    const snap = await query.limit(cap).get();
    if (snap.size >= cap) truncated = true;
    for (const doc of snap.docs) {
      const p = patternFromDoc(doc.id, doc.data());
      if (p) out.push({ pattern: p, lastFill: doc.data().lastFill ?? null });
    }
  }
  return { patterns: out, truncated };
}

/** The person's active patterns, to refuse a new one that would clash. */
export async function activePatternsFor(orgId: string, employeeId: string): Promise<StoredPattern[]> {
  const snap = await firestoreAdmin
    .collection(PATTERNS)
    .where("orgId", "==", orgId)
    .where("employeeId", "==", employeeId)
    .where("status", "==", "active")
    .limit(50)
    .get();
  return snap.docs.map((d) => patternFromDoc(d.id, d.data())).filter((p): p is StoredPattern => p !== null);
}
