// Reporting/closing time windows. Pure functions, no I/O.
// These only drive the kiosk label and the late/earlyDeparture flags on a
// clock event. They must never decide whether a scan succeeds or which
// direction (in/out) it records.

export type KioskMode = "check_in" | "check_out" | "idle";

export interface LocationHours {
  reportingTime?: string | null; // "HH:MM" 24h, org timezone
  closingTime?: string | null; // "HH:MM" 24h, org timezone
  checkoutWindowMinutes?: number | null;
}

export const DEFAULT_CHECKOUT_WINDOW_MINUTES = 120;
export const MAX_CHECKOUT_WINDOW_MINUTES = 720;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since local midnight in the given IANA timezone (falls back to UTC). */
export function minutesOfDayInZone(date: Date, timezone: string): number {
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function getKioskMode(hours: LocationHours, now: Date, timezone: string): KioskMode {
  if (!isValidTime(hours.reportingTime) || !isValidTime(hours.closingTime)) return "idle";
  const cur = minutesOfDayInZone(now, timezone);
  const reporting = toMinutes(hours.reportingTime);
  const closing = toMinutes(hours.closingTime);
  const window = hours.checkoutWindowMinutes ?? DEFAULT_CHECKOUT_WINDOW_MINUTES;
  if (cur < reporting) return "check_in";
  if (cur >= closing && cur < closing + window) return "check_out";
  return "idle";
}

export const KIOSK_MODE_LABEL: Record<KioskMode, string> = {
  check_in: "Scan to Check In",
  check_out: "Scan to Check Out",
  idle: "Scan to Check In / Out",
};

export interface ScanFlags {
  late: boolean;
  earlyDeparture: boolean;
}

/** Flags for a scan of the given direction. Both false when hours aren't configured. */
export function computeScanFlags(
  type: "in" | "out",
  hours: LocationHours,
  now: Date,
  timezone: string,
): ScanFlags {
  const cur = minutesOfDayInZone(now, timezone);
  const late =
    type === "in" && isValidTime(hours.reportingTime) && cur > toMinutes(hours.reportingTime);
  const earlyDeparture =
    type === "out" && isValidTime(hours.closingTime) && cur < toMinutes(hours.closingTime);
  return { late, earlyDeparture };
}

/**
 * Validates and normalizes hours from a request body. Returns only the fields
 * that were present; `error` is set if anything supplied is invalid.
 */
export function parseHoursInput(body: any): { value: LocationHours; error?: string } {
  const value: LocationHours = {};
  if (body?.reportingTime !== undefined) {
    if (!isValidTime(body.reportingTime)) return { value, error: "Reporting time must be HH:MM (24-hour)" };
    value.reportingTime = body.reportingTime;
  }
  if (body?.closingTime !== undefined) {
    if (!isValidTime(body.closingTime)) return { value, error: "Closing time must be HH:MM (24-hour)" };
    value.closingTime = body.closingTime;
  }
  if (body?.checkoutWindowMinutes !== undefined) {
    const n = Number(body.checkoutWindowMinutes);
    if (!Number.isInteger(n) || n < 15 || n > MAX_CHECKOUT_WINDOW_MINUTES) {
      return { value, error: `Check-out window must be 15–${MAX_CHECKOUT_WINDOW_MINUTES} minutes` };
    }
    value.checkoutWindowMinutes = n;
  }
  return { value };
}
