/**
 * The team roster (Phase 4, task 4.5): one row per person for today, with where they are, their shift, when
 * they arrived and how they have done this month. Pure: no database, no clock, no path aliases, so every
 * rule can be tested.
 *
 * It is built from the attendance register (src/lib/report-data.ts) for "the 1st of this month up to today",
 * so the roster, the register and the Today tiles all come from the same day-status rules and cannot
 * disagree. Nothing is read from raw scans.
 *
 *  - attendance  = days attended (present or working from home) out of days attended + days missed (absent).
 *                  Leave, holidays, days off and days not yet due are not counted either way.
 *  - punctuality = days present and not late (an excused late counts as on time) out of days present.
 *
 * Today only counts once the person has turned up: someone not here yet is not marked absent for the month.
 * A figure with nothing to base it on is null, never 0 or 100.
 */
import type { AttendanceRegister, RegisterStatus } from "./report-types.ts";

/** The most people one roster returns; beyond it the roster says so. */
export const ROSTER_ROW_CAP = 500;

export type RosterStatus = "in" | "out" | "wfh" | "leave" | "absent" | "expected" | "off" | "holiday";

export interface RosterShift {
  name: string;
  start: string | null;
  end: string | null;
}

export interface RosterRow {
  employeeId: string;
  name: string;
  department: string;
  status: RosterStatus;
  late: boolean;
  lateExcused: boolean;
  earlyDeparture: boolean;
  /** "HH:MM" in the organization's timezone, or null. */
  firstIn: string | null;
  shift: RosterShift | null;
  /** Percent this month so far, or null when there is nothing to base it on. */
  attendance: number | null;
  punctuality: number | null;
  /** Days behind the attendance figure (attended + missed). */
  daysCounted: number;
}

/**
 * Where a person is "right now" when the organization uses shifts: worked out by the same evaluation the Today
 * tiles use (shift-today.ts), so a night shift that began yesterday and is still running is "On site", not
 * "Expected later". It replaces today's state, time and shift on the row; the month bars still come from the
 * register.
 */
export interface RosterTodayOverride {
  status: RosterStatus;
  late: boolean;
  lateExcused: boolean;
  earlyDeparture: boolean;
  firstIn: string | null;
  shift: RosterShift | null;
}

export interface RosterData {
  dayKey: string;
  timezone: string;
  generatedAt: string;
  /** First day of the month the bars cover. */
  monthFrom: string;
  rows: RosterRow[];
  truncated: boolean;
}

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

function todayStatus(status: RegisterStatus | undefined, state: "in" | "out" | undefined): RosterStatus {
  switch (status) {
    case "present":
      return state === "out" ? "out" : "in";
    case "wfh":
    case "leave":
    case "absent":
    case "expected":
    case "holiday":
      return status;
    default:
      return "off";
  }
}

export function buildTeamRoster(input: {
  register: AttendanceRegister;
  /** Only people on the team now get a row (the register also keeps people who moved away). */
  teamIds: ReadonlySet<string>;
  today: string;
  /** Direction of each person's latest scan today. */
  todayStates: ReadonlyMap<string, "in" | "out">;
  /** Each person's shift today, when shifts are in use. */
  todayShifts: ReadonlyMap<string, RosterShift>;
  /** Shift-aware state for today (see RosterTodayOverride). A person without an entry is read from the register. */
  todayOverride?: ReadonlyMap<string, RosterTodayOverride>;
  generatedAt: string;
}): RosterData {
  const { register, today } = input;
  const mine = register.rows.filter((r) => input.teamIds.has(r.employeeId));
  const rows: RosterRow[] = mine.slice(0, ROSTER_ROW_CAP).map((r) => {
    const now = r.days.find((d) => d.dayKey === today);
    let attended = 0;
    let missed = 0;
    let present = 0;
    let onTime = 0;
    for (const d of r.days) {
      if (d.dayKey > today) continue;
      const isToday = d.dayKey === today;
      if (d.status === "present") {
        attended++;
        present++;
        if (!d.late) onTime++;
      } else if (d.status === "wfh") {
        attended++;
      } else if (d.status === "absent" && !isToday) {
        missed++; // today's absence is "not here yet", not a missed day
      }
    }
    const shifted = input.todayOverride?.get(r.employeeId);
    return {
      employeeId: r.employeeId,
      name: r.name,
      department: r.department,
      status: shifted ? shifted.status : todayStatus(now?.status, input.todayStates.get(r.employeeId)),
      late: shifted ? shifted.late : now?.status === "present" && now.late === true,
      lateExcused: shifted ? shifted.lateExcused : now?.status === "present" && now.lateExcused === true,
      earlyDeparture: shifted ? shifted.earlyDeparture : now?.earlyDeparture === true,
      firstIn: shifted ? shifted.firstIn : now?.status === "present" ? now.firstIn : null,
      shift: shifted ? shifted.shift : (input.todayShifts.get(r.employeeId) ?? null),
      attendance: pct(attended, attended + missed),
      punctuality: pct(onTime, present),
      daysCounted: attended + missed,
    };
  });
  return {
    dayKey: today,
    timezone: register.timezone,
    generatedAt: input.generatedAt,
    monthFrom: register.from,
    rows,
    truncated: register.truncated || mine.length > ROSTER_ROW_CAP,
  };
}

// ---------------------------------------------------------------- how it is shown

export const STATUS_LABEL: Record<RosterStatus, string> = {
  in: "On site",
  out: "Left for the day",
  wfh: "Working from home",
  leave: "On leave",
  absent: "Not arrived",
  expected: "Expected later",
  off: "Not working today",
  holiday: "Holiday",
};

/** Pill colours: only the style guide's status colours. */
export const STATUS_CLASS: Record<RosterStatus, string> = {
  in: "bg-[#CBEED3] text-[#0E2322]",
  out: "bg-slate-100 text-slate-700",
  wfh: "bg-slate-100 text-slate-700",
  leave: "bg-slate-100 text-slate-700",
  absent: "bg-amber-100 text-amber-900",
  expected: "bg-slate-50 text-slate-600",
  off: "bg-slate-50 text-slate-500",
  holiday: "bg-slate-100 text-slate-500",
};

/** "Day 08:00 to 16:00", or just the name for a flexible shift. */
export function shiftLabel(s: RosterShift | null): string {
  if (!s) return "";
  return s.start && s.end ? `${s.name} ${s.start} to ${s.end}` : s.name;
}

export type RosterFilter = "all" | "here" | "late" | "away" | "missing";

export const FILTER_LABEL: Record<RosterFilter, string> = {
  all: "Everyone",
  here: "Here today",
  late: "Late",
  away: "Away",
  missing: "Not here yet",
};

export function matchesFilter(row: RosterRow, filter: RosterFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "here":
      return row.status === "in" || row.status === "out";
    case "late":
      return row.late;
    case "away":
      return row.status === "wfh" || row.status === "leave";
    case "missing":
      return row.status === "absent" || row.status === "expected";
  }
}

export function filterCounts(rows: readonly RosterRow[]): Record<RosterFilter, number> {
  const out: Record<RosterFilter, number> = { all: 0, here: 0, late: 0, away: 0, missing: 0 };
  for (const r of rows) for (const f of Object.keys(out) as RosterFilter[]) if (matchesFilter(r, f)) out[f]++;
  return out;
}

/** The roster as it is shown: filtered by chip, department and typed name. Never changes the rows it is given. */
export function filterRoster(
  rows: readonly RosterRow[],
  opts: { filter?: RosterFilter; department?: string; query?: string },
): RosterRow[] {
  const q = (opts.query ?? "").trim().toLowerCase();
  return rows.filter(
    (r) =>
      matchesFilter(r, opts.filter ?? "all") &&
      (!opts.department || r.department === opts.department) &&
      (!q || r.name.toLowerCase().includes(q)),
  );
}

const ORDER: Record<RosterStatus, number> = { absent: 0, in: 1, expected: 2, out: 3, wfh: 4, leave: 5, holiday: 6, off: 7 };

/** Those who need a look come first (not arrived, then late), then by where they are, then by name. */
export function sortRoster(rows: readonly RosterRow[]): RosterRow[] {
  return [...rows].sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] || Number(b.late) - Number(a.late) || a.name.localeCompare(b.name),
  );
}

/** The departments that appear in the roster, sorted, without blanks. */
export function departmentsOf(rows: readonly RosterRow[]): string[] {
  return [...new Set(rows.map((r) => r.department).filter((d) => d.trim() !== ""))].sort((a, b) => a.localeCompare(b));
}

/** "86%" or an honest dash when there is nothing to base the figure on. */
export function percentText(value: number | null): string {
  return value === null ? "–" : `${value}%`;
}
