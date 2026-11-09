/**
 * Overtime (docs/PAYROLL-OVERTIME-DESIGN.md, section 3.1), as pure functions.
 *
 * ChecIN measures time and never calculates pay: overtime is a number of minutes, nothing more. Overtime is the paid
 * time beyond what the day expected, counted per day. Extra time under a threshold (15 minutes by default) counts
 * as zero; at or over it, the WHOLE extra counts. Nothing is rounded. A manager approves it day by day; only
 * approved minutes are overtime, and the rest is reported apart, never silently dropped and never silently paid.
 *
 * Pure: no database, no clock reads (the caller passes the time of a decision), no device time, no alias imports.
 */
import { expectedShiftMinutes, type TimesheetShift } from "./timesheet.ts";
import { weekdayIndex } from "./attendance-today.ts";

// ----------------------------------------------------------------------------- settings

export interface OvertimeSettings {
  /** Off until an admin switches it on, so nobody is surprised. */
  enabled: boolean;
  /** The length of a day for someone with no shift, in minutes. */
  standardDayMinutes: number;
  /** Extra time under this is zero; at or over it, all of it counts. */
  thresholdMinutes: number;
  /** The weekdays a standard day applies to, Monday = 0 to Sunday = 6. */
  workDays: number[];
}

export const DEFAULT_OVERTIME_SETTINGS: OvertimeSettings = {
  enabled: false,
  standardDayMinutes: 480,
  thresholdMinutes: 15,
  workDays: [0, 1, 2, 3, 4],
};

export type ParseOvertimeResult = { ok: true; value: OvertimeSettings } | { ok: false; error: string };

const whole = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Checks saved settings; parts that are missing take their default. Anything else is refused in plain words. */
export function parseOvertimeSettings(raw: unknown): ParseOvertimeResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "The overtime settings could not be read." };
  }
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_OVERTIME_SETTINGS;

  if (r.enabled !== undefined && typeof r.enabled !== "boolean") {
    return { ok: false, error: "Overtime must be switched on or off." };
  }
  if (r.standardDayMinutes !== undefined && !whole(r.standardDayMinutes, 30, 960)) {
    return { ok: false, error: "A standard day must be a whole number of minutes, from 30 minutes to 16 hours." };
  }
  if (r.thresholdMinutes !== undefined && !whole(r.thresholdMinutes, 0, 120)) {
    return { ok: false, error: "The overtime threshold must be a whole number of minutes, from 0 to 120." };
  }
  let workDays = d.workDays;
  if (r.workDays !== undefined) {
    const days = r.workDays;
    if (!Array.isArray(days) || days.length === 0 || !days.every((x) => whole(x, 0, 6))) {
      return { ok: false, error: "Choose at least one work day, from Monday to Sunday." };
    }
    workDays = [...new Set(days as number[])].sort((a, b) => a - b);
  }

  return {
    ok: true,
    value: {
      enabled: (r.enabled as boolean | undefined) ?? d.enabled,
      standardDayMinutes: (r.standardDayMinutes as number | undefined) ?? d.standardDayMinutes,
      thresholdMinutes: (r.thresholdMinutes as number | undefined) ?? d.thresholdMinutes,
      workDays,
    },
  };
}

// ----------------------------------------------------------------------------- one day

const clean = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Days that owe no hours: nothing is expected, whatever shift was rostered. */
const NO_HOURS_OWED = new Set(["holiday", "leave", "off", "wfh", "other", "expected"]);

/**
 * What a day expected, in minutes. A shift expects its own length (less its unpaid break when breaks are tracked).
 * With no shift, a working weekday expects the standard day and any other day expects nothing. A damaged shift is
 * treated as no shift. Leave, holidays, days off and work from home expect nothing.
 */
export function expectedMinutesForDay(input: {
  dayKey: string;
  status: string;
  shift?: TimesheetShift | null;
  settings: OvertimeSettings;
  breaksTracked: boolean;
}): number {
  if (NO_HOURS_OWED.has(input.status)) return 0;
  const fromShift = expectedShiftMinutes(input.shift, input.breaksTracked);
  if (fromShift !== null) return fromShift;
  return input.settings.workDays.includes(weekdayIndex(input.dayKey)) ? input.settings.standardDayMinutes : 0;
}

/**
 * The overtime for one day: the paid time beyond what was expected. Under the threshold it is zero; at or over it,
 * the whole extra counts. Damaged numbers count as zero, so nothing is ever invented.
 */
export function overtimeMinutes(input: { paidMinutes: unknown; expectedMinutes: unknown; thresholdMinutes: unknown }): number {
  const paid = clean(input.paidMinutes);
  const expected = clean(input.expectedMinutes);
  const threshold =
    typeof input.thresholdMinutes === "number" && Number.isFinite(input.thresholdMinutes) && input.thresholdMinutes >= 0
      ? Math.floor(input.thresholdMinutes)
      : DEFAULT_OVERTIME_SETTINGS.thresholdMinutes;
  const extra = paid - expected;
  if (extra <= 0) return 0;
  return extra < threshold ? 0 : extra;
}

// ----------------------------------------------------------------------------- entries

export type OvertimeStatus = "pending" | "approved" | "declined";

export interface OvertimeEntry {
  /** The employee and the day: the same day always gives the same id, so a retry cannot make a second one. */
  id: string;
  employeeId: string;
  dayKey: string;
  minutes: number;
  status: OvertimeStatus;
  /** The manager stored on that day's summary, so moving a person later does not reroute old days. */
  managerId?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
}

export function overtimeEntryId(employeeId: string, dayKey: string): string {
  return `${employeeId}_${dayKey}`;
}

export interface OvertimeDayInput {
  employeeId: string;
  dayKey: string;
  managerId: string | null;
  status: string;
  paidMinutes: unknown;
  shift?: TimesheetShift | null;
}

/** The pending entries for a set of days. Nothing at all while overtime is off. In a fixed order. */
export function generateOvertime(days: readonly OvertimeDayInput[], settings: OvertimeSettings, breaksTracked: boolean): OvertimeEntry[] {
  if (!settings.enabled) return [];
  const byId = new Map<string, OvertimeEntry>();
  for (const d of days) {
    const expected = expectedMinutesForDay({ dayKey: d.dayKey, status: d.status, shift: d.shift, settings, breaksTracked });
    const minutes = overtimeMinutes({ paidMinutes: d.paidMinutes, expectedMinutes: expected, thresholdMinutes: settings.thresholdMinutes });
    if (minutes <= 0) continue;
    const id = overtimeEntryId(d.employeeId, d.dayKey);
    byId.set(id, { id, employeeId: d.employeeId, dayKey: d.dayKey, minutes, status: "pending", managerId: d.managerId });
  }
  return [...byId.values()].sort((a, b) =>
    a.employeeId === b.employeeId ? a.dayKey.localeCompare(b.dayKey) : a.employeeId.localeCompare(b.employeeId),
  );
}

export interface ReconcileResult {
  /** New entries, and pending ones whose figure changed. */
  write: OvertimeEntry[];
  /** Pending entries that are no longer overtime. */
  remove: string[];
  /** Decided entries whose figure no longer matches: reported, never changed. */
  stale: { id: string; decidedMinutes: number; newMinutes: number }[];
}

/**
 * Compares what is stored with what the days now say. A decided entry is never overwritten or removed. Running it
 * again after applying the result changes nothing.
 */
export function reconcileOvertime(existing: readonly OvertimeEntry[], generated: readonly OvertimeEntry[]): ReconcileResult {
  const have = new Map(existing.map((e) => [e.id, e]));
  const want = new Map(generated.map((e) => [e.id, e]));
  const write: OvertimeEntry[] = [];
  const remove: string[] = [];
  const stale: ReconcileResult["stale"] = [];

  for (const g of generated) {
    const ex = have.get(g.id);
    if (!ex) write.push(g);
    else if (ex.status === "pending") {
      if (ex.minutes !== g.minutes) write.push({ ...ex, minutes: g.minutes, managerId: g.managerId ?? ex.managerId });
    } else if (ex.minutes !== g.minutes) {
      stale.push({ id: g.id, decidedMinutes: ex.minutes, newMinutes: g.minutes });
    }
  }
  for (const ex of existing) {
    if (want.has(ex.id)) continue;
    if (ex.status === "pending") remove.push(ex.id);
    else stale.push({ id: ex.id, decidedMinutes: ex.minutes, newMinutes: 0 });
  }

  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  return { write: write.sort(byId), remove: remove.sort(), stale: stale.sort(byId) };
}

// ----------------------------------------------------------------------------- deciding

export interface Decider {
  role: string;
  uid: string;
}

/** The day's manager, or any org admin. An employee never, not even for their own overtime. */
export function canDecideOvertime(caller: Decider, entry: Pick<OvertimeEntry, "managerId">): boolean {
  if (caller.role === "org_admin") return true;
  if (caller.role !== "manager") return false;
  return (
    typeof caller.uid === "string" &&
    caller.uid !== "" &&
    typeof entry.managerId === "string" &&
    entry.managerId !== "" &&
    entry.managerId === caller.uid
  );
}

export type DecideResult = { ok: true; entry: OvertimeEntry } | { ok: false; error: string };

/** Approve or decline a pending entry, once. The original is not changed. */
export function decideOvertime(entry: OvertimeEntry, decision: string, caller: Decider, at: string): DecideResult {
  if (decision !== "approve" && decision !== "decline") return { ok: false, error: "Choose approve or decline." };
  if (typeof at !== "string" || at.trim() === "") return { ok: false, error: "The time of the decision is missing." };
  if (!canDecideOvertime(caller, entry)) return { ok: false, error: "You can only decide overtime for your own team." };
  if (entry.status !== "pending") return { ok: false, error: "This overtime has already been decided." };
  return {
    ok: true,
    entry: { ...entry, status: decision === "approve" ? "approved" : "declined", decidedBy: caller.uid, decidedAt: at },
  };
}

/** "Approve all": every pending entry the caller is allowed to decide, approved. Declined ones are left alone. */
export function approveAllPending(entries: readonly OvertimeEntry[], caller: Decider, at: string): OvertimeEntry[] {
  const out: OvertimeEntry[] = [];
  for (const e of entries) {
    if (e.status !== "pending") continue;
    const r = decideOvertime(e, "approve", caller, at);
    if (r.ok) out.push(r.entry);
  }
  return out;
}

// ----------------------------------------------------------------------------- totals

export interface OvertimeTotals {
  /** The only figure that is overtime. */
  approvedMinutes: number;
  pendingMinutes: number;
  declinedMinutes: number;
  /** Pending plus declined: the extra time that is exported in its own column, never as overtime. */
  unapprovedMinutes: number;
}

export function overtimeTotals(entries: readonly OvertimeEntry[]): OvertimeTotals {
  const t: OvertimeTotals = { approvedMinutes: 0, pendingMinutes: 0, declinedMinutes: 0, unapprovedMinutes: 0 };
  for (const e of entries) {
    const m = clean(e.minutes);
    if (e.status === "approved") t.approvedMinutes += m;
    else if (e.status === "pending") t.pendingMinutes += m;
    else if (e.status === "declined") t.declinedMinutes += m;
  }
  t.unapprovedMinutes = t.pendingMinutes + t.declinedMinutes;
  return t;
}
