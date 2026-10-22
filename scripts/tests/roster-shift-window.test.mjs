import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rosterTodayFrom } from "../../src/lib/shift-today.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const SHIFT = { shiftId: "d", name: "Day", type: "day", start: "08:00", end: "16:00", graceMinutes: 15, expectedMinutes: null };
const member = { uid: "a", displayName: "Ama" };
const ev = (status, over = {}) => ({ member, status, relevantSummary: null, relevantAssignment: { dayKey: "2026-10-21", shift: SHIFT }, ...over });
const scan = (over = {}) => ({ employeeId: "a", dayKey: "2026-10-21", firstIn: "2026-10-21T08:12:00.000Z", state: "in", late: false, earlyDeparture: false, ...over });

// ---------------------------------------------------------------- one evaluation, one roster row
test("present is on site while the last scan is an in, and left once it is an out", () => {
  assert.equal(rosterTodayFrom(ev("present", { relevantSummary: scan() }), false, "UTC").status, "in");
  assert.equal(rosterTodayFrom(ev("present", { relevantSummary: scan({ state: "out" }) }), false, "UTC").status, "out");
});

test("the arrival time is shown on the organization's clock, with the shift that is running", () => {
  const row = rosterTodayFrom(ev("present", { relevantSummary: scan() }), false, "Africa/Accra");
  assert.equal(row.firstIn, "08:12");
  assert.deepEqual(row.shift, { name: "Day", start: "08:00", end: "16:00" });
});

test("late counts only when it was not excused, and an excused late is marked as excused", () => {
  const late = rosterTodayFrom(ev("present", { relevantSummary: scan({ late: true }) }), false, "UTC");
  assert.deepEqual([late.late, late.lateExcused], [true, false]);
  const excused = rosterTodayFrom(ev("present", { relevantSummary: scan({ late: true, lateExcused: true }) }), false, "UTC");
  assert.deepEqual([excused.late, excused.lateExcused], [false, true]);
  assert.equal(rosterTodayFrom(ev("present", { relevantSummary: scan({ earlyDeparture: true }) }), false, "UTC").earlyDeparture, true);
});

test("expected and absent become work from home only when it was declared; leave, holiday and not rostered keep their own words", () => {
  assert.equal(rosterTodayFrom(ev("expected"), false, "UTC").status, "expected");
  assert.equal(rosterTodayFrom(ev("expected"), true, "UTC").status, "wfh");
  assert.equal(rosterTodayFrom(ev("absent"), false, "UTC").status, "absent");
  assert.equal(rosterTodayFrom(ev("absent"), true, "UTC").status, "wfh");
  assert.equal(rosterTodayFrom(ev("on_leave"), true, "UTC").status, "leave", "leave beats a declaration, as on the Today tiles");
  assert.equal(rosterTodayFrom(ev("holiday"), false, "UTC").status, "holiday");
  assert.equal(rosterTodayFrom(ev("not_rostered", { relevantAssignment: null }), false, "UTC").status, "off");
  assert.equal(rosterTodayFrom(ev("not_rostered", { relevantAssignment: null }), false, "UTC").shift, null);
});

test("a scan with no readable arrival time shows no time rather than a made-up one", () => {
  assert.equal(rosterTodayFrom(ev("present", { relevantSummary: scan({ firstIn: null }) }), false, "UTC").firstIn, null);
});

// ---------------------------------------------------------------- the route and the pieces
const route = read("src/routes/api/attendance/roster.ts");
const today = read("src/lib/shift-today.ts");
const lib = read("src/lib/team-roster.ts");

test("the Today tiles and the roster read the same evaluation, so the rule lives in one place", () => {
  assert.ok(today.includes("export function evaluateShiftToday("));
  const builder = today.slice(today.indexOf("export function buildTodayWithShifts("));
  assert.ok(builder.includes("evaluateShiftToday({"), "the tiles use it");
  assert.ok(route.includes("evaluateShiftToday({") && route.includes("rosterTodayFrom("), "the roster uses it");
  assert.ok(!builder.includes("shiftWindow("), "the night-shift rule is no longer written a second time in the tiles");
});

test("only organizations with shifts (and assignments) use it; others keep the register's day rule", () => {
  assert.ok(route.includes("if (assignments.length > 0) {"));
  assert.ok(lib.includes("todayOverride?: ReadonlyMap<string, RosterTodayOverride>"));
  assert.ok(lib.includes("const shifted = input.todayOverride?.get(r.employeeId);"));
});

test("the month's bars still come from the register, not from the shift evaluation", () => {
  assert.ok(lib.includes("attendance: pct(attended, attended + missed)"));
  assert.ok(lib.includes("punctuality: pct(onTime, present)"));
});

test("on the 1st of the month the roster still reads yesterday, so a night shift from the last day of the month is seen", () => {
  assert.ok(route.includes("const readFrom = yesterday < period.from ? yesterday : period.from;"));
  assert.ok(route.includes("loadScopedSummaries(scope, readFrom, today, WEEK_SUMMARY_CAP)"));
  assert.ok(route.includes("loadShiftAssignments(scope, readFrom, today, SHIFT_ASSIGNMENT_CAP_RANGE)"));
});

test("no new reads: the evaluation uses what the route already loaded", () => {
  const block = route.slice(route.indexOf("const evaluations = evaluateShiftToday({"), route.indexOf("const todayStates"));
  assert.ok(!/firestoreAdmin|\.get\(\)|await /.test(block), "it is pure: no database access of its own");
});
