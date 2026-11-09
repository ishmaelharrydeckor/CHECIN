/**
 * Pay periods (docs/PAYROLL-OVERTIME-DESIGN.md, section 3.2), as pure functions.
 *
 * A period is a run of whole calendar days in the organization's timezone, named by `dayKey` strings
 * ("YYYY-MM-DD"). Because only calendar days are used, daylight saving can never move a boundary. One type per
 * organization: weekly, every two weeks, twice a month (the 1st to the 15th and the 16th to the end of the month)
 * or monthly. Weekly and two-weekly periods are counted from an anchor day the admin chooses.
 *
 * Pure: no database, no clock reads, no device time, no alias imports (relative `.ts` imports only).
 */

export type PayPeriodType = "weekly" | "biweekly" | "semimonthly" | "monthly";

export const PAY_PERIOD_TYPES: readonly PayPeriodType[] = ["weekly", "biweekly", "semimonthly", "monthly"];

export interface PayPeriodSettings {
  type: PayPeriodType;
  /** Any real day that a weekly or two-weekly period starts on. Not used by the other two types. */
  anchorDay?: string;
}

export interface PayPeriod {
  startDay: string;
  endDay: string;
  /** How many days it covers, both ends counted. */
  days: number;
}

/** The most periods one listing returns, so a careless range can never build a huge list. */
export const MAX_PERIODS_LISTED = 60;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function dayNumber(day: unknown): number {
  const m = typeof day === "string" ? DAY_RE.exec(day) : null;
  if (!m) throw new RangeError("A day must be written as YYYY-MM-DD.");
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new RangeError("That day does not exist.");
  }
  return Math.round(ms / MS_PER_DAY);
}

function dayFromNumber(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

function addDaysTo(day: string, n: number): string {
  return dayFromNumber(dayNumber(day) + n);
}

function lastDayOfMonth(first: string): string {
  const y = Number(first.slice(0, 4));
  const m = Number(first.slice(5, 7));
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDaysTo(nextFirst, -1);
}

function period(startDay: string, endDay: string): PayPeriod {
  return { startDay, endDay, days: dayNumber(endDay) - dayNumber(startDay) + 1 };
}

// ----------------------------------------------------------------------------- settings

export type ParsePayPeriodResult = { ok: true; value: PayPeriodSettings } | { ok: false; error: string };

const ANCHOR_ERROR = "Choose the first day of a pay period, as a real date between 2000 and 2100.";

/** Checks the settings an admin saved. Anything else is refused in plain words. */
export function parsePayPeriodSettings(raw: unknown): ParsePayPeriodResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Choose how often your people are paid." };
  }
  const { type, anchorDay } = raw as Record<string, unknown>;
  if (typeof type !== "string" || !PAY_PERIOD_TYPES.includes(type as PayPeriodType)) {
    return { ok: false, error: "Choose weekly, every two weeks, twice a month or monthly." };
  }
  if (type === "weekly" || type === "biweekly") {
    if (typeof anchorDay !== "string") return { ok: false, error: ANCHOR_ERROR };
    try {
      dayNumber(anchorDay);
    } catch {
      return { ok: false, error: ANCHOR_ERROR };
    }
    const year = Number(anchorDay.slice(0, 4));
    if (year < 2000 || year > 2100) return { ok: false, error: ANCHOR_ERROR };
    return { ok: true, value: { type, anchorDay } };
  }
  return { ok: true, value: { type: type as PayPeriodType } };
}

// ----------------------------------------------------------------------------- periods

function anchorNumber(settings: PayPeriodSettings): number {
  if (!settings.anchorDay) throw new RangeError(ANCHOR_ERROR);
  return dayNumber(settings.anchorDay);
}

/** The pay period that holds `day`. Refuses a day that is not a real calendar day. */
export function periodContaining(settings: PayPeriodSettings, day: string): PayPeriod {
  const n = dayNumber(day);
  switch (settings.type) {
    case "monthly": {
      const first = `${day.slice(0, 7)}-01`;
      return period(first, lastDayOfMonth(first));
    }
    case "semimonthly": {
      const first = `${day.slice(0, 7)}-01`;
      return Number(day.slice(8, 10)) <= 15
        ? period(first, `${day.slice(0, 7)}-15`)
        : period(`${day.slice(0, 7)}-16`, lastDayOfMonth(first));
    }
    case "weekly":
    case "biweekly": {
      const length = settings.type === "weekly" ? 7 : 14;
      const anchor = anchorNumber(settings);
      const start = anchor + Math.floor((n - anchor) / length) * length;
      return period(dayFromNumber(start), dayFromNumber(start + length - 1));
    }
    default:
      throw new RangeError("Unknown pay period type.");
  }
}

export function nextPeriod(settings: PayPeriodSettings, p: PayPeriod): PayPeriod {
  return periodContaining(settings, addDaysTo(p.endDay, 1));
}

export function previousPeriod(settings: PayPeriodSettings, p: PayPeriod): PayPeriod {
  return periodContaining(settings, addDaysTo(p.startDay, -1));
}

/**
 * Every period that touches `fromDay` to `toDay`, in order, at most `max` of them (never more than
 * MAX_PERIODS_LISTED). An end before the start gives an empty list.
 */
export function periodsBetween(settings: PayPeriodSettings, fromDay: string, toDay: string, max = MAX_PERIODS_LISTED): PayPeriod[] {
  const cap = Math.max(0, Math.min(max, MAX_PERIODS_LISTED));
  if (dayNumber(toDay) < dayNumber(fromDay)) return [];
  const out: PayPeriod[] = [];
  let p = periodContaining(settings, fromDay);
  while (out.length < cap && p.startDay <= toDay) {
    out.push(p);
    p = nextPeriod(settings, p);
  }
  return out;
}

/** The days of a period, in order. */
export function daysInPeriod(p: PayPeriod): string[] {
  const start = dayNumber(p.startDay);
  const end = dayNumber(p.endDay);
  const out: string[] = [];
  for (let n = start; n <= end; n++) out.push(dayFromNumber(n));
  return out;
}

/** The stored id of a period: the organization and its first day. */
export function payPeriodId(orgId: string, startDay: string): string {
  if (typeof orgId !== "string" || orgId.trim() === "") throw new RangeError("A pay period needs an organization.");
  dayNumber(startDay);
  return `${orgId}_${startDay}`;
}
