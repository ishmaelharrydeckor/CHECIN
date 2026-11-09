/**
 * Pay period totals, the lock and the reopen (docs/PAYROLL-OVERTIME-DESIGN.md, section 3.2), as pure functions.
 *
 * Locking freezes every person's totals for the period into a snapshot ("lines"), so an export is always built from
 * the same numbers even if summaries are rebuilt later. Only an org admin locks. A lock is blocked while a day has a
 * missing check-out or overtime is waiting for approval, unless the admin ticks "lock anyway", which is recorded with
 * the counts that were overridden. A locked period can be reopened with a written reason, which raises its version;
 * the frozen lines of the earlier version are kept.
 *
 * Whole minutes throughout. Pure: no database, no clock reads (the caller passes the time), no device time, no
 * alias imports.
 */
import { overtimeTotals, type OvertimeEntry } from "./overtime.ts";
import { payPeriodId, type PayPeriod } from "./pay-periods.ts";

// ----------------------------------------------------------------------------- the frozen totals

/** One person's day, as the timesheet has it. */
export interface PeriodDay {
  dayKey: string;
  status: string;
  workedMinutes: unknown;
  breakMinutes: unknown;
  paidMinutes: unknown;
  /** null when nothing was expected (no shift and no standard day). */
  expectedMinutes: unknown;
  late: boolean;
  noCheckOut: boolean;
}

export interface PeriodPerson {
  employeeId: string;
  name: string;
  department: string;
  /** The admin-set code that matches this person to the payroll system. */
  payrollCode?: string | null;
  days: readonly PeriodDay[];
}

export interface PeriodDayLine {
  dayKey: string;
  status: string;
  workedMinutes: number;
  breakMinutes: number;
  paidMinutes: number;
  expectedMinutes: number;
  late: boolean;
  noCheckOut: boolean;
}

/** The frozen totals for one person in one period. Plain data, so it can be stored as it is. */
export interface PeriodLine {
  employeeId: string;
  name: string;
  department: string;
  payrollCode: string | null;
  daysWorked: number;
  workedMinutes: number;
  breakMinutes: number;
  paidMinutes: number;
  expectedMinutes: number;
  /** Only approved overtime is overtime. */
  approvedOvertimeMinutes: number;
  /** Pending and declined extra time: exported in its own column, never as overtime. */
  unapprovedExtraMinutes: number;
  leaveDays: number;
  holidayDays: number;
  wfhDays: number;
  absentDays: number;
  lateDays: number;
  noCheckOutDays: number;
  /** Each day of the period, in date order (at most 31). */
  days: PeriodDayLine[];
}

const clean = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function buildPeriodLine(person: PeriodPerson, entries: readonly OvertimeEntry[], period: Pick<PayPeriod, "startDay" | "endDay">): PeriodLine {
  const seen = new Set<string>();
  const days: PeriodDayLine[] = [];
  for (const d of person.days) {
    if (typeof d.dayKey !== "string" || d.dayKey < period.startDay || d.dayKey > period.endDay || seen.has(d.dayKey)) continue;
    seen.add(d.dayKey);
    days.push({
      dayKey: d.dayKey,
      status: d.status,
      workedMinutes: clean(d.workedMinutes),
      breakMinutes: clean(d.breakMinutes),
      paidMinutes: clean(d.paidMinutes),
      expectedMinutes: clean(d.expectedMinutes),
      late: d.late === true,
      noCheckOut: d.noCheckOut === true,
    });
  }
  days.sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  const mine = entries.filter((e) => e.employeeId === person.employeeId && e.dayKey >= period.startDay && e.dayKey <= period.endDay);
  const ot = overtimeTotals(mine);
  const count = (status: string) => days.filter((d) => d.status === status).length;

  return {
    employeeId: person.employeeId,
    name: person.name,
    department: person.department,
    payrollCode: person.payrollCode ?? null,
    daysWorked: count("present"),
    workedMinutes: days.reduce((n, d) => n + d.workedMinutes, 0),
    breakMinutes: days.reduce((n, d) => n + d.breakMinutes, 0),
    paidMinutes: days.reduce((n, d) => n + d.paidMinutes, 0),
    expectedMinutes: days.reduce((n, d) => n + d.expectedMinutes, 0),
    approvedOvertimeMinutes: ot.approvedMinutes,
    unapprovedExtraMinutes: ot.unapprovedMinutes,
    leaveDays: count("leave"),
    holidayDays: count("holiday"),
    wfhDays: count("wfh"),
    absentDays: count("absent"),
    lateDays: days.filter((d) => d.late).length,
    noCheckOutDays: days.filter((d) => d.noCheckOut).length,
    days,
  };
}

/** Everyone's lines for a period, sorted by name, so the same period always gives the same list. */
export function buildPeriodLines(people: readonly PeriodPerson[], entries: readonly OvertimeEntry[], period: Pick<PayPeriod, "startDay" | "endDay">): PeriodLine[] {
  return people
    .map((p) => buildPeriodLine(p, entries, period))
    .sort((a, b) => (a.name === b.name ? a.employeeId.localeCompare(b.employeeId) : a.name.localeCompare(b.name)));
}

/** The stored id of one frozen line: the period, the person and the version. */
export function periodLineId(periodId: string, employeeId: string, version: number): string {
  if (typeof employeeId !== "string" || employeeId === "") throw new RangeError("A line needs a person.");
  if (!Number.isInteger(version) || version < 1) throw new RangeError("A version starts at 1.");
  return `${periodId}_${employeeId}_${version}`;
}

// ----------------------------------------------------------------------------- what blocks a lock

export interface LockCheck {
  missingCheckOutPeople: number;
  missingCheckOutDays: number;
  pendingOvertimeEntries: number;
  pendingOvertimePeople: number;
  blocked: boolean;
}

export function lockCheck(lines: readonly PeriodLine[], entries: readonly OvertimeEntry[]): LockCheck {
  const missingCheckOutPeople = lines.filter((l) => l.noCheckOutDays > 0).length;
  const missingCheckOutDays = lines.reduce((n, l) => n + l.noCheckOutDays, 0);
  const pending = entries.filter((e) => e.status === "pending");
  const pendingOvertimePeople = new Set(pending.map((e) => e.employeeId)).size;
  return {
    missingCheckOutPeople,
    missingCheckOutDays,
    pendingOvertimeEntries: pending.length,
    pendingOvertimePeople,
    blocked: missingCheckOutDays > 0 || pending.length > 0,
  };
}

/** A lock reads about people times days of summaries; beyond this the admin gets a plain limit, not a hang. */
export const LOCK_READ_BUDGET = 15_000;

export function maxLockPeople(days: number): number {
  return Math.floor(LOCK_READ_BUDGET / Math.max(1, days));
}

export function lockSizeError(people: number, days: number): string | null {
  const most = maxLockPeople(days);
  if (people <= most) return null;
  return `Your organization has ${people} people, so a pay period of ${days} days is too big to lock in one go (at most ${most} people). Please contact support.`;
}

// ----------------------------------------------------------------------------- the period's life

export interface ReopenLogEntry {
  fromVersion: number;
  reason: string;
  by: string;
  at: string;
}

export interface PayPeriodState {
  id: string;
  orgId: string;
  startDay: string;
  endDay: string;
  status: "open" | "locked";
  /** Starts at 1; each reopen raises it, and an export names it. */
  version: number;
  lockedAt: string | null;
  lockedBy: string | null;
  /** What "lock anyway" overrode, so the log shows it. */
  lockedOverride: { missingCheckOutDays: number; pendingOvertimeEntries: number } | null;
  reopenLog: ReopenLogEntry[];
}

export function newPayPeriodState(orgId: string, period: Pick<PayPeriod, "startDay" | "endDay">): PayPeriodState {
  return {
    id: payPeriodId(orgId, period.startDay),
    orgId,
    startDay: period.startDay,
    endDay: period.endDay,
    status: "open",
    version: 1,
    lockedAt: null,
    lockedBy: null,
    lockedOverride: null,
    reopenLog: [],
  };
}

export interface Actor {
  role: string;
  uid: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type LockResult = { ok: true; state: PayPeriodState; lineIds: string[] } | { ok: false; error: string };

/**
 * Locks an open period. Only an org admin; refused while a day has a missing check-out or overtime waits for
 * approval, unless `lockAnyway` is set (then the counts are recorded). Locking again changes nothing.
 */
export function lockPeriod(
  state: PayPeriodState,
  lines: readonly PeriodLine[],
  check: LockCheck,
  by: Actor,
  at: string,
  options: { lockAnyway: boolean },
): LockResult {
  if (by.role !== "org_admin") return { ok: false, error: "Only an organization admin can lock a pay period." };
  if (state.status === "locked") return { ok: false, error: "This pay period is already locked." };
  if (typeof at !== "string" || at.trim() === "") return { ok: false, error: "The time of the lock is missing." };
  if (check.blocked && !options.lockAnyway) {
    return {
      ok: false,
      error: `This period has ${plural(check.missingCheckOutDays, "day", "days")} with a missing check-out and ${plural(check.pendingOvertimeEntries, "overtime day", "overtime days")} waiting for approval. Fix them, or lock anyway.`,
    };
  }
  return {
    ok: true,
    state: {
      ...state,
      status: "locked",
      lockedAt: at,
      lockedBy: by.uid,
      lockedOverride: check.blocked
        ? { missingCheckOutDays: check.missingCheckOutDays, pendingOvertimeEntries: check.pendingOvertimeEntries }
        : null,
    },
    lineIds: lines.map((l) => periodLineId(state.id, l.employeeId, state.version)),
  };
}

export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 500;

export type ReopenResult = { ok: true; state: PayPeriodState } | { ok: false; error: string };

/** Reopens a locked period with a written reason. Raises the version; the earlier version's lines are kept. */
export function reopenPeriod(state: PayPeriodState, by: Actor, at: string, reason: string): ReopenResult {
  if (by.role !== "org_admin") return { ok: false, error: "Only an organization admin can reopen a pay period." };
  if (state.status !== "locked") return { ok: false, error: "Only a locked pay period can be reopened." };
  if (typeof at !== "string" || at.trim() === "") return { ok: false, error: "The time of the change is missing." };
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < MIN_REASON_LENGTH || why.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `Write why you are reopening it, between ${MIN_REASON_LENGTH} and ${MAX_REASON_LENGTH} characters.` };
  }
  return {
    ok: true,
    state: {
      ...state,
      status: "open",
      version: state.version + 1,
      lockedAt: null,
      lockedBy: null,
      lockedOverride: null,
      reopenLog: [...state.reopenLog, { fromVersion: state.version, reason: why, by: by.uid, at }],
    },
  };
}
