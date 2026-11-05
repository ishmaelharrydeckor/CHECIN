/**
 * What the manager's work-diary review screens show and say (task 2.3b, phase 4). Pure, so it can be tested.
 * The server decides everything (who may see a day, whether it can be decided); these only arrange the
 * figures it sends and put them in plain words. Times are shown as "minutes into the session", never as
 * clock times, so nobody sees a time in the wrong time zone.
 */
import type { DayStatus, DaySummary, DiaryCounts, DiaryFlag, IntervalState } from "./wfh-diary.ts";

/** One person's day as the team list (GET /api/wfh-diary?view=team) sends it. */
export interface TeamDay extends DaySummary {
  employeeId: string;
  employeeName: string;
  dayKey: string;
}

export interface TeamReply {
  day: string;
  days: TeamDay[];
  capped: boolean;
}

/** One 10-minute block as the day detail (?view=detail) sends it. Counts only; never content. */
export interface DetailInterval {
  index: number;
  state: IntervalState;
  reasons: string[];
  startMs: number;
  counts?: DiaryCounts;
  activeMinutes?: number;
  visibleSeconds?: number;
  gapCv?: number | null;
}

export interface DetailReply {
  employeeName: string;
  session: { status: string; startedAtMs: number; endedAtMs: number | null; pauses: { fromMs: number; toMs: number | null }[] };
  summary: DaySummary | null;
  intervals: DetailInterval[];
  flags: DiaryFlag[];
  checks: { index: number; dueAtMs: number; answeredAtMs: number | null }[];
}

export interface DiarySettingsView {
  enabled: boolean;
  livenessPerHour: number;
  retentionMonths: number;
}

// ---------------------------------------------------------------- days

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The day before (-1) or after (+1) a day, as YYYY-MM-DD. Pure calendar arithmetic. */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- moving through the list with the keyboard

/**
 * The person the keyboard is on after j (delta 1) or k (delta -1). With nobody chosen yet, j goes to the first person
 * and k to the last. It stops at the ends and never wraps, so a held key cannot jump from the last to the first.
 * Returns null for an empty list, or when the chosen person is no longer in it, so the screen never highlights a ghost.
 */
export function moveSelection(ids: readonly string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at === -1) return delta === 1 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, at + delta))];
}

// ---------------------------------------------------------------- the team list

/** People to look at first: those with something flagged for review, then undecided days, then decided ones. */
export function sortForReview(days: readonly TeamDay[]): TeamDay[] {
  const rank = (d: TeamDay) => (d.reviewFlags > 0 && d.status !== "flagged" ? 0 : d.status === "pending" ? 1 : d.status === "flagged" ? 2 : 3);
  return [...days].sort((a, b) => rank(a) - rank(b) || a.employeeName.localeCompare(b.employeeName));
}

export function teamTotals(days: readonly TeamDay[]) {
  const t = { people: days.length, waiting: 0, approved: 0, flagged: 0, needLook: 0, verifiedMinutes: 0, approvedMinutes: 0 };
  for (const d of days) {
    if (d.status === "approved") {
      t.approved++;
      t.approvedMinutes += d.verifiedMinutes;
    } else if (d.status === "flagged") t.flagged++;
    else t.waiting++;
    if (d.reviewFlags > 0 && d.status === "pending") t.needLook++;
    t.verifiedMinutes += d.verifiedMinutes;
  }
  return t;
}

/** The status as the manager reads it, in the style guide's status colors. */
export function managerStatusLabel(status: DayStatus): { text: string; className: string } {
  const pill = "inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold";
  if (status === "approved") return { text: "Approved", className: `${pill} bg-[#CBEED3] text-[#0E2322]` };
  if (status === "flagged") return { text: "Flagged", className: `${pill} bg-amber-100 text-amber-900` };
  return { text: "Waiting for your decision", className: `${pill} bg-slate-100 text-slate-700` };
}

/**
 * Whether each decision button is available. The server checks again (a running session cannot be decided);
 * this stops the obvious cases early and says why in plain words.
 */
export function decisionState(day: Pick<DaySummary, "status" | "pendingMinutes" | "intervalCount">): {
  approve: boolean;
  flag: boolean;
  note: string | null;
} {
  if (day.pendingMinutes > 0) {
    return { approve: false, flag: false, note: "Some time is still waiting for a still-here answer. Decide in a few minutes." };
  }
  if (day.intervalCount === 0) {
    return { approve: false, flag: false, note: "No blocks have been reported for this day yet." };
  }
  return { approve: day.status !== "approved", flag: day.status !== "flagged", note: null };
}

// ---------------------------------------------------------------- one day in detail

const STATE_LABEL: Record<IntervalState, { text: string; className: string }> = {
  verified: { text: "Counted", className: "bg-[#CBEED3] text-[#0E2322]" },
  unverified: { text: "Not counted", className: "bg-amber-100 text-amber-900" },
  paused: { text: "Paused", className: "bg-slate-100 text-slate-700" },
  pending: { text: "Waiting for a check", className: "bg-slate-100 text-slate-700" },
};

export function intervalStateLabel(state: string): { text: string; className: string } {
  return STATE_LABEL[state as IntervalState] ?? { text: "Unknown", className: "bg-slate-100 text-slate-700" };
}

const REASON_TEXT: Record<string, string> = {
  paused: "Paused",
  missed_check: "Missed a still-here check",
  bad_signature: "The figures could not be verified",
};

export function reasonLines(reasons: readonly string[]): string[] {
  return reasons.filter((r) => r in REASON_TEXT).map((r) => REASON_TEXT[r]);
}

/** "0:00 to 0:10": where a block sits in the session, in hours and minutes since it started. */
export function blockRange(index: number, intervalMinutes = 10): string {
  const at = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  return `${at(index * intervalMinutes)} to ${at((index + 1) * intervalMinutes)}`;
}

/** When a check fell due, as time into the session. */
export function minutesIntoSession(atMs: number, sessionStartMs: number): string {
  const m = Math.max(0, Math.round((atMs - sessionStartMs) / 60_000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export function totalEvents(counts: DiaryCounts | undefined): number {
  return counts ? counts.keys + counts.clicks + counts.scrolls + counts.moves : 0;
}

/** The check answers in one sentence: "3 of 4 answered". */
export function checksLine(checks: readonly { answeredAtMs: number | null }[]): string {
  if (checks.length === 0) return "No still-here checks have fallen due yet.";
  const answered = checks.filter((c) => c.answeredAtMs !== null).length;
  return `${answered} of ${checks.length} still-here checks answered.`;
}

// ---------------------------------------------------------------- settings

export const CHECKS_PER_HOUR_CHOICES = [0, 1, 2, 3, 4] as const;
export const RETENTION_CHOICES = [3, 6, 12, 24, 36] as const;

export function checksPerHourText(n: number): string {
  if (n === 0) return "No still-here checks";
  return n === 1 ? "1 check an hour" : `${n} checks an hour`;
}

export function retentionText(months: number): string {
  if (months % 12 === 0) return months === 12 ? "12 months (1 year)" : `${months} months (${months / 12} years)`;
  return `${months} months`;
}
