/**
 * The standard workday, as pure functions: how long a day is, and which weekdays, for people who have no shift.
 *
 * It is an optional organization setting (docs/TIMESHEET-DESIGN.md, decision 1). Until an admin sets it, a person with
 * no shift has no expected time and the timesheet shows their hours only. Once set, a work day expects the standard
 * length, and any other day expects nothing. The overtime work reads the same two stored fields, so there is one
 * place to set it.
 *
 * Stored on the organization as `standardDayMinutes` (whole minutes) and `workDays` (Monday = 0 to Sunday = 6).
 * Pure: no database, no clock, no device time, no alias imports.
 */

export interface StandardWorkday {
  /** The length of a day in whole minutes. */
  minutes: number;
  /** The weekdays it applies to, Monday = 0 to Sunday = 6, sorted, no repeats. */
  workDays: number[];
}

export const MIN_WORKDAY_MINUTES = 30;
export const MAX_WORKDAY_MINUTES = 16 * 60;
export const DEFAULT_WORK_DAYS: readonly number[] = [0, 1, 2, 3, 4];

const whole = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function cleanDays(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((d) => whole(d, 0, 6))) return null;
  return [...new Set(raw as number[])].sort((a, b) => a - b);
}

/**
 * The setting as stored on an organization. null means "not set": a missing or damaged length reads as not set (so
 * nobody is ever given an expected time that was not chosen), and missing or damaged work days read as Monday to Friday.
 */
export function parseStoredWorkday(orgData: unknown): StandardWorkday | null {
  if (!orgData || typeof orgData !== "object" || Array.isArray(orgData)) return null;
  const r = orgData as Record<string, unknown>;
  if (!whole(r.standardDayMinutes, MIN_WORKDAY_MINUTES, MAX_WORKDAY_MINUTES)) return null;
  return { minutes: r.standardDayMinutes, workDays: cleanDays(r.workDays) ?? [...DEFAULT_WORK_DAYS] };
}

export type ParseWorkdayInputResult = { ok: true; value: StandardWorkday | null } | { ok: false; error: string };

/** What an admin sends to save. `{ clear: true }` removes the setting. Anything else is checked and refused in words. */
export function parseWorkdayInput(raw: unknown): ParseWorkdayInputResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Choose how long a day is and which days it applies to." };
  }
  const r = raw as Record<string, unknown>;
  if (r.clear === true) return { ok: true, value: null };
  if (!whole(r.minutes, MIN_WORKDAY_MINUTES, MAX_WORKDAY_MINUTES)) {
    return { ok: false, error: "A standard day must be between 30 minutes and 16 hours." };
  }
  const workDays = cleanDays(r.workDays);
  if (!workDays) return { ok: false, error: "Choose at least one day of the week." };
  return { ok: true, value: { minutes: r.minutes, workDays } };
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function lengthWords(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h > 0 ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mins = m > 0 ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  return [hours, mins].filter(Boolean).join(" ");
}

function daysWords(days: readonly number[]): string {
  // Runs of three or more in a row read as "Monday to Friday"; anything else is listed.
  const parts: string[] = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
    if (j - i >= 2) parts.push(`${DAY_NAMES[days[i]]} to ${DAY_NAMES[days[j]]}`);
    else for (let k = i; k <= j; k++) parts.push(DAY_NAMES[days[k]]);
    i = j + 1;
  }
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "8 hours a day, Monday to Friday". */
export function workdaySummary(w: StandardWorkday): string {
  return `${lengthWords(w.minutes)} a day, ${daysWords(w.workDays)}`;
}

/** What a day with no shift expects: the standard length on a work day, nothing otherwise. `weekday` is Monday = 0. */
export function standardMinutesFor(w: StandardWorkday, weekday: number): number {
  return w.workDays.includes(weekday) ? w.minutes : 0;
}
