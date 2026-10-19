/**
 * Work-from-home diary engine (task 2.3b, phase 1; docs/WFH-DIARY-DESIGN.md), as pure functions.
 *
 * On a declared work-from-home day a person can run a work session. The page reports one 10-minute
 * interval at a time with content-free numbers (counts of keys, clicks, scrolls and moves inside the
 * ChecIN tab, active minutes, visible seconds). Hours come from **verified presence**: an interval
 * counts when it was signed with the session's key, every "still here?" check in it was answered in
 * time, and it was not paused. Activity counts never decide hours; they only feed the pattern flags,
 * which are shown to the manager and never punish anyone by themselves.
 *
 * No Firebase, no `@/` imports and no clock reads: every time is passed in as milliseconds, and the
 * HMAC and random-number functions are passed in too, so the server supplies them and the tests can
 * run the rules directly with the Node test runner.
 */

export const DIARY_INTERVAL_MINUTES = 10;
export const DIARY_INTERVAL_MS = DIARY_INTERVAL_MINUTES * 60_000;
export const DIARY_MAX_SESSION_HOURS = 12;
/** 12 hours of 10-minute intervals. */
export const DIARY_MAX_INTERVALS = (DIARY_MAX_SESSION_HOURS * 60) / DIARY_INTERVAL_MINUTES;
/** How long a person has to answer a "still here?" check. */
export const LIVENESS_RESPONSE_MS = 90_000;
export const LIVENESS_PER_HOUR_DEFAULT = 2;
export const LIVENESS_PER_HOUR_MAX = 4;
/** No real person produces more than this many of one event type in 10 minutes. */
export const MAX_COUNT_PER_INTERVAL = 50_000;
/** Bumped if the signing text ever changes, so old and new pages cannot be confused. */
export const SIGNING_VERSION = "v1";

const HOUR_MS = 60 * 60_000;
const HEX64 = /^[0-9a-f]{64}$/;
const COUNT_TYPES = ["keys", "clicks", "scrolls", "moves"] as const;
const REPORT_KEYS = new Set(["index", "counts", "activeMinutes", "visibleSeconds", "gapCv", "signature"]);

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
export type Hmac = (key: string, message: string) => string;

export interface DiaryCounts {
  keys: number;
  clicks: number;
  scrolls: number;
  moves: number;
}

/** What the page sends for one interval. Numbers only: never content, applications or websites. */
export interface IntervalReport {
  /** 0 for the first 10 minutes of the session, 1 for the next, and so on. */
  index: number;
  counts: DiaryCounts;
  /** Minutes of the 10 with any input inside the tab. */
  activeMinutes: number;
  /** Seconds of the 600 the tab was visible. */
  visibleSeconds: number;
  /**
   * How irregular the gaps between input events were (their coefficient of variation), or null when
   * there were too few events to say. People are irregular; a script tends to sit near 0.
   */
  gapCv: number | null;
  /** HMAC of `signingPayload(...)` with the session key, as 64 hex characters. */
  signature: string;
}

export interface WindowMs {
  startMs: number;
  endMs: number;
}

export interface Pause {
  fromMs: number;
  /** null while the pause is still running. */
  toMs: number | null;
}

export interface DiarySession {
  startedAtMs: number;
  endedAtMs: number | null;
  pauses: Pause[];
}

function isWholeIn(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

// ---------------------------------------------------------------- intervals

/** The fixed 10-minute block `index` covers, counted from the session start (server time). */
export function intervalWindow(sessionStartMs: number, index: number): WindowMs {
  const startMs = sessionStartMs + index * DIARY_INTERVAL_MS;
  return { startMs, endMs: startMs + DIARY_INTERVAL_MS };
}

/** Checks the shape and ranges of one interval report. Unknown fields are refused, so content cannot slip in. */
export function parseIntervalReport(raw: unknown): Parsed<IntervalReport> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "This report is not readable." };
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (!REPORT_KEYS.has(key)) return { ok: false, error: "This report has a field that is not allowed." };
  }
  if (!isWholeIn(r.index, 0, DIARY_MAX_INTERVALS - 1)) {
    return { ok: false, error: `A session has at most ${DIARY_MAX_SESSION_HOURS} hours of intervals.` };
  }
  const c = r.counts;
  if (!c || typeof c !== "object" || Array.isArray(c)) return { ok: false, error: "The counts are missing." };
  const cr = c as Record<string, unknown>;
  if (Object.keys(cr).length !== COUNT_TYPES.length) return { ok: false, error: "The counts are not readable." };
  for (const t of COUNT_TYPES) {
    if (!isWholeIn(cr[t], 0, MAX_COUNT_PER_INTERVAL)) return { ok: false, error: "The counts are not readable." };
  }
  if (!isWholeIn(r.activeMinutes, 0, DIARY_INTERVAL_MINUTES)) return { ok: false, error: "Active minutes must be 0 to 10." };
  if (!isWholeIn(r.visibleSeconds, 0, DIARY_INTERVAL_MINUTES * 60)) {
    return { ok: false, error: "Visible seconds must be 0 to 600." };
  }
  const gap = r.gapCv;
  if (gap !== null && !(typeof gap === "number" && Number.isFinite(gap) && gap >= 0 && gap <= 100)) {
    return { ok: false, error: "The timing figure is not readable." };
  }
  if (typeof r.signature !== "string" || !HEX64.test(r.signature)) return { ok: false, error: "The report is not signed." };
  return {
    ok: true,
    value: {
      index: r.index,
      counts: { keys: cr.keys as number, clicks: cr.clicks as number, scrolls: cr.scrolls as number, moves: cr.moves as number },
      activeMinutes: r.activeMinutes,
      visibleSeconds: r.visibleSeconds,
      gapCv: gap as number | null,
      signature: r.signature,
    },
  };
}

export type TimingCheck = { ok: true; duplicate: boolean } | { ok: false; status: 400 | 409; error: string };

/**
 * When an interval may be accepted: only after its 10 minutes have ended (nothing in the future),
 * inside the session (never after it stopped, never beyond 12 hours), and once. `existing` maps the
 * indexes already stored to a hash of what was stored, so an identical retry is accepted without
 * change and a different report for the same block is refused.
 */
export function checkIntervalTiming(input: {
  session: DiarySession;
  index: number;
  nowMs: number;
  existing: Map<number, string>;
  payloadHash?: string;
}): TimingCheck {
  const { session, index, nowMs, existing, payloadHash } = input;
  if (!isWholeIn(index, 0, DIARY_MAX_INTERVALS - 1)) {
    return { ok: false, status: 400, error: `A session has at most ${DIARY_MAX_SESSION_HOURS} hours of intervals.` };
  }
  const w = intervalWindow(session.startedAtMs, index);
  if (w.endMs > nowMs) return { ok: false, status: 400, error: "This interval has not finished yet." };
  if (session.endedAtMs !== null && w.endMs > session.endedAtMs) {
    return { ok: false, status: 400, error: "This interval is after the session stopped." };
  }
  if (existing.has(index)) {
    if (payloadHash !== undefined && existing.get(index) === payloadHash) return { ok: true, duplicate: true };
    return { ok: false, status: 409, error: "This interval was already recorded." };
  }
  return { ok: true, duplicate: false };
}

// ---------------------------------------------------------------- signing

/**
 * The session's signing key, derived from a server secret and the session id. The server can always
 * re-derive it, so the database keeps only its hash (as the design asks) and never the key itself.
 */
export function deriveSessionKey(secret: string, sessionId: string, hmac: Hmac): string {
  if (!secret) throw new Error("The diary signing secret is not set.");
  if (!sessionId) throw new Error("A session id is required.");
  return hmac(secret, `wfh-diary-session|${SIGNING_VERSION}|${sessionId}`);
}

/** The exact text the page signs for one interval. Fixed order, so both sides build the same string. */
export function signingPayload(sessionId: string, report: Omit<IntervalReport, "signature">): string {
  const c = report.counts;
  return [
    SIGNING_VERSION,
    sessionId,
    report.index,
    c.keys,
    c.clicks,
    c.scrolls,
    c.moves,
    report.activeMinutes,
    report.visibleSeconds,
    report.gapCv === null ? "-" : report.gapCv,
  ].join("|");
}

/** Compares two hex strings without stopping at the first difference. */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  if (!/^[0-9a-f]*$/i.test(a) || !/^[0-9a-f]*$/i.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the interval was signed with this session's key, for this session, block and numbers. */
export function verifyIntervalSignature(input: {
  sessionId: string;
  report: IntervalReport;
  key: string;
  hmac: Hmac;
}): boolean {
  const expected = input.hmac(input.key, signingPayload(input.sessionId, input.report));
  return safeEqualHex(expected, input.report.signature.toLowerCase());
}

// ---------------------------------------------------------------- liveness

/** The organization's "still here?" checks per hour: 0 to 4, 2 when not set. */
export function parseLivenessPerHour(raw: unknown): Parsed<number> {
  if (raw === undefined) return { ok: true, value: LIVENESS_PER_HOUR_DEFAULT };
  if (!isWholeIn(raw, 0, LIVENESS_PER_HOUR_MAX)) {
    return { ok: false, error: `Choose 0 to ${LIVENESS_PER_HOUR_MAX} checks an hour.` };
  }
  return { ok: true, value: raw };
}

export interface LivenessCheck {
  dueAtMs: number;
  /** One-time code the answer must carry, so a recorded answer cannot be replayed. */
  code: string;
  answeredAtMs: number | null;
}

/**
 * When the "still here?" checks fall in one hour of a session: the hour is cut into `perHour` equal
 * slots and each check lands at a random moment of its slot, early enough that its 90 seconds to
 * answer end inside the slot. The server passes its own random numbers (0 up to, not including, 1).
 */
export function planLivenessChecks(input: { hourStartMs: number; perHour: number; random: () => number }): { dueAtMs: number }[] {
  const { hourStartMs, perHour, random } = input;
  if (!isWholeIn(perHour, 0, LIVENESS_PER_HOUR_MAX) || perHour === 0) return [];
  const slot = HOUR_MS / perHour;
  const usable = slot - LIVENESS_RESPONSE_MS;
  const out: { dueAtMs: number }[] = [];
  for (let i = 0; i < perHour; i++) {
    const r = Math.min(Math.max(random(), 0), 0.999999);
    out.push({ dueAtMs: Math.floor(hourStartMs + i * slot + r * usable) });
  }
  return out;
}

export type LivenessAnswer =
  | { ok: true; answeredAtMs: number }
  | { ok: false; reason: "already_answered" | "wrong_code" | "not_yet" | "too_late"; error: string };

/** An answer counts with the right one-time code, from the moment the check is due until 90 seconds later, once. */
export function answerLivenessCheck(input: { check: LivenessCheck; code: string; nowMs: number }): LivenessAnswer {
  const { check, code, nowMs } = input;
  if (check.answeredAtMs !== null) return { ok: false, reason: "already_answered", error: "This check was already answered." };
  if (typeof code !== "string" || code.length !== check.code.length || !safeEqualText(code, check.code)) {
    return { ok: false, reason: "wrong_code", error: "This answer does not match the check." };
  }
  if (nowMs < check.dueAtMs) return { ok: false, reason: "not_yet", error: "This check has not started yet." };
  if (nowMs > check.dueAtMs + LIVENESS_RESPONSE_MS) {
    return { ok: false, reason: "too_late", error: "The time to answer this check has passed." };
  }
  return { ok: true, answeredAtMs: nowMs };
}

function safeEqualText(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The still-here verdict for one interval: "missed" if any check due in it went unanswered past its
 * 90 seconds, "pending" while one may still be answered, otherwise "ok" (also when no check fell in it).
 */
export function livenessResult(window: WindowMs, checks: readonly LivenessCheck[], nowMs: number): "ok" | "missed" | "pending" {
  let pending = false;
  for (const c of checks) {
    if (c.dueAtMs < window.startMs || c.dueAtMs >= window.endMs) continue;
    if (c.answeredAtMs !== null) continue;
    if (nowMs > c.dueAtMs + LIVENESS_RESPONSE_MS) return "missed";
    pending = true;
  }
  return pending ? "pending" : "ok";
}

// ---------------------------------------------------------------- verified time

export type IntervalState = "verified" | "unverified" | "paused" | "pending";

/**
 * Whether an interval counts. Paused time never counts; a bad signature or a missed check makes it
 * unverified; while a check can still be answered it is pending. Activity counts play no part.
 */
export function classifyInterval(input: {
  window: WindowMs;
  signatureOk: boolean;
  liveness: "ok" | "missed" | "pending";
  pauses: readonly Pause[];
}): { state: IntervalState; reasons: string[] } {
  const { window: w, signatureOk, liveness, pauses } = input;
  const paused = pauses.some((p) => p.fromMs < w.endMs && (p.toMs === null || p.toMs > w.startMs));
  const reasons: string[] = [];
  if (!signatureOk) reasons.push("bad_signature");
  if (liveness === "missed") reasons.push("missed_check");
  if (paused) return { state: "paused", reasons: ["paused", ...reasons] };
  if (reasons.length > 0) return { state: "unverified", reasons };
  if (liveness === "pending") return { state: "pending", reasons: [] };
  return { state: "verified", reasons: [] };
}

/** Hours are verified intervals times 10 minutes. The other figures are shown, never counted. */
export function summarizeMinutes(intervals: readonly { state: IntervalState }[]) {
  const out = { verifiedMinutes: 0, unverifiedMinutes: 0, pausedMinutes: 0, pendingMinutes: 0 };
  for (const i of intervals) {
    if (i.state === "verified") out.verifiedMinutes += DIARY_INTERVAL_MINUTES;
    else if (i.state === "unverified") out.unverifiedMinutes += DIARY_INTERVAL_MINUTES;
    else if (i.state === "paused") out.pausedMinutes += DIARY_INTERVAL_MINUTES;
    else if (i.state === "pending") out.pendingMinutes += DIARY_INTERVAL_MINUTES;
  }
  return out;
}

// ---------------------------------------------------------------- pattern flags

export type FlagCode =
  | "identical_counts"
  | "too_regular"
  | "moves_only"
  | "active_while_hidden"
  | "never_idle"
  | "no_activity";

export interface DiaryFlag {
  code: FlagCode;
  /** "review": the manager should look. "info": shown for context only. */
  severity: "review" | "info";
  /** The interval indexes the flag is about (empty when it is about the check answers). */
  indexes: number[];
  text: string;
}

export interface FlagRow {
  index: number;
  counts: DiaryCounts;
  activeMinutes: number;
  visibleSeconds: number;
  gapCv: number | null;
}

/** Three identical blocks in a row. */
export const IDENTICAL_RUN = 3;
/** Input timing more regular than this (coefficient of variation) looks machine-made. */
export const REGULAR_GAP_CV = 0.05;
/** Fewer events than this in a block are too few to judge timing. */
export const REGULAR_MIN_EVENTS = 30;
/** Blocks with machine-like timing needed before a flag. */
export const REGULAR_MIN_BLOCKS = 3;
/** Answers to still-here checks all within this many milliseconds of each other look scripted. */
export const REGULAR_ANSWER_SPREAD_MS = 300;
export const REGULAR_MIN_ANSWERS = 3;
/** Two hours of movement with no keys or clicks. */
export const MOVES_ONLY_RUN = 12;
/** Three hours with every minute active. */
export const NEVER_IDLE_RUN = 18;

const FLAG_TEXT: Record<FlagCode, string> = {
  identical_counts: "The same counts were recorded in several blocks in a row, which is unusual for a person.",
  too_regular: "The timing was unusually regular, as if produced by a program.",
  moves_only: "The mouse moved for two hours or more with no clicks or typing.",
  active_while_hidden: "Input was counted while the ChecIN page was hidden, which a person at the page cannot produce.",
  never_idle: "Every minute was active for three hours or more, with no pause at all.",
  no_activity: "No keyboard or mouse activity inside the page in these blocks. This is often normal (reading, calls).",
};

function total(c: DiaryCounts): number {
  return c.keys + c.clicks + c.scrolls + c.moves;
}

function sameCounts(a: DiaryCounts, b: DiaryCounts): boolean {
  return a.keys === b.keys && a.clicks === b.clicks && a.scrolls === b.scrolls && a.moves === b.moves;
}

/** Indexes of every run of consecutive blocks (by index) where `test` holds, at least `min` long. */
function runs(rows: readonly FlagRow[], min: number, test: (row: FlagRow, prev: FlagRow | null) => boolean): number[] {
  const out: number[] = [];
  let run: number[] = [];
  let prev: FlagRow | null = null;
  const close = () => {
    if (run.length >= min) out.push(...run);
    run = [];
  };
  for (const row of rows) {
    const consecutive = prev !== null && row.index === prev.index + 1;
    if (!consecutive) close();
    if (test(row, consecutive ? prev : null)) run.push(row.index);
    else close();
    prev = row;
  }
  close();
  return out;
}

/**
 * The "looks automated" checks for one day. Each flag is a sentence for the manager plus the blocks it
 * is about. Flags never change the minutes and never decide anything: a person reviews the day.
 */
export function patternFlags(rows: readonly FlagRow[], answerDelaysMs: readonly number[]): DiaryFlag[] {
  const sorted = [...rows].sort((a, b) => a.index - b.index);
  const flags: DiaryFlag[] = [];
  const add = (code: FlagCode, indexes: number[], severity: "review" | "info" = "review") => {
    flags.push({ code, severity, indexes: [...new Set(indexes)].sort((a, b) => a - b), text: FLAG_TEXT[code] });
  };

  // Identical non-empty counts: a block joins a run when it matches the block before it.
  const identical: number[] = [];
  let run: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const continues = prev !== null && row.index === prev.index + 1 && total(row.counts) > 0 && sameCounts(row.counts, prev.counts);
    if (continues) {
      if (run.length === 0) run.push(prev.index);
      run.push(row.index);
    } else {
      if (run.length >= IDENTICAL_RUN) identical.push(...run);
      run = [];
    }
  }
  if (run.length >= IDENTICAL_RUN) identical.push(...run);
  if (identical.length > 0) add("identical_counts", identical);

  // Too regular: machine-like gaps between events in enough busy blocks, or scripted check answers.
  const metronome = sorted
    .filter((r) => r.gapCv !== null && r.gapCv < REGULAR_GAP_CV && total(r.counts) >= REGULAR_MIN_EVENTS)
    .map((r) => r.index);
  const answers = answerDelaysMs.filter((d) => Number.isFinite(d));
  const scriptedAnswers =
    answers.length >= REGULAR_MIN_ANSWERS && Math.max(...answers) - Math.min(...answers) < REGULAR_ANSWER_SPREAD_MS;
  if (metronome.length >= REGULAR_MIN_BLOCKS || scriptedAnswers) {
    add("too_regular", metronome.length >= REGULAR_MIN_BLOCKS ? metronome : []);
  }

  const movesOnly = runs(sorted, MOVES_ONLY_RUN, (r) => r.counts.moves > 0 && r.counts.keys === 0 && r.counts.clicks === 0);
  if (movesOnly.length > 0) add("moves_only", movesOnly);

  const hidden = sorted.filter((r) => r.visibleSeconds === 0 && total(r.counts) > 0).map((r) => r.index);
  if (hidden.length > 0) add("active_while_hidden", hidden);

  const neverIdle = runs(sorted, NEVER_IDLE_RUN, (r) => r.activeMinutes === DIARY_INTERVAL_MINUTES);
  if (neverIdle.length > 0) add("never_idle", neverIdle);

  const empty = sorted.filter((r) => r.activeMinutes === 0 && total(r.counts) === 0).map((r) => r.index);
  if (empty.length > 0) add("no_activity", empty, "info");

  return flags;
}

// ---------------------------------------------------------------- day summary

export type DayStatus = "pending" | "approved" | "flagged";

export interface DaySummary {
  verifiedMinutes: number;
  unverifiedMinutes: number;
  pausedMinutes: number;
  pendingMinutes: number;
  intervalCount: number;
  /** Each flag code once, sorted. */
  flags: FlagCode[];
  /** How many of those need the manager's look (for the "flagged days" column). */
  reviewFlags: number;
  status: DayStatus;
  decidedBy: string | null;
  decidedAt: string | null;
}

/**
 * The one-per-person-per-day summary the manager and reports read. A manager's decision stays only
 * while the figures and flags it was made on are unchanged; anything new sends the day back to
 * "pending", so an approval can never cover time or flags added after it.
 */
export function buildDaySummary(input: {
  intervals: readonly { index: number; state: IntervalState }[];
  flags: readonly DiaryFlag[];
  previous: DaySummary | null;
}): DaySummary {
  const minutes = summarizeMinutes(input.intervals);
  const codes = [...new Set(input.flags.map((f) => f.code))].sort() as FlagCode[];
  const reviewFlags = new Set(input.flags.filter((f) => f.severity === "review").map((f) => f.code)).size;
  const base = { ...minutes, intervalCount: input.intervals.length, flags: codes, reviewFlags };
  const prev = input.previous;
  const unchanged =
    prev !== null &&
    prev.verifiedMinutes === base.verifiedMinutes &&
    prev.unverifiedMinutes === base.unverifiedMinutes &&
    prev.pausedMinutes === base.pausedMinutes &&
    prev.pendingMinutes === base.pendingMinutes &&
    prev.intervalCount === base.intervalCount &&
    prev.flags.join(",") === base.flags.join(",");
  if (unchanged && prev.status !== "pending") {
    return { ...base, status: prev.status, decidedBy: prev.decidedBy, decidedAt: prev.decidedAt };
  }
  return { ...base, status: "pending", decidedBy: null, decidedAt: null };
}
