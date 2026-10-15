/**
 * Plain-language text for the shift screens. Pure: no React, no Firebase, so it can be tested directly.
 */
import { MAX_WINDOW_MINUTES, MIN_WINDOW_MINUTES, type ShiftType } from "./shift-engine.ts";

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  day: "Day",
  early: "Early",
  late: "Late",
  night: "Night",
  flex: "Flexible",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** 480 -> "8", 450 -> "7.5", 495 -> "8.25". Blank when there is no figure. */
export function expectedMinutesToHours(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return "";
  const hours = Math.round((minutes / 60) * 100) / 100;
  return String(hours);
}

/** Hours typed by a person (1 to 24) to the whole minutes the server wants. Null when it is not a usable number. */
export function hoursToExpectedMinutes(hours: number): number | null {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 1 || hours > 24) return null;
  return Math.round(hours * 60);
}

/** "22:00 to 06:00 (overnight)", "09:00 to 17:00", "Flexible, 8 hours", plus ", 10 minutes grace" when there is some. */
export function describeShiftTimes(shift: {
  type: ShiftType;
  start: string | null;
  end: string | null;
  expectedMinutes: number | null;
  graceMinutes: number;
}): string {
  let base: string;
  if (shift.type === "flex") {
    const hours = expectedMinutesToHours(shift.expectedMinutes);
    base = hours ? `Flexible, ${hours} ${hours === "1" ? "hour" : "hours"}` : "Flexible";
  } else if (shift.start && shift.end) {
    const overnight = shift.end < shift.start;
    base = `${shift.start} to ${shift.end}${overnight ? " (overnight)" : ""}`;
  } else {
    base = "Times not set";
  }
  const grace = Number.isFinite(shift.graceMinutes) ? Math.floor(shift.graceMinutes) : 0;
  return grace > 0 ? `${base}, ${plural(grace, "minute", "minutes")} grace` : base;
}

/** The allowed-time box: a whole number from 30 to 240, with a plain sentence when it is not. */
export function windowFromInput(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const text = (raw ?? "").trim();
  const range = `from ${MIN_WINDOW_MINUTES} to ${MAX_WINDOW_MINUTES} minutes`;
  if (text === "") return { ok: false, error: `Enter the allowed time in minutes, ${range}.` };
  if (!/^\d+$/.test(text)) return { ok: false, error: `Use a whole number of minutes, ${range}.` };
  const value = Number(text);
  if (value < MIN_WINDOW_MINUTES || value > MAX_WINDOW_MINUTES) {
    return { ok: false, error: `The allowed time must be ${range}.` };
  }
  return { ok: true, value };
}
