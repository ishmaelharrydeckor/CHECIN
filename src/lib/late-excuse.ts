/**
 * Pure rules for excusing a late mark (task 2.7; see docs/LATE-EXCUSE-DESIGN.md).
 *
 * "Late" is set automatically from the scan and stays exactly as recorded. An excuse sits beside it:
 * a manager (own team) or an org admin can excuse a late day with a reason, an employee can only
 * add a note. Nothing here reads the database or the clock (`today` is passed in), and the file uses
 * relative `.ts` imports only, so Node can run the tests directly.
 *
 * Who the caller is, and which person a day belongs to, always comes from the verified login and the
 * stored attendance on the server, never from the request body. The parsers below therefore never
 * return an identity, organization or manager: they return only the day, the people asked about and
 * the text.
 */
import { addDays } from "./attendance-today.ts";

/** Today and this many days before it can still be excused; older days are locked. */
export const EXCUSE_WINDOW_DAYS = 14;
/** People per excuse request. */
export const MAX_EXCUSE_PEOPLE = 200;
export const REASON_MIN = 3;
export const REASON_MAX = 200;
export const NOTE_MAX = 200;
export const HISTORY_MAX = 10;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isRealDay(key: unknown): key is string {
  if (typeof key !== "string" || !DAY_RE.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function isCleanId(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= 128 && !v.includes("/");
}

/** The oldest day that can still be excused or noted. */
export function windowStart(today: string): string {
  return addDays(today, -EXCUSE_WINDOW_DAYS);
}

/** True when `day` is today or up to EXCUSE_WINDOW_DAYS earlier (never the future). */
export function isDayInWindow(day: string, today: string): boolean {
  return isRealDay(day) && isRealDay(today) && day <= today && day >= windowStart(today);
}

function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // Collapse whitespace and drop control characters so a reason is one tidy line of plain text.
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t;
}

export function parseReason(raw: unknown): Parsed<string> {
  const t = cleanText(raw);
  if (t === null || t.length < REASON_MIN) {
    return { ok: false, error: `Please give a reason of at least ${REASON_MIN} characters.` };
  }
  if (t.length > REASON_MAX) return { ok: false, error: `Please keep the reason under ${REASON_MAX} characters.` };
  return { ok: true, value: t };
}

export function parseNoteText(raw: unknown): Parsed<string> {
  const t = cleanText(raw);
  if (t === null || t.length === 0) return { ok: false, error: "Please write a short note." };
  if (t.length > NOTE_MAX) return { ok: false, error: `Please keep the note under ${NOTE_MAX} characters.` };
  return { ok: true, value: t };
}

export interface ExcuseRequest {
  dayKey: string;
  employeeIds: string[];
  reason: string;
}

/** Checks an "excuse these people on this day" body. `today` is the organization's day. */
export function parseExcuseRequest(body: unknown, today: string): Parsed<ExcuseRequest> {
  if (!isRealDay(today)) return { ok: false, error: "Today's date is required." };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Choose the day, the people and a reason." };
  }
  const b = body as Record<string, unknown>;
  if (!isRealDay(b.dayKey)) return { ok: false, error: "Choose a valid day." };
  if (b.dayKey > today) return { ok: false, error: "A day that has not happened yet cannot be excused." };
  if (!isDayInWindow(b.dayKey, today)) {
    return {
      ok: false,
      error: `Late marks older than ${EXCUSE_WINDOW_DAYS} days are locked and can no longer be excused.`,
    };
  }
  if (!Array.isArray(b.employeeIds) || b.employeeIds.length === 0) {
    return { ok: false, error: "Choose at least one person." };
  }
  const ids: string[] = [];
  for (const item of b.employeeIds) {
    if (!isCleanId(item)) return { ok: false, error: "Choose valid people." };
    const id = item.trim();
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > MAX_EXCUSE_PEOPLE) {
    return { ok: false, error: `You can excuse at most ${MAX_EXCUSE_PEOPLE} people at a time.` };
  }
  const reason = parseReason(b.reason);
  if (!reason.ok) return reason;
  return { ok: true, value: { dayKey: b.dayKey, employeeIds: ids, reason: reason.value } };
}

export interface RevokeRequest {
  dayKey: string;
  employeeId: string;
  reason: string;
}

/** Checks an "undo this excuse" body: it needs a reason too, so the history says why. */
export function parseRevokeRequest(body: unknown, today: string): Parsed<RevokeRequest> {
  if (!isRealDay(today)) return { ok: false, error: "Today's date is required." };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Choose the day and the person." };
  }
  const b = body as Record<string, unknown>;
  if (!isRealDay(b.dayKey) || b.dayKey > today) return { ok: false, error: "Choose a valid day." };
  if (!isDayInWindow(b.dayKey, today)) {
    return { ok: false, error: `Excuses older than ${EXCUSE_WINDOW_DAYS} days are locked.` };
  }
  if (!isCleanId(b.employeeId)) return { ok: false, error: "Choose a valid person." };
  const reason = parseReason(b.reason);
  if (!reason.ok) return reason;
  return { ok: true, value: { dayKey: b.dayKey, employeeId: b.employeeId.trim(), reason: reason.value } };
}

export interface NoteRequest {
  dayKey: string;
  note: string;
}

/** Checks the employee's note on their own late day. The person is the caller, so none is in the body. */
export function parseNoteRequest(body: unknown, today: string): Parsed<NoteRequest> {
  if (!isRealDay(today)) return { ok: false, error: "Today's date is required." };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Choose the day and write a note." };
  }
  const b = body as Record<string, unknown>;
  if (!isRealDay(b.dayKey) || b.dayKey > today) return { ok: false, error: "Choose a valid day." };
  if (!isDayInWindow(b.dayKey, today)) {
    return { ok: false, error: `Notes can only be added to the last ${EXCUSE_WINDOW_DAYS} days.` };
  }
  const note = parseNoteText(b.note);
  if (!note.ok) return note;
  return { ok: true, value: { dayKey: b.dayKey, note: note.value } };
}

export interface ExcuseCaller {
  uid: string;
  role: string | null;
}

export interface ExcuseTarget {
  employeeId: string;
  /** The manager the person's day is filed under (a manager's own is their own uid). */
  managerId: string | null;
}

/**
 * May the caller excuse this person's day?
 *  - org admin: anyone in the organization (the server has already checked the organization), even themself;
 *  - manager: only people filed under them, and never themself (an admin must excuse a manager's own late);
 *  - anyone else: no.
 */
export function canExcuse(caller: ExcuseCaller, target: ExcuseTarget): boolean {
  if (!caller || typeof caller.uid !== "string" || caller.uid.length === 0) return false;
  if (!target || typeof target.employeeId !== "string" || target.employeeId.length === 0) return false;
  if (caller.role === "org_admin") return true;
  if (caller.role === "manager") {
    return target.managerId === caller.uid && target.employeeId !== caller.uid;
  }
  return false;
}

export interface LateSummaryLike {
  late?: unknown;
  firstIn?: unknown;
  lateExcused?: unknown;
}

/** The late judgement every screen should count: late AND not excused. */
export function isEffectivelyLate(summary: LateSummaryLike | null | undefined): boolean {
  return Boolean(summary) && summary!.late === true && summary!.lateExcused !== true;
}

export type ExcuseDecision = "ok" | "no_record" | "not_late" | "already_excused";

/** Whether a stored day can be excused right now. A missing summary or a day that was not late cannot. */
export function excuseDecision(summary: LateSummaryLike | null | undefined): ExcuseDecision {
  if (!summary || !summary.firstIn) return "no_record";
  if (summary.late !== true) return "not_late";
  if (summary.lateExcused === true) return "already_excused";
  return "ok";
}

/**
 * Who a manager ticks with the "everyone who arrived by HH:MM" helper. Times are the "HH:MM" the
 * Today panel and review list already show, in the organization's timezone, so plain string
 * comparison is correct. People without a valid time are never ticked.
 */
export function arrivedByCutoff(
  arrivals: readonly { employeeId: string; arrivedAt: string }[],
  cutoff: string,
): string[] {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) return [];
  return arrivals
    .filter((a) => /^([01]\d|2[0-3]):[0-5]\d$/.test(a.arrivedAt) && a.arrivedAt <= cutoff)
    .map((a) => a.employeeId);
}

export interface HistoryEntry {
  action: "excused" | "revoked";
  by: string;
  at: string; // ISO, server time
  reason: string;
}

/** Appends a decision and keeps only the newest HISTORY_MAX. Returns a new array. */
export function appendHistory(history: readonly HistoryEntry[] | undefined, entry: HistoryEntry): HistoryEntry[] {
  return [...(history ?? []), entry].slice(-HISTORY_MAX);
}

/** What the summary stamp should be after a decision: set on excuse, removed on revoke. */
export function stampFor(action: "excused" | "revoked"): { lateExcused: true } | null {
  return action === "excused" ? { lateExcused: true } : null;
}
