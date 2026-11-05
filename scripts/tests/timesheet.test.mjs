import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTimesheetDay,
  buildTimesheetRow,
  expectedShiftMinutes,
  formatDecimalHours,
  formatHoursMinutes,
  formatSignedMinutes,
  timesheetSummary,
} from "../../src/lib/timesheet.ts";

// ---- helpers ------------------------------------------------------------------------------------

const DAY_SHIFT = { start: "08:00", end: "17:00", unpaidBreakMinutes: 60 }; // 9h long, 1h break: 8h expected with breaks
const present = (over = {}) => ({
  dayKey: "2026-11-02",
  status: "present",
  firstIn: "08:00",
  lastOut: "17:00",
  minutesWorked: 540,
  late: false,
  earlyDeparture: false,
  openSession: false,
  stillOnShift: false,
  shift: DAY_SHIFT,
  ...over,
});
const blank = (status, over = {}) => ({
  dayKey: "2026-11-03",
  status,
  firstIn: null,
  lastOut: null,
  minutesWorked: 0,
  late: false,
  earlyDeparture: false,
  openSession: false,
  stillOnShift: false,
  shift: null,
  ...over,
});
const day = (input, breaksTracked = false) => buildTimesheetDay(input, { breaksTracked });

// ---- the expected length of a shift ---------------------------------------------------------------

test("expected time is the shift's length, less its unpaid break only when breaks are tracked", () => {
  assert.equal(expectedShiftMinutes(DAY_SHIFT, true), 480);
  assert.equal(expectedShiftMinutes(DAY_SHIFT, false), 540);
  assert.equal(expectedShiftMinutes({ start: "08:00", end: "16:00" }, true), 480, "no break set");
});

test("a night shift is counted across midnight", () => {
  assert.equal(expectedShiftMinutes({ start: "22:00", end: "06:00", unpaidBreakMinutes: 30 }, true), 450);
  assert.equal(expectedShiftMinutes({ start: "22:00", end: "06:00", unpaidBreakMinutes: 30 }, false), 480);
});

test("no shift, a damaged shift or a break longer than the shift gives no expected time (never a guess)", () => {
  assert.equal(expectedShiftMinutes(null, true), null);
  assert.equal(expectedShiftMinutes(undefined, false), null);
  assert.equal(expectedShiftMinutes({ start: null, end: null }, false), null);
  assert.equal(expectedShiftMinutes({ start: "8am", end: "5pm" }, false), null);
  assert.equal(expectedShiftMinutes({ start: "08:00", end: "08:00" }, false), null, "an empty shift");
  assert.equal(expectedShiftMinutes({ start: "08:00", end: "09:00", unpaidBreakMinutes: 90 }, true), 0, "never negative");
  assert.equal(expectedShiftMinutes({ start: "08:00", end: "16:00", unpaidBreakMinutes: -5 }, true), 480, "a negative break is ignored");
});

// ---- one day ---------------------------------------------------------------------------------------

test("a normal full day on a shift: worked, expected and difference", () => {
  const d = day(present(), false);
  assert.equal(d.workedMinutes, 540);
  assert.equal(d.breakMinutes, 0);
  assert.equal(d.paidMinutes, 540);
  assert.equal(d.expectedMinutes, 540);
  assert.equal(d.differenceMinutes, 0);
  assert.equal(d.noCheckOut, false);
});

test("with breaks tracked the paid time comes from the break figures, and raw minutes are never changed", () => {
  const d = day(present({ breakMinutes: 60, paidMinutes: 480 }), true);
  assert.equal(d.workedMinutes, 540);
  assert.equal(d.breakMinutes, 60);
  assert.equal(d.paidMinutes, 480);
  assert.equal(d.expectedMinutes, 480);
  assert.equal(d.differenceMinutes, 0);
});

test("a break that was not deducted (short day) leaves paid equal to worked", () => {
  const d = day(present({ minutesWorked: 300, breakMinutes: 0, paidMinutes: 300 }), true);
  assert.equal(d.paidMinutes, 300);
  assert.equal(d.differenceMinutes, 300 - 480);
});

test("extra and short are the plain difference, to the minute, with no threshold and no rounding", () => {
  assert.equal(day(present({ minutesWorked: 541 }), false).differenceMinutes, 1, "one minute over");
  assert.equal(day(present({ minutesWorked: 555 }), false).differenceMinutes, 15, "fifteen minutes over");
  assert.equal(day(present({ minutesWorked: 539 }), false).differenceMinutes, -1);
  assert.equal(day(present({ minutesWorked: 600 }), false).differenceMinutes, 60);
});

test("no shift means no expected time and no difference, but the hours are still shown", () => {
  const d = day(present({ shift: null, minutesWorked: 480 }), false);
  assert.equal(d.workedMinutes, 480);
  assert.equal(d.paidMinutes, 480);
  assert.equal(d.expectedMinutes, null);
  assert.equal(d.differenceMinutes, null);
});

test("a half day on a shift is short by the other half", () => {
  const d = day(present({ minutesWorked: 270, lastOut: "12:30", earlyDeparture: true }), false);
  assert.equal(d.differenceMinutes, 270 - 540);
  assert.equal(d.earlyDeparture, true);
});

test("a night shift's hours belong to one row, with its expected length across midnight", () => {
  const d = day(present({ firstIn: "21:55", lastOut: "06:02", minutesWorked: 487, shift: { start: "22:00", end: "06:00" } }), false);
  assert.equal(d.expectedMinutes, 480);
  assert.equal(d.differenceMinutes, 7);
});

test("a day with two sessions uses the minutes already added up for the day", () => {
  assert.equal(day(present({ minutesWorked: 200 + 250 }), false).workedMinutes, 450);
});

test("days that are not owed hours expect nothing, so they never show as short", () => {
  for (const status of ["holiday", "leave", "off", "wfh", "other", "expected"]) {
    const d = day(blank(status, { shift: DAY_SHIFT }), false);
    assert.equal(d.expectedMinutes, 0, `${status} expects zero`);
    assert.equal(d.differenceMinutes, 0, `${status} is never short`);
    assert.equal(d.workedMinutes, 0);
  }
});

test("an absent day on a shift is short by the whole shift; without a shift nothing is claimed", () => {
  const withShift = day(blank("absent", { shift: DAY_SHIFT }), false);
  assert.equal(withShift.expectedMinutes, 540);
  assert.equal(withShift.differenceMinutes, -540);
  const noShift = day(blank("absent"), false);
  assert.equal(noShift.expectedMinutes, null);
  assert.equal(noShift.differenceMinutes, null);
});

test("someone who worked on a holiday or weekend is present, and the hours count as extra", () => {
  const d = day(present({ minutesWorked: 300, shift: null }), false);
  assert.equal(d.workedMinutes, 300);
  assert.equal(d.expectedMinutes, null);
});

// ---- no invented time -----------------------------------------------------------------------------

test("a check-in with no check-out is flagged and never filled in with hours", () => {
  const d = day(present({ lastOut: null, minutesWorked: 0, openSession: true }), false);
  assert.equal(d.noCheckOut, true);
  assert.equal(d.workedMinutes, 0, "not 8 hours, not anything");
  assert.equal(d.paidMinutes, 0);
});

test("someone still on their shift today is not flagged as a missing check-out", () => {
  const d = day(present({ lastOut: null, minutesWorked: 0, openSession: true, stillOnShift: true }), false);
  assert.equal(d.noCheckOut, false);
});

test("an open session earlier in a day that also has completed time keeps that time and is flagged", () => {
  const d = day(present({ minutesWorked: 240, openSession: true }), false);
  assert.equal(d.workedMinutes, 240);
  assert.equal(d.noCheckOut, true);
});

test("damaged numbers become zero, never negative or NaN", () => {
  const d = day(present({ minutesWorked: -50, breakMinutes: "x", paidMinutes: NaN }), true);
  assert.equal(d.workedMinutes, 0);
  assert.equal(d.breakMinutes, 0);
  assert.equal(d.paidMinutes, 0);
  const big = day(present({ minutesWorked: 1_000_000 }), false);
  assert.equal(big.workedMinutes, 1_000_000);
  assert.equal(day(present({ minutesWorked: 12.7 }), false).workedMinutes, 12, "whole minutes only");
});

test("late counts only when it is not excused", () => {
  assert.equal(day(present({ late: true }), false).late, true);
  const excused = day(present({ late: true, lateExcused: true }), false);
  assert.equal(excused.late, false);
  assert.equal(excused.lateExcused, true);
});

// ---- one person over a range ------------------------------------------------------------------------

test("a person's totals add up their days, converted from minutes once", () => {
  const days = [
    present({ dayKey: "2026-11-02", minutesWorked: 540 }),
    present({ dayKey: "2026-11-03", minutesWorked: 560, late: true }),
    present({ dayKey: "2026-11-04", minutesWorked: 480 }),
    blank("absent", { dayKey: "2026-11-05", shift: DAY_SHIFT }),
    blank("leave", { dayKey: "2026-11-06" }),
    blank("wfh", { dayKey: "2026-11-07" }),
    blank("holiday", { dayKey: "2026-11-08" }),
    blank("off", { dayKey: "2026-11-09" }),
  ];
  const row = buildTimesheetRow({ employeeId: "e1", name: "Ama", department: "Ops", days }, { breaksTracked: false });
  assert.equal(row.totals.daysWorked, 3);
  assert.equal(row.totals.workedMinutes, 540 + 560 + 480);
  assert.equal(row.totals.paidMinutes, 540 + 560 + 480);
  assert.equal(row.totals.expectedMinutes, 540 * 4, "three worked days plus the absent shift day");
  assert.equal(row.totals.differenceMinutes, 0 + 20 + -60 + -540);
  assert.equal(row.totals.extraMinutes, 20);
  assert.equal(row.totals.shortMinutes, 60 + 540);
  assert.equal(row.totals.lateDays, 1);
  assert.equal(row.totals.absentDays, 1);
  assert.equal(row.totals.leaveDays, 1);
  assert.equal(row.totals.wfhDays, 1);
  assert.equal(row.days.length, 8);
});

test("a person with no shift on any day has no expected or difference totals at all", () => {
  const days = [present({ shift: null, minutesWorked: 480 }), present({ dayKey: "2026-11-03", shift: null, minutesWorked: 300 })];
  const row = buildTimesheetRow({ employeeId: "e2", name: "Kofi", department: "", days }, { breaksTracked: false });
  assert.equal(row.totals.workedMinutes, 780);
  assert.equal(row.totals.expectedMinutes, null);
  assert.equal(row.totals.differenceMinutes, null);
  assert.equal(row.totals.extraMinutes, 0);
  assert.equal(row.totals.shortMinutes, 0);
});

test("a person who joined mid-range: days that are not theirs claim nothing", () => {
  const days = [blank("other", { dayKey: "2026-11-02" }), present({ dayKey: "2026-11-03", minutesWorked: 540 })];
  const row = buildTimesheetRow({ employeeId: "e3", name: "Esi", department: "", days }, { breaksTracked: false });
  assert.equal(row.totals.daysWorked, 1);
  assert.equal(row.totals.absentDays, 0);
  assert.equal(row.totals.expectedMinutes, 540);
});

test("the missing check-outs are counted per person", () => {
  const days = [present({ lastOut: null, minutesWorked: 0, openSession: true }), present({ dayKey: "2026-11-03" })];
  const row = buildTimesheetRow({ employeeId: "e4", name: "Yaw", department: "", days }, { breaksTracked: false });
  assert.equal(row.totals.noCheckOutDays, 1);
});

test("breaks tracked: totals carry break and paid time; not tracked: break is zero and paid equals worked", () => {
  const days = [present({ breakMinutes: 60, paidMinutes: 480 }), present({ dayKey: "2026-11-03", breakMinutes: 60, paidMinutes: 500, minutesWorked: 560 })];
  const tracked = buildTimesheetRow({ employeeId: "e5", name: "A", department: "", days }, { breaksTracked: true });
  assert.equal(tracked.totals.breakMinutes, 120);
  assert.equal(tracked.totals.paidMinutes, 980);
  assert.equal(tracked.totals.workedMinutes, 1100);
  const untracked = buildTimesheetRow({ employeeId: "e5", name: "A", department: "", days }, { breaksTracked: false });
  assert.equal(untracked.totals.breakMinutes, 0);
  assert.equal(untracked.totals.paidMinutes, 1100);
});

test("the input days are never changed", () => {
  const days = Object.freeze([Object.freeze(present())]);
  const row = buildTimesheetRow({ employeeId: "e6", name: "B", department: "", days }, { breaksTracked: false });
  assert.equal(row.days.length, 1);
  assert.equal(days[0].minutesWorked, 540);
});

// ---- the strip above the table ------------------------------------------------------------------------

test("the summary adds people, never nets one person against another", () => {
  const a = buildTimesheetRow({ employeeId: "a", name: "A", department: "", days: [present({ minutesWorked: 600 })] }, { breaksTracked: false });
  const b = buildTimesheetRow({ employeeId: "b", name: "B", department: "", days: [present({ minutesWorked: 480 })] }, { breaksTracked: false });
  const noShift = buildTimesheetRow({ employeeId: "c", name: "C", department: "", days: [present({ shift: null, minutesWorked: 100 })] }, { breaksTracked: false });
  const s = timesheetSummary([a, b, noShift]);
  assert.equal(s.people, 3);
  assert.equal(s.workedMinutes, 600 + 480 + 100);
  assert.equal(s.expectedMinutes, 540 + 540, "people with no shift add nothing to expected");
  assert.equal(s.extraMinutes, 60, "A's extra is not cancelled by B's shortfall");
  assert.equal(s.shortMinutes, 60);
  assert.equal(s.differenceMinutes, 0, "only the net is zero");
  assert.deepEqual(timesheetSummary([]), {
    people: 0, workedMinutes: 0, breakMinutes: 0, paidMinutes: 0, expectedMinutes: 0, differenceMinutes: 0,
    extraMinutes: 0, shortMinutes: 0, lateDays: 0, absentDays: 0, noCheckOutDays: 0,
  });
});

// ---- writing the numbers --------------------------------------------------------------------------------

test("minutes are written as hours and minutes, or as decimal hours from the total", () => {
  assert.equal(formatHoursMinutes(0), "0m");
  assert.equal(formatHoursMinutes(45), "45m");
  assert.equal(formatHoursMinutes(60), "1h 0m");
  assert.equal(formatHoursMinutes(450), "7h 30m");
  assert.equal(formatHoursMinutes(-5), "0m", "never negative");
  assert.equal(formatDecimalHours(450), "7.50");
  assert.equal(formatDecimalHours(1), "0.02");
  assert.equal(formatDecimalHours(0), "0.00");
  assert.equal(formatDecimalHours(2 * 60 * 1000), "2000.00", "very large totals");
});

test("extra and short carry a sign; zero and missing are plain", () => {
  assert.equal(formatSignedMinutes(80), "+1h 20m");
  assert.equal(formatSignedMinutes(-45), "-45m");
  assert.equal(formatSignedMinutes(0), "0m");
  assert.equal(formatSignedMinutes(null), "");
});

// ---- it stays pure --------------------------------------------------------------------------------------

test("the module is pure: no Firebase, no clock, no device time, no alias imports", () => {
  const src = readFileSync("src/lib/timesheet.ts", "utf8");
  assert.doesNotMatch(src, /firebase|firestore/i);
  assert.doesNotMatch(src, /Date\.now|new Date\(|getHours|getMinutes|toLocale/);
  assert.doesNotMatch(src, /from\s+["']@\//, "relative .ts imports only");
});
