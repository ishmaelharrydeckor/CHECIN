/**
 * Pure request validation, settings parsing, and permission rules for shifts
 * (task 3.1, phase 2; see docs/SHIFTS-DESIGN.md sections 3b and 4).
 *
 * No Firebase and no system clock reads (`today` is passed in by the caller),
 * so every rule can be tested directly with the Node test runner.
 */
import {
  DEFAULT_WINDOW_MINUTES,
  MAX_ASSIGNMENT_RANGE_DAYS,
  MAX_WINDOW_MINUTES,
  MIN_WINDOW_MINUTES,
  assignmentId,
  expandAssignmentRange,
  parseShiftInput,
  type ShiftSnapshot,
} from "./shift-engine.ts";

export {
  DEFAULT_WINDOW_MINUTES,
  MAX_ASSIGNMENT_RANGE_DAYS,
  MAX_WINDOW_MINUTES,
  MIN_WINDOW_MINUTES,
  assignmentId,
  expandAssignmentRange,
  parseShiftInput,
  type ShiftSnapshot,
};

export const MAX_PEOPLE_PER_REQUEST = 50;
export const MAX_WRITES_PER_REQUEST = 500; // people x days
export const MAX_ACTIVE_SHIFTS = 100;
export const ASSIGNMENT_READ_CAP = 4000;

export type ScanMode = "strict" | "lenient";

export interface ShiftSettings {
  shiftsEnabled: boolean;
  shiftScanMode: ScanMode;
  shiftWindowMinutes: number;
  /** Reports show time at work, break and paid time. Off by default (docs/SHIFTS-DESIGN.md). */
  breaksEnabled: boolean;
}

export const DEFAULT_SHIFT_SETTINGS: ShiftSettings = {
  shiftsEnabled: false,
  shiftScanMode: "strict",
  shiftWindowMinutes: DEFAULT_WINDOW_MINUTES,
  breaksEnabled: false,
};

/** Reads what is saved on the organization; anything missing or wrong falls back to the default for that field. */
export function readShiftSettings(orgData: unknown): ShiftSettings {
  if (!orgData || typeof orgData !== "object" || Array.isArray(orgData)) {
    return { ...DEFAULT_SHIFT_SETTINGS };
  }
  const r = orgData as Record<string, unknown>;

  const shiftsEnabled =
    typeof r.shiftsEnabled === "boolean" ? r.shiftsEnabled : DEFAULT_SHIFT_SETTINGS.shiftsEnabled;

  const shiftScanMode: ScanMode =
    r.shiftScanMode === "strict" || r.shiftScanMode === "lenient"
      ? r.shiftScanMode
      : DEFAULT_SHIFT_SETTINGS.shiftScanMode;

  const shiftWindowMinutes =
    typeof r.shiftWindowMinutes === "number" &&
    Number.isInteger(r.shiftWindowMinutes) &&
    r.shiftWindowMinutes >= MIN_WINDOW_MINUTES &&
    r.shiftWindowMinutes <= MAX_WINDOW_MINUTES
      ? r.shiftWindowMinutes
      : DEFAULT_SHIFT_SETTINGS.shiftWindowMinutes;

  const breaksEnabled =
    typeof r.breaksEnabled === "boolean" ? r.breaksEnabled : DEFAULT_SHIFT_SETTINGS.breaksEnabled;

  return {
    shiftsEnabled,
    shiftScanMode,
    shiftWindowMinutes,
    breaksEnabled,
  };
}

/** What an admin sends to change settings: any of the three fields; others untouched. */
export function parseSettingsInput(
  raw: unknown,
): { ok: true; value: Partial<ShiftSettings> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Choose at least one shift setting to update." };
  }
  const r = raw as Record<string, unknown>;
  const value: Partial<ShiftSettings> = {};

  if (r.shiftsEnabled !== undefined) {
    if (typeof r.shiftsEnabled !== "boolean") {
      return { ok: false, error: "The shifts switch must be true or false." };
    }
    value.shiftsEnabled = r.shiftsEnabled;
  }

  if (r.shiftScanMode !== undefined) {
    if (r.shiftScanMode !== "strict" && r.shiftScanMode !== "lenient") {
      return { ok: false, error: 'Scan mode must be "strict" or "lenient".' };
    }
    value.shiftScanMode = r.shiftScanMode;
  }

  if (r.shiftWindowMinutes !== undefined) {
    if (
      typeof r.shiftWindowMinutes !== "number" ||
      !Number.isInteger(r.shiftWindowMinutes) ||
      r.shiftWindowMinutes < MIN_WINDOW_MINUTES ||
      r.shiftWindowMinutes > MAX_WINDOW_MINUTES
    ) {
      return {
        ok: false,
        error: `The scan window must be a whole number from ${MIN_WINDOW_MINUTES} to ${MAX_WINDOW_MINUTES} minutes.`,
      };
    }
    value.shiftWindowMinutes = r.shiftWindowMinutes;
  }

  if (r.breaksEnabled !== undefined) {
    if (typeof r.breaksEnabled !== "boolean") {
      return { ok: false, error: "The breaks switch must be true or false." };
    }
    value.breaksEnabled = r.breaksEnabled;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: "Choose at least one shift setting to update." };
  }

  return { ok: true, value };
}

export interface CallerLike {
  uid: string;
  role: string | null;
  shiftAdmin: boolean;
}

/** Org admin always; a manager only when their shiftAdmin switch is on; nobody else. */
export function canManageShifts(caller: CallerLike): boolean {
  if (!caller || typeof caller.uid !== "string" || caller.uid.trim().length === 0) {
    return false;
  }
  if (caller.role === "org_admin") return true;
  if (caller.role === "manager" && caller.shiftAdmin === true) return true;
  return false;
}

/** Admin: any shift. Manager with the switch: only a shift they created (createdBy equals their uid). */
export function canEditShift(caller: CallerLike, shiftCreatedBy: string | null): boolean {
  if (!canManageShifts(caller)) return false;
  if (caller.role === "org_admin") return true;
  if (caller.role === "manager" && caller.shiftAdmin === true) {
    return (
      typeof shiftCreatedBy === "string" &&
      shiftCreatedBy.trim().length > 0 &&
      shiftCreatedBy === caller.uid
    );
  }
  return false;
}

/**
 * Admin: anyone in the organization with role employee or manager.
 * Manager with the switch: only people whose managerId is their own uid (that includes themself).
 * Never an org_admin target.
 */
export function canAssignTo(
  caller: CallerLike,
  target: { role: string | null; managerId: string | null; uid: string },
): boolean {
  if (!canManageShifts(caller)) return false;
  if (!target || typeof target.uid !== "string" || target.uid.trim().length === 0) {
    return false;
  }
  if (target.role !== "employee" && target.role !== "manager") {
    return false;
  }
  if (caller.role === "org_admin") return true;
  if (caller.role === "manager" && caller.shiftAdmin === true) {
    if (target.managerId === caller.uid) return true;
    if (target.uid === caller.uid && target.managerId === null) return true;
    return false;
  }
  return false;
}

export interface AssignRequest {
  shiftId: string;
  employeeIds: string[];
  days: string[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function parseEmployeeIdList(
  rawIds: unknown,
): { ok: true; employeeIds: string[] } | { ok: false; error: string } {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { ok: false, error: "Choose at least one person." };
  }
  const seen = new Set<string>();
  const employeeIds: string[] = [];
  for (const item of rawIds) {
    if (typeof item !== "string" || item.trim().length === 0 || item.includes("/")) {
      return { ok: false, error: "Choose valid people to assign." };
    }
    const id = item.trim();
    if (!seen.has(id)) {
      seen.add(id);
      employeeIds.push(id);
    }
  }
  if (employeeIds.length === 0) {
    return { ok: false, error: "Choose at least one person." };
  }
  if (employeeIds.length > MAX_PEOPLE_PER_REQUEST) {
    return {
      ok: false,
      error: `You can choose at most ${MAX_PEOPLE_PER_REQUEST} people at a time.`,
    };
  }
  return { ok: true, employeeIds };
}

export function parseAssignRequest(
  raw: unknown,
  today: string,
): { ok: true; value: AssignRequest } | { ok: false; error: string } {
  if (typeof today !== "string" || !DAY_RE.test(today)) {
    return { ok: false, error: "Today's date is required." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Choose a shift, people and dates to assign." };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.shiftId !== "string" || r.shiftId.trim().length === 0 || r.shiftId.includes("/")) {
    return { ok: false, error: "Choose a shift to assign." };
  }
  const shiftId = r.shiftId.trim();

  const people = parseEmployeeIdList(r.employeeIds);
  if (!people.ok) return people;

  const expanded = expandAssignmentRange({
    fromDay: r.fromDay as string,
    toDay: r.toDay as string,
    weekdays: r.weekdays as readonly number[],
  });
  if (!expanded.ok) return expanded;

  if ((r.fromDay as string) < today || expanded.days.some((d) => d < today)) {
    return { ok: false, error: "Shifts can only be assigned from today onwards." };
  }

  if (people.employeeIds.length * expanded.days.length > MAX_WRITES_PER_REQUEST) {
    return {
      ok: false,
      error: "Too many assignments at once. Please choose fewer people or a shorter date range.",
    };
  }

  return {
    ok: true,
    value: {
      shiftId,
      employeeIds: people.employeeIds,
      days: expanded.days,
    },
  };
}

export interface ClearRequest {
  employeeIds: string[];
  days: string[];
}

export function parseClearRequest(
  raw: unknown,
  today: string,
): { ok: true; value: ClearRequest } | { ok: false; error: string } {
  if (typeof today !== "string" || !DAY_RE.test(today)) {
    return { ok: false, error: "Today's date is required." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Choose people and dates to clear." };
  }
  const r = raw as Record<string, unknown>;

  const people = parseEmployeeIdList(r.employeeIds);
  if (!people.ok) return people;

  const expanded = expandAssignmentRange({
    fromDay: r.fromDay as string,
    toDay: r.toDay as string,
    weekdays: ALL_WEEKDAYS,
  });
  if (!expanded.ok) return expanded;

  if ((r.fromDay as string) < today || expanded.days.some((d) => d < today)) {
    return { ok: false, error: "Shifts can only be assigned from today onwards." };
  }

  if (people.employeeIds.length * expanded.days.length > MAX_WRITES_PER_REQUEST) {
    return {
      ok: false,
      error: "Too many days at once. Please choose fewer people or a shorter date range.",
    };
  }

  return {
    ok: true,
    value: {
      employeeIds: people.employeeIds,
      days: expanded.days,
    },
  };
}

/** Turns a stored shift document into the snapshot copied onto assignments. Returns null if the document is damaged. */
export function snapshotFromShiftDoc(id: string, doc: unknown): ShiftSnapshot | null {
  if (typeof id !== "string" || id.trim().length === 0 || id.includes("/")) {
    return null;
  }
  const parsed = parseShiftInput(doc);
  if (!parsed.ok) return null;

  return {
    shiftId: id.trim(),
    name: parsed.value.name,
    type: parsed.value.type,
    start: parsed.value.start,
    end: parsed.value.end,
    graceMinutes: parsed.value.graceMinutes,
    expectedMinutes: parsed.value.expectedMinutes,
    // Copied with the shift, so editing a shift's break later never rewrites a day already assigned.
    ...(parsed.value.unpaidBreakMinutes !== undefined
      ? {
          unpaidBreakMinutes: parsed.value.unpaidBreakMinutes,
          deductAfterMinutes: parsed.value.deductAfterMinutes,
        }
      : {}),
  };
}
