/**
 * Pure scan and status planner for shifts (task 3.1, phase 3; see docs/SHIFTS-DESIGN.md).
 *
 * Keeps all shift scan and status decisions out of the Firestore routes so they
 * can be unit tested directly. When shifts are off, disabled, or unassigned,
 * returns `{ kind: "legacy" }` so the caller runs the existing non-shift path
 * unchanged.
 */
import {
  classifyScan,
  describeOutside,
  type ShiftAssignment,
  type ShiftSnapshot,
  type ShiftState,
  type ShiftWindow,
} from "./shift-engine.ts";
import type { DailySummary } from "./daily-summary.ts";
import { dayKey } from "./attendance-day.ts";
import { addDays } from "./attendance-today.ts";
import type { ShiftSettings } from "./shift-requests.ts";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The three days whose shifts can matter to a scan at this instant: yesterday, today, tomorrow (organization timezone), oldest first. */
export function candidateShiftDays(nowMs: number, timezone: string): string[] {
  const today = dayKey(nowMs, timezone);
  if (!today) return [];
  return [addDays(today, -1), today, addDays(today, 1)];
}

export type ShiftScanPlan =
  | { kind: "legacy" } // do exactly what the app does today
  | {
      kind: "shift";
      shiftDay: string;
      shift: ShiftSnapshot;
      direction: "in" | "out";
      late: boolean;
      earlyDeparture: boolean;
      prev: DailySummary | null;
      window: ShiftWindow;
    }
  | {
      kind: "refuse";
      reason: "too_early" | "too_late";
      shiftDay: string;
      shift: ShiftSnapshot;
      window: ShiftWindow;
      message: string;
    };

export function planShiftScan(input: {
  settings: ShiftSettings; // from the kiosk cache entry
  disabled: boolean; // the SHIFTS_DISABLED switch
  nowMs: number;
  timezone: string;
  assignments: readonly ShiftAssignment[]; // those that exist, for candidateShiftDays; may be empty
  summaries: Readonly<Record<string, DailySummary | null>>; // keyed by day: the summary document for that shift day, or null
}): ShiftScanPlan {
  if (!input || input.disabled || !input.settings?.shiftsEnabled) {
    return { kind: "legacy" };
  }
  if (!Array.isArray(input.assignments) || input.assignments.length === 0) {
    return { kind: "legacy" };
  }

  const days = candidateShiftDays(input.nowMs, input.timezone);
  const summaries = input.summaries ?? {};
  const states: Record<string, ShiftState> = {};

  for (const day of days) {
    const s = summaries[day];
    const lastType = s?.lastEventType === "in" || s?.lastEventType === "out" ? s.lastEventType : null;
    states[day] = { lastType };
  }
  for (const a of input.assignments) {
    if (a && typeof a.dayKey === "string" && !(a.dayKey in states)) {
      const s = summaries[a.dayKey];
      const lastType = s?.lastEventType === "in" || s?.lastEventType === "out" ? s.lastEventType : null;
      states[a.dayKey] = { lastType };
    }
  }

  const classified = classifyScan({
    nowMs: input.nowMs,
    timezone: input.timezone,
    assignments: input.assignments,
    states,
    windowMinutes: input.settings.shiftWindowMinutes,
  });

  if (classified.kind === "unassigned") {
    return { kind: "legacy" };
  }

  if (classified.kind === "matched") {
    return {
      kind: "shift",
      shiftDay: classified.shiftDay,
      shift: classified.shift,
      direction: classified.direction,
      late: classified.late,
      earlyDeparture: classified.earlyDeparture,
      prev: summaries[classified.shiftDay] ?? null,
      window: classified.window,
    };
  }

  return {
    kind: "refuse",
    reason: classified.reason,
    shiftDay: classified.shiftDay,
    shift: classified.shift,
    window: classified.window,
    message: describeOutside(classified, input.timezone),
  };
}

export function planShiftStatus(input: {
  settings: ShiftSettings;
  disabled: boolean;
  nowMs: number;
  timezone: string;
  assignments: readonly ShiftAssignment[];
  summaries: Readonly<Record<string, DailySummary | null>>;
}): { kind: "legacy" } | { kind: "shift"; shiftDay: string; summary: DailySummary | null } {
  const plan = planShiftScan(input);
  if (plan.kind === "shift") {
    return {
      kind: "shift",
      shiftDay: plan.shiftDay,
      summary: plan.prev,
    };
  }
  return { kind: "legacy" };
}

/** Deterministic id: one note per person, shift day, reason and 10-minute period, so retries and repeated tries cannot flood the list. */
export function refusedScanId(
  employeeId: string,
  shiftDay: string,
  reason: string,
  nowMs: number,
): string {
  return `${employeeId}_${shiftDay}_${reason}_${Math.floor(nowMs / 600000)}`;
}

/**
 * Turns a stored `shift_assignments` document into a validated `ShiftAssignment`
 * only if it belongs to `expectedOrgId` and has an intact `shift` snapshot.
 * Returns null for missing, cross-tenant, or damaged documents.
 */
export function assignmentFromDoc(
  raw: unknown,
  expectedOrgId: string,
  fallbackDay?: string,
): ShiftAssignment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (typeof expectedOrgId !== "string" || !expectedOrgId || rec.orgId !== expectedOrgId) {
    return null;
  }

  const day = typeof rec.dayKey === "string" && rec.dayKey ? rec.dayKey : fallbackDay ?? "";
  if (!DAY_RE.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }

  if (!rec.shift || typeof rec.shift !== "object" || Array.isArray(rec.shift)) return null;
  const s = rec.shift as Record<string, unknown>;
  const shiftId =
    typeof s.shiftId === "string" && s.shiftId.trim().length > 0
      ? s.shiftId.trim()
      : typeof rec.shiftId === "string" && rec.shiftId.trim().length > 0
        ? rec.shiftId.trim()
        : "";
  const name = typeof s.name === "string" ? s.name.trim() : "";
  if (!shiftId || !name) return null;

  if (
    s.type !== "day" &&
    s.type !== "early" &&
    s.type !== "late" &&
    s.type !== "night" &&
    s.type !== "flex"
  ) {
    return null;
  }

  const graceMinutes = s.graceMinutes === undefined ? 0 : s.graceMinutes;
  if (typeof graceMinutes !== "number" || !Number.isFinite(graceMinutes) || graceMinutes < 0) {
    return null;
  }

  // A damaged break value must never stop a scan or lose a person's assignment: it just means no break.
  const breakFields = (() => {
    const b = s.unpaidBreakMinutes;
    if (typeof b !== "number" || !Number.isInteger(b) || b <= 0 || b > 240) return {};
    const a = s.deductAfterMinutes;
    const after = typeof a === "number" && Number.isInteger(a) && a >= 0 && a <= 720 ? a : 360;
    return { unpaidBreakMinutes: b, deductAfterMinutes: after };
  })();

  if (s.type === "flex") {
    const expectedMinutes =
      typeof s.expectedMinutes === "number" && Number.isFinite(s.expectedMinutes)
        ? s.expectedMinutes
        : null;
    return {
      dayKey: day,
      shift: {
        shiftId,
        name,
        type: "flex",
        start: null,
        end: null,
        graceMinutes,
        expectedMinutes,
        ...breakFields,
      },
    };
  }

  if (typeof s.start !== "string" || !TIME_RE.test(s.start)) return null;
  if (typeof s.end !== "string" || !TIME_RE.test(s.end)) return null;

  return {
    dayKey: day,
    shift: {
      shiftId,
      name,
      type: s.type,
      start: s.start,
      end: s.end,
      graceMinutes,
      expectedMinutes: null,
      ...breakFields,
    },
  };
}
