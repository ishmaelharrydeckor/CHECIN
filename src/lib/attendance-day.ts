/**
 * The "attendance day" and scan-direction rules, as pure functions.
 *
 * Calendar days are always computed in the ORGANIZATION's timezone, on the
 * server, never from the client clock (see docs/SYSTEM-DESIGN.md, section 6).
 * Keeping this free of Firebase and of path-alias imports means it can be unit
 * tested directly.
 */

export type ScanType = "in" | "out";

/** Minimum gap between two scans by the same person (prevents accidental double-clocking). */
export const SCAN_COOLDOWN_MS = 60_000;

function safeTimezone(tz: unknown): string {
  if (typeof tz !== "string" || !tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/**
 * The calendar day of an instant in the given IANA timezone, as "YYYY-MM-DD".
 * An unknown timezone falls back to UTC, matching how organizations are
 * created (register-org falls back to UTC for an invalid zone).
 * Returns null if the instant itself is not a valid date.
 */
export function dayKey(instant: Date | number | string, timezone: string): string | null {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : null;
}

export interface LastScan {
  type?: string;
  timestamp?: string | number;
}

/**
 * Direction of the next scan. Based on the person's most recent event TODAY
 * (in the org timezone), per AGENTS.md:
 *  - no event at all, or the last event was on an earlier day  -> "in"
 *    (a forgotten check-out yesterday must not turn this morning's first scan
 *    into an "out")
 *  - last event today was "in"  -> "out"
 *  - last event today was "out" -> "in"
 */
export function nextScanType(
  last: LastScan | null | undefined,
  now: Date | number,
  timezone: string,
): ScanType {
  if (!last || last.timestamp === undefined) return "in";
  const lastDay = dayKey(last.timestamp, timezone);
  const today = dayKey(now, timezone);
  if (!lastDay || !today || lastDay !== today) return "in";
  return last.type === "in" ? "out" : "in";
}

/**
 * Seconds the person must still wait before they can scan again, or 0 if they
 * can scan now. The cooldown applies across days (it only looks at elapsed time).
 */
export function cooldownSecondsLeft(
  last: LastScan | null | undefined,
  nowMs: number,
  cooldownMs: number = SCAN_COOLDOWN_MS,
): number {
  if (!last || last.timestamp === undefined) return 0;
  const lastMs = new Date(last.timestamp).getTime();
  if (Number.isNaN(lastMs)) return 0;
  const elapsed = nowMs - lastMs;
  if (elapsed < 0 || elapsed >= cooldownMs) return 0;
  return Math.ceil((cooldownMs - elapsed) / 1000);
}
