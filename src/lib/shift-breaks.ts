/**
 * Pure calculation for fixed unpaid breaks on shifts (see docs/SHIFTS-DESIGN.md,
 * "Breaks", and decision (c) "Way 1").
 *
 * The rule: a shift can have a fixed unpaid break of N minutes. It is deducted
 * only when the person was at work for MORE than a set number of minutes
 * (for example more than 6 hours). Reports keep three separate figures:
 * time at work, break, and paid time. The raw minutes from the scans are never
 * changed here; this module only works out the break and paid figures from them.
 *
 * No Firebase, no clock reads, no dates: the caller passes whole minutes, so a
 * night shift that crosses midnight is just its total minutes.
 */

export const MIN_UNPAID_BREAK_MINUTES = 0;
export const MAX_UNPAID_BREAK_MINUTES = 240;
export const MIN_DEDUCT_AFTER_MINUTES = 0;
export const MAX_DEDUCT_AFTER_MINUTES = 720;
export const DEFAULT_UNPAID_BREAK_MINUTES = 0; // no break unless one is set
export const DEFAULT_DEDUCT_AFTER_MINUTES = 360; // deduct only after more than 6 hours

export interface PaidTimeInput {
  workedMinutes: number; // whole minutes at work, from the scans
  unpaidBreakMinutes: number; // whole minutes, 0 to 240
  deductAfterMinutes: number; // whole minutes, 0 to 720
}

export interface PaidTime {
  workedMinutes: number; // unchanged from the input
  breakMinutes: number; // what was deducted (0 when no deduction)
  paidMinutes: number; // workedMinutes - breakMinutes
}

export interface BreakSettings {
  unpaidBreakMinutes: number;
  deductAfterMinutes: number;
}

export type ParseBreakSettingsResult =
  | { ok: true; value: BreakSettings }
  | { ok: false; error: string };

export const BREAK_MINUTES_ERROR = `The unpaid break must be a whole number of minutes from ${MIN_UNPAID_BREAK_MINUTES} to ${MAX_UNPAID_BREAK_MINUTES}.`;
export const DEDUCT_AFTER_ERROR = `The time before a break is deducted must be a whole number of minutes from ${MIN_DEDUCT_AFTER_MINUTES} to ${MAX_DEDUCT_AFTER_MINUTES}.`;
export const WORKED_MINUTES_ERROR = "Time at work must be a whole number of minutes, 0 or more.";

function isWholeInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

/**
 * Validates the two break settings as an admin would enter them.
 * A missing break counts as 0 (no break); a missing limit uses the default (6 hours).
 * Anything else that is not a whole number in range is refused with a plain sentence.
 */
export function parseBreakSettings(raw: unknown): ParseBreakSettingsResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: BREAK_MINUTES_ERROR };
  }
  const r = raw as Record<string, unknown>;

  const unpaidBreakMinutes =
    r.unpaidBreakMinutes === undefined ? DEFAULT_UNPAID_BREAK_MINUTES : r.unpaidBreakMinutes;
  if (!isWholeInRange(unpaidBreakMinutes, MIN_UNPAID_BREAK_MINUTES, MAX_UNPAID_BREAK_MINUTES)) {
    return { ok: false, error: BREAK_MINUTES_ERROR };
  }

  const deductAfterMinutes =
    r.deductAfterMinutes === undefined ? DEFAULT_DEDUCT_AFTER_MINUTES : r.deductAfterMinutes;
  if (!isWholeInRange(deductAfterMinutes, MIN_DEDUCT_AFTER_MINUTES, MAX_DEDUCT_AFTER_MINUTES)) {
    return { ok: false, error: DEDUCT_AFTER_ERROR };
  }

  return { ok: true, value: { unpaidBreakMinutes, deductAfterMinutes } };
}

/**
 * Works out time at work, break and paid time for one shift.
 *
 * - The break is deducted only when workedMinutes is MORE than deductAfterMinutes
 *   (exactly at the limit: no deduction).
 * - The break never exceeds the time worked, so paid time is never negative.
 * - All three results are whole minutes, 0 or more; workedMinutes is returned unchanged.
 *
 * Throws a RangeError with a plain sentence for invalid input (a non-number,
 * a fraction, a negative, or a setting out of range). Callers should validate
 * stored settings with parseBreakSettings first.
 */
export function computePaidTime(input: PaidTimeInput): PaidTime {
  if (!input || typeof input !== "object") {
    throw new RangeError(WORKED_MINUTES_ERROR);
  }
  const { workedMinutes, unpaidBreakMinutes, deductAfterMinutes } = input;

  if (!isWholeInRange(workedMinutes, 0, Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(WORKED_MINUTES_ERROR);
  }
  if (!isWholeInRange(unpaidBreakMinutes, MIN_UNPAID_BREAK_MINUTES, MAX_UNPAID_BREAK_MINUTES)) {
    throw new RangeError(BREAK_MINUTES_ERROR);
  }
  if (!isWholeInRange(deductAfterMinutes, MIN_DEDUCT_AFTER_MINUTES, MAX_DEDUCT_AFTER_MINUTES)) {
    throw new RangeError(DEDUCT_AFTER_ERROR);
  }

  const breakMinutes =
    workedMinutes > deductAfterMinutes ? Math.min(unpaidBreakMinutes, workedMinutes) : 0;

  return {
    workedMinutes,
    breakMinutes,
    paidMinutes: workedMinutes - breakMinutes,
  };
}