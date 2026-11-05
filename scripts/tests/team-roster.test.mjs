import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";
import {
  ROSTER_ROW_CAP,
  buildTeamRoster,
  departmentsOf,
  filterCounts,
  filterRoster,
  percentText,
  shiftLabel,
  sortRoster,
} from "../../src/lib/team-roster.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
// A Wednesday; the month so far is Mon 5th (the 1st is a Thursday, but only weekdays count) to Wed 21st? Keep it short:
const TODAY = "2026-10-07"; // Wednesday
const DAYS = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"];
const people = [
  { uid: "a", displayName: "Ama", department: "Lab" },
  { uid: "b", displayName: "Kofi", department: "Lab" },
  { uid: "c", displayName: "Esi", department: "Office" },
  { uid: "d", displayName: "Yaw", department: "Office" },
];
const scan = (employeeId, dayKey, extra = {}) => ({ employeeId, dayKey, minutesWorked: 480, firstIn: `${dayKey}T08:00:00.000Z`, lastOut: null, late: false, ...extra });

function roster(extra = {}, opts = {}) {
  const summaries = extra.summaries ?? [];
  const register = buildAttendanceRegister({
    days: DAYS,
    people,
    summaries,
    leaves: extra.leaves ?? [],
    holidays: [],
    timezone: "UTC",
    generatedAt: "2026-10-07T12:00:00.000Z",
    from: DAYS[0],
    to: TODAY,
    wfh: extra.wfh,
  });
  return buildTeamRoster({
    register,
    teamIds: opts.teamIds ?? new Set(people.map((p) => p.uid)),
    today: TODAY,
    todayStates: opts.states ?? new Map(),
    todayShifts: opts.shifts ?? new Map(),
    generatedAt: "2026-10-07T12:00:00.000Z",
  });
}
const row = (data, uid) => data.rows.find((r) => r.employeeId === uid);

// ---------------------------------------------------------------- where each person is today
test("someone who scanned is on site, or has left once their latest scan is an out", () => {
  const s = [scan("a", TODAY), scan("b", TODAY)];
  const data = roster({ summaries: s }, { states: new Map([["a", "in"], ["b", "out"]]) });
  assert.equal(row(data, "a").status, "in");
  assert.equal(row(data, "b").status, "out");
  assert.equal(row(data, "a").firstIn, "08:00");
});

test("no scan on a weekday is not arrived; leave and work from home are their own states", () => {
  const data = roster({
    summaries: [scan("a", TODAY)],
    leaves: [{ employeeId: "c", startDate: TODAY, endDate: TODAY, status: "approved" }],
    wfh: [{ employeeId: "d", dayKey: TODAY }],
  });
  assert.equal(row(data, "b").status, "absent");
  assert.equal(row(data, "c").status, "leave");
  assert.equal(row(data, "d").status, "wfh");
});

test("late and left-early show on the person who arrived, and an excused late is marked as excused, not late", () => {
  const data = roster({
    summaries: [scan("a", TODAY, { late: true }), scan("b", TODAY, { late: true, lateExcused: true, earlyDeparture: true })],
  });
  assert.equal(row(data, "a").late, true);
  assert.equal(row(data, "b").late, false);
  assert.equal(row(data, "b").lateExcused, true);
  assert.equal(row(data, "b").earlyDeparture, true);
});

test("only people on the team now get a row", () => {
  const data = roster({ summaries: [scan("gone", TODAY), scan("a", TODAY)] }, { teamIds: new Set(["a", "b"]) });
  assert.deepEqual(data.rows.map((r) => r.employeeId).sort(), ["a", "b"]);
});

test("a shift is shown beside the person it belongs to", () => {
  const data = roster({}, { shifts: new Map([["a", { name: "Day", start: "08:00", end: "16:00" }]]) });
  assert.equal(shiftLabel(row(data, "a").shift), "Day 08:00 to 16:00");
  assert.equal(row(data, "b").shift, null);
  assert.equal(shiftLabel({ name: "Flex", start: null, end: null }), "Flex");
  assert.equal(shiftLabel(null), "");
});

// ---------------------------------------------------------------- the bars
test("attendance counts days attended out of attended plus missed; punctuality counts days not late out of days present", () => {
  // Weekdays before today: Thu 1, Fri 2, Mon 5, Tue 6. a is present Thu, Fri (late), Mon; absent Tue.
  const data = roster({
    summaries: [scan("a", "2026-10-01"), scan("a", "2026-10-02", { late: true }), scan("a", "2026-10-05"), scan("a", TODAY)],
  });
  const a = row(data, "a");
  // attended: 1,2,5 and today = 4; missed: 6 = 1
  assert.equal(a.daysCounted, 5);
  assert.equal(a.attendance, 80);
  // present 4 days, one late
  assert.equal(a.punctuality, 75);
});

test("today's missing scan is not held against the month yet", () => {
  const data = roster({ summaries: [scan("a", "2026-10-01"), scan("a", "2026-10-02"), scan("a", "2026-10-05"), scan("a", "2026-10-06")] });
  const a = row(data, "a");
  assert.equal(a.status, "absent");
  assert.equal(a.attendance, 100, "four of four past weekdays; today does not count until they turn up");
});

test("leave and work from home never count as absence, and work from home counts as attended", () => {
  const data = roster({
    summaries: [scan("a", "2026-10-01"), scan("a", "2026-10-02"), scan("a", "2026-10-05"), scan("a", "2026-10-06")],
    leaves: [{ employeeId: "c", startDate: "2026-10-01", endDate: "2026-10-06", status: "approved" }],
    wfh: [{ employeeId: "d", dayKey: "2026-10-01" }, { employeeId: "d", dayKey: "2026-10-02" }, { employeeId: "d", dayKey: "2026-10-05" }, { employeeId: "d", dayKey: "2026-10-06" }],
  });
  assert.equal(row(data, "c").attendance, null, "all leave: nothing to base a figure on");
  assert.equal(row(data, "c").punctuality, null);
  assert.equal(row(data, "d").attendance, 100);
  assert.equal(row(data, "d").punctuality, null, "working from home has no arrival time");
});

test("a figure with nothing behind it is a dash, never 0 or 100", () => {
  assert.equal(percentText(null), "–");
  assert.equal(percentText(0), "0%");
  assert.equal(percentText(86), "86%");
  assert.equal(row(roster(), "a").punctuality, null);
});

// ---------------------------------------------------------------- the list
test("filters count and select the right people", () => {
  const data = roster({
    summaries: [scan("a", TODAY, { late: true }), scan("b", TODAY)],
    wfh: [{ employeeId: "d", dayKey: TODAY }],
  });
  const c = filterCounts(data.rows);
  assert.deepEqual(c, { all: 4, here: 2, late: 1, away: 1, missing: 1 });
  assert.deepEqual(filterRoster(data.rows, { filter: "late" }).map((r) => r.name), ["Ama"]);
  assert.deepEqual(filterRoster(data.rows, { filter: "missing" }).map((r) => r.name), ["Esi"]);
  assert.deepEqual(filterRoster(data.rows, { department: "Office" }).map((r) => r.name).sort(), ["Esi", "Yaw"]);
  assert.deepEqual(filterRoster(data.rows, { query: " ko" }).map((r) => r.name), ["Kofi"]);
  assert.deepEqual(filterRoster(data.rows, { filter: "here", department: "Office" }), []);
});

test("those who need a look come first, and sorting never changes the list it is given", () => {
  const data = roster({ summaries: [scan("a", TODAY, { late: true }), scan("b", TODAY)], wfh: [{ employeeId: "d", dayKey: TODAY }] });
  const before = JSON.stringify(data.rows);
  const sorted = sortRoster(data.rows);
  assert.equal(JSON.stringify(data.rows), before);
  assert.deepEqual(sorted.map((r) => r.name), ["Esi", "Ama", "Kofi", "Yaw"]);
});

test("departments are listed once, sorted, without blanks", () => {
  assert.deepEqual(departmentsOf([{ department: "Office" }, { department: "" }, { department: "Lab" }, { department: "Lab" }, { department: "  " }]), ["Lab", "Office"]);
});

test("a very large team is cut off and says so", () => {
  const many = Array.from({ length: ROSTER_ROW_CAP + 5 }, (_, i) => ({ uid: `u${i}`, displayName: `P${String(i).padStart(4, "0")}` }));
  const register = buildAttendanceRegister({
    days: DAYS, people: many, summaries: [], leaves: [], holidays: [], timezone: "UTC",
    generatedAt: "x", from: DAYS[0], to: TODAY,
  });
  const data = buildTeamRoster({ register, teamIds: new Set(many.map((p) => p.uid)), today: TODAY, todayStates: new Map(), todayShifts: new Map(), generatedAt: "x" });
  assert.equal(data.rows.length, ROSTER_ROW_CAP);
  assert.equal(data.truncated, true);
});

// ---------------------------------------------------------------- the route, the screen and the dashboard
const route = read("src/routes/api/attendance/roster.ts");
const screen = read("src/components/dashboard/TeamRoster.tsx");
const section = read("src/components/dashboard/TeamRosterSection.tsx");
const dashboard = read("src/routes/_authenticated/dashboard.tsx");

test("the roster route takes who is asking only from the verified token and is cached per scope", () => {
  assert.ok(route.includes('verifyCallerToken(request.headers.get("authorization"))'));
  assert.ok(route.includes("resolveDashboardScope(caller)") && route.includes("status: 403"));
  assert.ok(route.includes("dashboardCacheKey(scope)") && route.includes("createCachedLoader"));
  assert.ok(!/searchParams\.get\("(org|manager|role|uid)/.test(route));
});

test("the roster reads summaries and the register inputs, never raw scans", () => {
  assert.ok(route.includes("loadScopedSummaries(") && route.includes("buildAttendanceRegister("));
  assert.ok(!route.includes("loadScopedEvents") && !route.includes("clock_events"));
});

test("the roster is built from the register's own day rules, so the two cannot disagree", () => {
  assert.ok(route.includes("buildAttendanceRegister({") && route.includes("buildTeamRoster({"));
});

test("the screen has loading, error and empty states, filters, a table and phone cards, and speaks the bars", () => {
  for (const text of ["<Skeleton", "Try again", "No one on the roster yet", "No one matches", "Filter the roster", "lg:hidden", "hidden lg:block", 'role="meter"', "aria-valuetext"]) {
    assert.ok(screen.includes(text), text);
  }
});

test("status is always words, and the screen uses only the style guide's status colors", () => {
  assert.ok(screen.includes("STATUS_LABEL[row.status]"));
  const lib = read("src/lib/team-roster.ts");
  for (const bad of ["red-", "blue-", "purple-", "pink-", "orange-", "rose-"]) assert.ok(!lib.includes(bad) && !screen.includes(bad), bad);
});

test("nothing polls and nothing is drawn for a future that is not there", () => {
  assert.ok(!/setInterval/.test(screen + section));
  assert.ok(section.includes("/api/attendance/roster") && section.includes("fresh=1"));
  assert.ok(!/geolocation/.test(screen + section + route));
});

test("only managers and admins see the roster on the dashboard", () => {
  assert.ok(dashboard.includes("{(isOrgAdmin || isManager) && <TeamRosterSection />}"));
});
