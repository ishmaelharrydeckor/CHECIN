import { dayKey } from "./attendance-day.ts";

/**
 * Server-side numbers for the manager dashboard: today's counts, today's feed,
 * on-time rate, average shift, and the Mon-Fri trend.
 *
 * Why this exists: the dashboard used to compute these in the BROWSER from the
 * last 30-200 events across all days, in the browser's timezone, with a
 * hard-coded 9:15 AM cutoff. That gave wrong answers (for example "present
 * today" counted anyone whose latest event on ANY day was "in").
 *
 * Rules here:
 *  - A "day" is the calendar day in the ORGANIZATION's timezone (dayKey).
 *  - "Late" is the flag stored on the check-in event when it was recorded
 *    (computed from that location's reporting time), never a hard-coded time.
 *  - Pure functions: no Firebase, no clock reads (callers pass `now`).
 */

export interface RawEvent {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeEmail?: string;
  department?: string;
  locationName?: string;
  type: "in" | "out";
  timestamp: string;
  late?: boolean;
  earlyDeparture?: boolean;
}

export interface RosterMember {
  uid: string;
  displayName?: string;
  email?: string;
  department?: string;
}

export interface TodayEventRow {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  initials: string;
  department: string;
  location: string;
  type: "in" | "out";
  late: boolean;
  earlyDeparture: boolean;
  /** "HH:MM", 24-hour, in the organization's timezone. */
  time: string;
  timestamp: string;
}

export interface TodayPerson {
  employeeId: string;
  name: string;
  department: string;
}

export interface TodayLate extends TodayPerson {
  arrivedAt: string;
}

export interface TodaySummaryData {
  dayKey: string;
  timezone: string;
  generatedAt: string;
  counts: {
    /** People in scope (registered staff on this team / organization). */
    expected: number;
    /** Distinct people with at least one check-in or check-out today. */
    present: number;
    /** Of those, people whose LAST event today is "in" (on site right now). */
    onSite: number;
    late: number;
    onLeave: number;
    wfh: number;
    absent: number;
  };
  onTimeRate: { percent: number | null; onTime: number; total: number };
  avgShift: { completed: number; inProgress: number; avgMinutes: number | null };
  /** Newest first, today only, capped at `eventLimit`. */
  events: TodayEventRow[];
  eventsTotal: number;
  late: TodayLate[];
  notArrived: TodayPerson[];
  /** True if the underlying query hit its safety cap (numbers may be undercounted). */
  truncated: boolean;
}

export interface WeekTrendDay {
  day: string; // "Mon"
  dayKey: string;
  isToday: boolean;
  future: boolean;
  present: number;
  late: number;
}

// ---------------------------------------------------------------------------
// Calendar helpers (pure date arithmetic on "YYYY-MM-DD" strings)
// ---------------------------------------------------------------------------

function parseDay(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** Adds whole calendar days to a "YYYY-MM-DD" key. No timezone involved. */
export function addDays(key: string, n: number): string {
  const { y, m, d } = parseDay(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Monday = 0 ... Sunday = 6, for a calendar day. */
export function weekdayIndex(key: string): number {
  const { y, m, d } = parseDay(key);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * The instant (ms since epoch) at which calendar day `key` begins in `timezone`.
 * Found by binary search because the offset can change (daylight saving).
 */
export function startOfDayMs(key: string, timezone: string): number {
  const { y, m, d } = parseDay(key);
  const midnightUtc = Date.UTC(y, m - 1, d);
  let lo = midnightUtc - 15 * 3600_000; // surely before the day starts, in every timezone
  let hi = midnightUtc + 15 * 3600_000; // surely inside (or after the start of) the day
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const k = dayKey(mid, timezone);
    if (k !== null && k >= key) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** [start, end) of a calendar day in the organization's timezone, in epoch ms. */
export function dayBoundsMs(key: string, timezone: string): { startMs: number; endMs: number } {
  const startMs = startOfDayMs(key, timezone);
  // start + 36h is always inside the NEXT day (days are 23-25h long)
  const nextKey = dayKey(startMs + 36 * 3600_000, timezone) ?? addDays(key, 1);
  return { startMs, endMs: startOfDayMs(nextKey, timezone) };
}

/** Monday-to-today window [start of Monday, end of today) for the trend query. */
export function weekBoundsMs(
  now: Date | number,
  timezone: string,
): { startMs: number; endMs: number; today: string; monday: string } {
  const today = dayKey(now, timezone) ?? new Date(now).toISOString().slice(0, 10);
  const monday = addDays(today, -weekdayIndex(today));
  return {
    startMs: startOfDayMs(monday, timezone),
    endMs: dayBoundsMs(today, timezone).endMs,
    today,
    monday,
  };
}

/** "HH:MM" (24-hour) for an instant, in the given timezone. */
export function formatClock(instant: Date | number | string, timezone: string): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return "--:--";
  let tz = timezone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return letters || "EM";
}

function byTime(a: RawEvent, b: RawEvent): number {
  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

export interface BuildTodayInput {
  events: RawEvent[];
  roster: RosterMember[];
  timezone: string;
  now: Date | number;
  eventLimit?: number;
  truncated?: boolean;
}

export function buildTodaySummary(input: BuildTodayInput): TodaySummaryData {
  const { roster, timezone, now } = input;
  const eventLimit = input.eventLimit ?? 20;
  const today = dayKey(now, timezone) ?? new Date(now).toISOString().slice(0, 10);

  // Keep only events on today's calendar day (the query is already bounded; this is a safety net).
  const todays = input.events.filter((e) => dayKey(e.timestamp, timezone) === today);

  const rosterById = new Map(roster.map((r) => [r.uid, r]));
  const perPerson = new Map<string, RawEvent[]>();
  for (const e of todays) {
    const list = perPerson.get(e.employeeId);
    if (list) list.push(e);
    else perPerson.set(e.employeeId, [e]);
  }

  const describe = (id: string, sample?: RawEvent): TodayPerson => {
    const member = rosterById.get(id);
    return {
      employeeId: id,
      name: member?.displayName || sample?.employeeName || sample?.employeeEmail || "Employee",
      department: sample?.department || member?.department || "",
    };
  };

  let onSite = 0;
  const late: TodayLate[] = [];
  let withFirstIn = 0;
  let lateFirstIn = 0;
  const shiftMinutes: number[] = [];
  let inProgress = 0;

  for (const [id, list] of perPerson) {
    list.sort(byTime);
    if (list[list.length - 1].type === "in") onSite++;

    const firstIn = list.find((e) => e.type === "in");
    if (firstIn) {
      withFirstIn++;
      if (firstIn.late === true) {
        lateFirstIn++;
        late.push({ ...describe(id, firstIn), arrivedAt: formatClock(firstIn.timestamp, timezone) });
      }
    }

    let openIn: number | null = null;
    for (const e of list) {
      const t = new Date(e.timestamp).getTime();
      if (e.type === "in") openIn = t;
      else if (openIn !== null) {
        const minutes = (t - openIn) / 60_000;
        if (minutes > 0) shiftMinutes.push(minutes);
        openIn = null;
      }
    }
    if (openIn !== null) inProgress++;
  }

  late.sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));

  const notArrived: TodayPerson[] = roster
    .filter((r) => !perPerson.has(r.uid))
    .map((r) => ({ employeeId: r.uid, name: r.displayName || r.email || "Employee", department: r.department || "" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const present = perPerson.size;
  const expected = roster.length;
  const onLeave = 0; // wired up when leave requests land (task 1.1)
  const wfh = 0; // wired up with work-from-home (task 2.3)

  const newestFirst = [...todays].sort((a, b) => byTime(b, a));
  const events: TodayEventRow[] = newestFirst.slice(0, eventLimit).map((e) => {
    const member = rosterById.get(e.employeeId);
    const name = e.employeeName || member?.displayName || e.employeeEmail || "Employee";
    return {
      id: e.id,
      employeeId: e.employeeId,
      name,
      email: e.employeeEmail || member?.email || "",
      initials: initialsOf(name),
      department: e.department || member?.department || "",
      location: e.locationName || "",
      type: e.type === "out" ? "out" : "in",
      late: e.late === true,
      earlyDeparture: e.earlyDeparture === true,
      time: formatClock(e.timestamp, timezone),
      timestamp: e.timestamp,
    };
  });

  return {
    dayKey: today,
    timezone,
    generatedAt: new Date(now).toISOString(),
    counts: {
      expected,
      present,
      onSite,
      late: lateFirstIn,
      onLeave,
      wfh,
      absent: Math.max(0, expected - present - onLeave - wfh),
    },
    onTimeRate: {
      percent: withFirstIn > 0 ? Math.round(((withFirstIn - lateFirstIn) / withFirstIn) * 100) : null,
      onTime: withFirstIn - lateFirstIn,
      total: withFirstIn,
    },
    avgShift: {
      completed: shiftMinutes.length,
      inProgress,
      avgMinutes:
        shiftMinutes.length > 0
          ? Math.round(shiftMinutes.reduce((a, b) => a + b, 0) / shiftMinutes.length)
          : null,
    },
    events,
    eventsTotal: todays.length,
    late,
    notArrived,
    truncated: input.truncated === true,
  };
}

// ---------------------------------------------------------------------------
// Mon-Fri trend
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function buildWeekTrend(input: {
  events: RawEvent[];
  timezone: string;
  now: Date | number;
}): WeekTrendDay[] {
  const { timezone, now } = input;
  const today = dayKey(now, timezone) ?? new Date(now).toISOString().slice(0, 10);
  const monday = addDays(today, -weekdayIndex(today));

  // First check-in per person per calendar day
  const firstInByDay = new Map<string, Map<string, RawEvent>>();
  for (const e of input.events) {
    if (e.type !== "in") continue;
    const k = dayKey(e.timestamp, timezone);
    if (!k) continue;
    let day = firstInByDay.get(k);
    if (!day) {
      day = new Map();
      firstInByDay.set(k, day);
    }
    const existing = day.get(e.employeeId);
    if (!existing || byTime(e, existing) < 0) day.set(e.employeeId, e);
  }

  return DAY_NAMES.map((name, i) => {
    const key = addDays(monday, i);
    const future = key > today;
    const people = firstInByDay.get(key);
    let late = 0;
    if (people) for (const e of people.values()) if (e.late === true) late++;
    return {
      day: name,
      dayKey: key,
      isToday: key === today,
      future,
      present: future ? 0 : (people?.size ?? 0),
      late: future ? 0 : late,
    };
  });
}
