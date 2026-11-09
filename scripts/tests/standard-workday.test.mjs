import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";
import { buildTimesheetDay, buildTimesheetRow } from "../../src/lib/timesheet.ts";
import { buildTimesheetReport } from "../../src/lib/timesheet-build.ts";
import { timesheetToCsv, summaryColumns } from "../../src/lib/timesheet-export.ts";
import {
  DEFAULT_WORK_DAYS,
  parseStoredWorkday,
  parseWorkdayInput,
  standardMinutesFor,
  workdaySummary,
} from "../../src/lib/standard-workday.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ---- reading what is stored ---------------------------------------------------------------------------------

test("a stored day is read with its length and its work days", () => {
  assert.deepEqual(parseStoredWorkday({ standardDayMinutes: 450, workDays: [4, 0, 2, 0] }), { minutes: 450, workDays: [0, 2, 4] });
});

test("missing work days read as Monday to Friday", () => {
  assert.deepEqual(parseStoredWorkday({ standardDayMinutes: 480 }), { minutes: 480, workDays: [...DEFAULT_WORK_DAYS] });
  for (const bad of [[], [7], [-1], ["0"], "mon", null]) {
    assert.deepEqual(parseStoredWorkday({ standardDayMinutes: 480, workDays: bad }).workDays, [...DEFAULT_WORK_DAYS], JSON.stringify(bad));
  }
});

test("a missing or damaged length reads as not set, so nobody gets an expected time that was never chosen", () => {
  for (const bad of [undefined, null, 5, "x", [], {}, { standardDayMinutes: 0 }, { standardDayMinutes: 29 }, { standardDayMinutes: 961 }, { standardDayMinutes: 480.5 }, { standardDayMinutes: "480" }, { standardDayMinutes: NaN }, { standardDayMinutes: null }]) {
    assert.equal(parseStoredWorkday(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(parseStoredWorkday({ standardDayMinutes: 30 }).minutes, 30);
  assert.deepEqual(parseStoredWorkday({ standardDayMinutes: 960 }).minutes, 960);
});

// ---- what an admin sends ---------------------------------------------------------------------------------------

test("good input is accepted, and clearing removes the setting", () => {
  assert.deepEqual(parseWorkdayInput({ minutes: 450, workDays: [4, 0, 1, 1] }), { ok: true, value: { minutes: 450, workDays: [0, 1, 4] } });
  assert.deepEqual(parseWorkdayInput({ clear: true }), { ok: true, value: null });
});

test("bad input is refused in plain words", () => {
  for (const bad of [null, undefined, 7, "8", [], {}, { minutes: 480 }, { minutes: 480, workDays: [] }, { minutes: 480, workDays: [8] }, { minutes: 480, workDays: "mon" }, { minutes: 29, workDays: [0] }, { minutes: 961, workDays: [0] }, { minutes: 480.5, workDays: [0] }, { minutes: "480", workDays: [0] }, { minutes: NaN, workDays: [0] }, { clear: "yes" }]) {
    const r = parseWorkdayInput(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.error.length > 20 && !/undefined|\[object|NaN/.test(r.error), JSON.stringify(bad));
  }
});

// ---- saying it in words --------------------------------------------------------------------------------------------

test("a workday is written in plain words", () => {
  assert.equal(workdaySummary({ minutes: 480, workDays: [0, 1, 2, 3, 4] }), "8 hours a day, Monday to Friday");
  assert.equal(workdaySummary({ minutes: 450, workDays: [0, 1, 2, 3, 4, 5] }), "7 hours 30 minutes a day, Monday to Saturday");
  assert.equal(workdaySummary({ minutes: 60, workDays: [0, 2, 4] }), "1 hour a day, Monday, Wednesday and Friday");
  assert.equal(workdaySummary({ minutes: 45, workDays: [5, 6] }), "45 minutes a day, Saturday and Sunday");
  assert.equal(workdaySummary({ minutes: 480, workDays: [0] }), "8 hours a day, Monday");
  assert.equal(workdaySummary({ minutes: 480, workDays: [0, 1, 2, 4] }), "8 hours a day, Monday to Wednesday and Friday");
});

test("a work day expects the standard length and any other day expects nothing", () => {
  const w = { minutes: 480, workDays: [0, 1, 2, 3, 4] };
  assert.equal(standardMinutesFor(w, 0), 480);
  assert.equal(standardMinutesFor(w, 4), 480);
  assert.equal(standardMinutesFor(w, 5), 0);
  assert.equal(standardMinutesFor(w, 6), 0);
});

// ---- the timesheet with and without it -----------------------------------------------------------------------------------

const MON = "2026-11-02";
const SAT = "2026-11-07";
const WORKDAY = { minutes: 480, workDays: [0, 1, 2, 3, 4] };
const day = (over = {}) => ({
  dayKey: MON, status: "present", firstIn: "08:00", lastOut: "17:00", minutesWorked: 540, late: false, earlyDeparture: false,
  openSession: false, stillOnShift: false, shift: null, ...over,
});
const build = (input, standardWorkday) => buildTimesheetDay(input, { breaksTracked: false, standardWorkday });

test("without a standard workday a person with no shift still has no expected time (nothing changed)", () => {
  for (const sw of [undefined, null]) {
    const d = build(day(), sw);
    assert.equal(d.expectedMinutes, null);
    assert.equal(d.differenceMinutes, null);
  }
});

test("with one, a person with no shift is measured against it on a work day", () => {
  const d = build(day({ minutesWorked: 540 }), WORKDAY);
  assert.equal(d.expectedMinutes, 480);
  assert.equal(d.differenceMinutes, 60);
  assert.equal(build(day({ minutesWorked: 400 }), WORKDAY).differenceMinutes, -80);
  assert.equal(build(day({ status: "absent", minutesWorked: 0 }), WORKDAY).differenceMinutes, -480, "absent on a work day is short by the day");
});

test("on a day that is not a work day nothing is expected, so any time worked is extra", () => {
  const d = build(day({ dayKey: SAT, minutesWorked: 120 }), WORKDAY);
  assert.equal(d.expectedMinutes, 0);
  assert.equal(d.differenceMinutes, 120);
  assert.equal(build(day({ dayKey: SAT, status: "off", minutesWorked: 0 }), WORKDAY).differenceMinutes, 0);
});

test("leave, holidays and work from home still expect nothing", () => {
  for (const status of ["leave", "holiday", "wfh", "off", "other", "expected"]) {
    const d = build(day({ status, minutesWorked: 0 }), WORKDAY);
    assert.equal(d.expectedMinutes, 0, status);
    assert.equal(d.differenceMinutes, 0, status);
  }
});

test("a shift always wins over the standard day", () => {
  const withShift = day({ shift: { start: "08:00", end: "14:00" }, minutesWorked: 360 });
  const d = build(withShift, WORKDAY);
  assert.equal(d.expectedMinutes, 360);
  assert.equal(d.differenceMinutes, 0);
});

test("a person's totals use it, and a person with only days off still has none", () => {
  const row = buildTimesheetRow(
    { employeeId: "e1", name: "A", department: "", days: [day({ minutesWorked: 540 }), day({ dayKey: "2026-11-03", minutesWorked: 480 }), day({ dayKey: SAT, minutesWorked: 0, status: "off" })] },
    { breaksTracked: false, standardWorkday: WORKDAY },
  );
  assert.equal(row.totals.expectedMinutes, 960);
  assert.equal(row.totals.differenceMinutes, 60);
  const none = buildTimesheetRow({ employeeId: "e2", name: "B", department: "", days: [day({ dayKey: SAT, minutesWorked: 0, status: "off" })] }, { breaksTracked: false, standardWorkday: WORKDAY });
  assert.equal(none.totals.expectedMinutes, null, "nothing was owed, so nothing is claimed");
});

test("a badly written day key does not break the timesheet", () => {
  const d = build(day({ dayKey: "soon" }), WORKDAY);
  assert.equal(d.expectedMinutes, null);
});

// ---- the whole report ---------------------------------------------------------------------------------------------------

const DAYS = ["2026-11-02", "2026-11-03", "2026-11-07"];
function report(standardWorkday) {
  const sums = [{ employeeId: "e1", employeeName: "Ama", dayKey: DAYS[0], firstIn: `${DAYS[0]}T08:00:00.000Z`, lastOut: `${DAYS[0]}T17:00:00.000Z`, minutesWorked: 540, late: false, earlyDeparture: false }];
  const reg = buildAttendanceRegister({
    days: DAYS, people: [{ uid: "e1", displayName: "Ama", department: "Ops" }], summaries: sums, leaves: [], holidays: [], timezone: "UTC",
    generatedAt: "2026-11-10T12:00:00.000Z", from: DAYS[0], to: DAYS.at(-1),
  });
  return buildTimesheetReport({ register: reg, summaries: sums, nowMs: Date.parse("2026-11-10T12:00:00.000Z"), standardWorkday });
}

test("the report carries the setting, and the Expected columns appear only once it is set", () => {
  const without = report(undefined);
  assert.equal(without.standardWorkday, null);
  assert.equal(without.anyExpected, false);
  assert.ok(!summaryColumns(without).includes("Expected hours"));

  const withIt = report(WORKDAY);
  assert.deepEqual(withIt.standardWorkday, WORKDAY);
  assert.equal(withIt.anyExpected, true);
  assert.ok(summaryColumns(withIt).includes("Expected hours"));
  const row = withIt.rows[0];
  assert.equal(row.days[0].expectedMinutes, 480);
  assert.equal(row.days[1].status, "absent");
  assert.equal(row.days[1].differenceMinutes, -480, "absent on a work day with no shift is short by a day");
  assert.equal(row.days[2].expectedMinutes, 0, "Saturday expects nothing");
});

test("the download follows: expected hours and the sign appear in the file", () => {
  const csv = timesheetToCsv(report(WORKDAY));
  assert.match(csv, /Expected hours/);
  assert.match(csv, /Extra \(\+\) or short \(-\) hours/);
  assert.doesNotMatch(timesheetToCsv(report(undefined)), /Expected hours/);
});

// ---- the route, the card and the screen ------------------------------------------------------------------------------------

const route = read("src/routes/api/organization/workday.ts");

test("only an org admin can change it; an admin or manager can see it; both are checked from the token", () => {
  assert.ok(route.includes("verifyCallerToken(request.headers.get(\"authorization\"), { checkRevoked: true })"));
  const put = route.slice(route.indexOf("PUT:"));
  assert.ok(put.includes('caller.role !== "org_admin"'));
  assert.ok(put.indexOf('caller.role !== "org_admin"') < put.indexOf("request.json()"), "refused before the body is read");
  const get = route.slice(route.indexOf("GET:"), route.indexOf("PUT:"));
  assert.ok(get.includes('caller.role !== "org_admin" && caller.role !== "manager"'));
  assert.ok(!/request\.json\(\)/.test(get));
});

test("the save is limited, checked, logged and written to the caller's own organization only", () => {
  assert.ok(route.includes("checkRateLimit(`org_workday_${caller.uid}`"));
  assert.ok(route.includes("parseWorkdayInput("));
  assert.ok(route.includes('action: "org.workday.set"'));
  assert.ok(route.includes('.doc(orgId)'), "the organization comes from the token");
  assert.ok(!/body\??\.(orgId|org)/.test(route));
  assert.ok(route.includes("FieldValue.delete()"), "removing it removes the fields, not sets them to zero");
});

test("the timesheet route reads it fresh and passes it on", () => {
  const ts = read("src/routes/api/reports/timesheet.ts");
  assert.ok(ts.includes("loadStandardWorkday(scope.orgId)"));
  assert.ok(ts.includes("standardWorkday,"));
  const loader = read("src/lib/standard-workday.server.ts");
  assert.ok(loader.includes("catch {\n    return null;"), "a read failure means not set, never a made-up expected time");
});

test("the timesheet screen offers the card to org admins only, and says what it measures against", () => {
  const view = read("src/components/timesheet/TimesheetView.tsx");
  assert.ok(view.includes("{isOrgAdmin && <StandardWorkdayCard />}"));
  assert.ok(view.includes("workdaySummary(data.standardWorkday)"));
  assert.ok(view.includes("People with no shift show hours only."));
  const card = read("src/components/timesheet/StandardWorkdayCard.tsx");
  assert.ok(card.includes("/api/organization/workday"));
  assert.ok(card.includes('aria-pressed={days.includes(d.n)}'), "the day buttons say whether they are on, in words as well as colour");
  assert.ok(card.includes("Not set: they show hours only"));
  for (const state of ["Loading the standard workday", "Try again", "role=\"alert\""]) assert.ok(card.includes(state), state);
});

test("the pure module is pure", () => {
  const src = read("src/lib/standard-workday.ts");
  assert.doesNotMatch(src, /firebase|firestore/i);
  assert.doesNotMatch(src, /Date\.now|new Date\(|getHours|toLocale|process\./);
  assert.doesNotMatch(src, /from\s+["']@\//);
});
