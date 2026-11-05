import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";
import { buildTimesheetReport } from "../../src/lib/timesheet-build.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ---- fixtures -----------------------------------------------------------------------------------------

const DAYS = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]; // Mon to Fri
const NOW = Date.parse("2026-11-10T12:00:00.000Z"); // the following Tuesday, UTC
const ama = { uid: "e1", displayName: "Ama", department: "Ops" };
const kofi = { uid: "e2", displayName: "Kofi", department: "Ops" };

const summary = (employeeId, dayKey, over = {}) => ({
  employeeId,
  employeeName: employeeId,
  dayKey,
  firstIn: `${dayKey}T08:00:00.000Z`,
  lastOut: `${dayKey}T17:00:00.000Z`,
  minutesWorked: 540,
  late: false,
  earlyDeparture: false,
  shiftStart: "08:00",
  shiftEnd: "17:00",
  ...over,
});

function register(extra = {}) {
  return buildAttendanceRegister({
    days: DAYS,
    people: [ama, kofi],
    summaries: [],
    leaves: [],
    holidays: [],
    timezone: "UTC",
    generatedAt: "2026-11-10T12:00:00.000Z",
    from: DAYS[0],
    to: DAYS.at(-1),
    ...extra,
  });
}

function report(regExtra, tsExtra = {}) {
  const reg = register(regExtra);
  const summaries = regExtra.summaries ?? [];
  return { reg, ts: buildTimesheetReport({ register: reg, summaries, nowMs: NOW, ...tsExtra }) };
}

const rowOf = (rep, id) => rep.rows.find((r) => r.employeeId === id);

// ---- the timesheet and the register agree (design test 1) -------------------------------------------

test("the timesheet's days and hours equal the register's, person by person", () => {
  const summaries = [
    summary("e1", DAYS[0]),
    summary("e1", DAYS[1], { late: true, minutesWorked: 560 }),
    summary("e1", DAYS[2], { late: true, lateExcused: true, minutesWorked: 500 }),
    summary("e1", DAYS[3], { earlyDeparture: true, minutesWorked: 300 }),
    summary("e2", DAYS[0], { minutesWorked: 480 }),
  ];
  const { reg, ts } = report({
    summaries,
    leaves: [{ id: "l1", employeeId: "e2", status: "approved", startDate: DAYS[1], endDate: DAYS[1] }],
    holidays: [DAYS[4]],
    wfh: [{ employeeId: "e2", dayKey: DAYS[2] }],
  });
  assert.equal(ts.rows.length, reg.rows.length);
  for (const regRow of reg.rows) {
    const t = rowOf(ts, regRow.employeeId).totals;
    assert.equal(t.daysWorked, regRow.totals.presentDays, `${regRow.name} days worked`);
    assert.equal(t.lateDays, regRow.totals.lateDays, `${regRow.name} late days`);
    assert.equal(t.absentDays, regRow.totals.absentDays, `${regRow.name} absent days`);
    assert.equal(t.leaveDays, regRow.totals.leaveDays, `${regRow.name} leave days`);
    assert.equal(t.wfhDays, regRow.totals.wfhDays, `${regRow.name} wfh days`);
    assert.equal(t.workedMinutes, regRow.totals.minutesWorked, `${regRow.name} hours`);
  }
  assert.deepEqual(rowOf(ts, "e1").days.map((d) => d.status), reg.rows[0].days.map((d) => d.status), "same statuses, day by day");
  assert.equal(ts.rows[0].days.length, DAYS.length);
});

test("an excused late day is not counted as late, in either", () => {
  const { ts } = report({ summaries: [summary("e1", DAYS[0], { late: true, lateExcused: true })] });
  const d = rowOf(ts, "e1").days[0];
  assert.equal(d.late, false);
  assert.equal(d.lateExcused, true);
  assert.equal(rowOf(ts, "e1").totals.lateDays, 0);
});

// ---- expected time comes from the day's shift ----------------------------------------------------------

test("a day with a shift expects the shift's length; a day with no shift expects nothing", () => {
  const { ts } = report({
    summaries: [summary("e1", DAYS[0]), summary("e2", DAYS[0], { shiftStart: undefined, shiftEnd: undefined, minutesWorked: 480 })],
  });
  assert.equal(rowOf(ts, "e1").days[0].expectedMinutes, 540);
  assert.equal(rowOf(ts, "e1").days[0].differenceMinutes, 0);
  assert.equal(rowOf(ts, "e2").days[0].expectedMinutes, null);
  assert.equal(rowOf(ts, "e2").totals.expectedMinutes, null, "nobody on a shift: no expected total");
  assert.equal(ts.anyExpected, true);
});

test("nobody on a shift anywhere: Expected and Difference mean nothing", () => {
  const { ts } = report({ summaries: [summary("e1", DAYS[0], { shiftStart: undefined, shiftEnd: undefined })] });
  assert.equal(ts.anyExpected, false);
  assert.equal(ts.summary.expectedMinutes, 0);
});

test("with breaks tracked, expected is the shift less its break and paid time is shown", () => {
  const { ts } = report({
    breaks: true,
    summaries: [summary("e1", DAYS[0], { shiftUnpaidBreakMinutes: 60, shiftDeductAfterMinutes: 360 })],
  });
  const d = rowOf(ts, "e1").days[0];
  assert.equal(ts.breaksTracked, true);
  assert.equal(d.workedMinutes, 540, "raw minutes are never changed");
  assert.equal(d.breakMinutes, 60);
  assert.equal(d.paidMinutes, 480);
  assert.equal(d.expectedMinutes, 480);
  assert.equal(d.differenceMinutes, 0);
});

test("an absent day takes its shift from the rota and is short by the whole shift", () => {
  const assignments = [{ employeeId: "e1", dayKey: DAYS[1], shift: { shiftId: "s1", name: "Day", type: "day", start: "08:00", end: "17:00", graceMinutes: 10, expectedMinutes: null } }];
  const reg = register({ summaries: [summary("e1", DAYS[0])], shifts: { assignments, nowMs: NOW } });
  const ts = buildTimesheetReport({ register: reg, summaries: [summary("e1", DAYS[0])], assignments, nowMs: NOW });
  const absent = rowOf(ts, "e1").days[1];
  assert.equal(absent.status, "absent");
  assert.equal(absent.expectedMinutes, 540);
  assert.equal(absent.differenceMinutes, -540);
  assert.equal(rowOf(ts, "e1").totals.shortMinutes, 540);
});

test("leave, holiday and weekend days owe no hours", () => {
  const { ts } = report({
    summaries: [],
    leaves: [{ id: "l1", employeeId: "e1", status: "approved", startDate: DAYS[0], endDate: DAYS[0] }],
    holidays: [DAYS[1]],
  });
  const days = rowOf(ts, "e1").days;
  assert.equal(days[0].status, "leave");
  assert.equal(days[0].expectedMinutes, 0);
  assert.equal(days[1].status, "holiday");
  assert.equal(days[1].expectedMinutes, 0);
});

// ---- no invented time: a check-in still waiting for its check-out ---------------------------------------

test("an earlier day with a check-in and no check-out is flagged and adds no hours", () => {
  const { ts } = report({
    summaries: [summary("e1", DAYS[0], { lastOut: null, minutesWorked: 0, openSince: `${DAYS[0]}T08:00:00.000Z` })],
  });
  const d = rowOf(ts, "e1").days[0];
  assert.equal(d.noCheckOut, true);
  assert.equal(d.workedMinutes, 0);
  assert.equal(rowOf(ts, "e1").totals.noCheckOutDays, 1);
  assert.equal(ts.summary.noCheckOutDays, 1);
});

test("someone still on their shift is not flagged: a day shift today, a night shift past midnight, no shift today", () => {
  const today = "2026-11-10";
  const open = (over) => ({ openSince: `${over.dayKey}T08:00:00.000Z`, lastOut: null, minutesWorked: 0, ...over });
  const run = (sum, nowMs, days) => {
    const reg = buildAttendanceRegister({
      days, people: [ama], summaries: [sum], leaves: [], holidays: [], timezone: "UTC",
      generatedAt: "x", from: days[0], to: days.at(-1),
    });
    return buildTimesheetReport({ register: reg, summaries: [sum], nowMs }).rows[0].days.at(-1);
  };

  // A day shift 08:00 to 17:00, checked in, it is 12:00 on the same day: still on shift.
  assert.equal(run(summary("e1", today, open({ dayKey: today })), Date.parse(`${today}T12:00:00.000Z`), [today]).noCheckOut, false);
  // The same person at 18:00: the shift is over, so the missing check-out is flagged.
  assert.equal(run(summary("e1", today, open({ dayKey: today })), Date.parse(`${today}T18:00:00.000Z`), [today]).noCheckOut, true);

  // A night shift 22:00 to 06:00 that started yesterday: at 02:00 today it is still running.
  const yest = "2026-11-09";
  const night = summary("e1", yest, { shiftStart: "22:00", shiftEnd: "06:00", ...open({ dayKey: yest }) });
  assert.equal(run(night, Date.parse(`${today}T02:00:00.000Z`), [yest]).noCheckOut, false);
  assert.equal(run(night, Date.parse(`${today}T07:00:00.000Z`), [yest]).noCheckOut, true, "at 07:00 the shift is long over");

  // No shift at all, checked in today: working until the day ends. The next day it is flagged.
  const noShift = summary("e1", today, { shiftStart: undefined, shiftEnd: undefined, ...open({ dayKey: today }) });
  assert.equal(run(noShift, Date.parse(`${today}T20:00:00.000Z`), [today]).noCheckOut, false);
  assert.equal(run(noShift, Date.parse("2026-11-11T09:00:00.000Z"), [today]).noCheckOut, true);
});

// ---- a team that changed, the diary and the strip ---------------------------------------------------------

test("a former team member's days outside this team claim nothing", () => {
  const summaries = [summary("gone", DAYS[0], { employeeName: "Esi", minutesWorked: 400 })];
  const { ts } = report({ summaries });
  const row = rowOf(ts, "gone");
  assert.ok(row, "the person keeps a row for the day managed here");
  assert.equal(row.totals.daysWorked, 1);
  assert.equal(row.totals.absentDays, 0, "the other days are not claimed as absence");
});

test("the work diary figures are passed through, kept apart from scanned hours", () => {
  const { ts } = report({
    summaries: [summary("e1", DAYS[0])],
    diaryTracked: true,
    diary: [
      { employeeId: "e1", dayKey: DAYS[1], status: "approved", verifiedMinutes: 300 },
      { employeeId: "e1", dayKey: DAYS[2], status: "flagged", verifiedMinutes: 200 },
      { employeeId: "e1", dayKey: DAYS[3], status: "submitted", verifiedMinutes: 100 },
    ],
  });
  const row = rowOf(ts, "e1");
  assert.equal(ts.diaryTracked, true);
  assert.deepEqual(row.diary, { approvedMinutes: 300, flaggedDays: 1, waitingDays: 1 });
  assert.equal(row.totals.workedMinutes, 540, "the diary never changes scanned hours");
});

test("no diary figures when the diary is off", () => {
  const { ts } = report({ summaries: [summary("e1", DAYS[0])] });
  assert.equal(rowOf(ts, "e1").diary, undefined);
  assert.equal(ts.diaryTracked, false);
});

test("the summary strip adds the rows, and a cut-off read is reported", () => {
  const { ts } = report({
    summaries: [summary("e1", DAYS[0], { minutesWorked: 600 }), summary("e2", DAYS[0], { minutesWorked: 480 })],
    readTruncated: true,
  });
  assert.equal(ts.summary.people, 2);
  assert.equal(ts.summary.workedMinutes, 1080);
  assert.equal(ts.summary.extraMinutes, 60, "one person's extra is not cancelled by another's shortfall");
  assert.equal(ts.summary.shortMinutes, 60);
  assert.equal(ts.truncated, true);
});

test("the inputs are never changed", () => {
  const sum = Object.freeze(summary("e1", DAYS[0]));
  const reg = register({ summaries: [sum] });
  const before = JSON.stringify(reg);
  buildTimesheetReport({ register: reg, summaries: [sum], nowMs: NOW });
  assert.equal(JSON.stringify(reg), before);
});

// ---- the builder stays pure -----------------------------------------------------------------------------------

test("the builder is pure: no database, no clock, no device time, no alias imports", () => {
  const src = read("src/lib/timesheet-build.ts");
  assert.doesNotMatch(src, /firebase|firestore/i);
  assert.doesNotMatch(src, /Date\.now|new Date\(|getHours|getMinutes|toLocale/);
  assert.doesNotMatch(src, /from\s+["']@\//);
});
