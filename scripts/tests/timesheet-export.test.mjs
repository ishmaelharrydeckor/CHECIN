import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";
import { buildTimesheetReport } from "../../src/lib/timesheet-build.ts";
import { timesheetSummary } from "../../src/lib/timesheet.ts";
import {
  dailyColumns,
  dailyRows,
  filterReport,
  summaryColumns,
  summaryRow,
  timesheetDailyToCsv,
  timesheetDetails,
  timesheetFilename,
  timesheetToCsv,
} from "../../src/lib/timesheet-export.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ---- a report to export ---------------------------------------------------------------------------------

const DAYS = ["2026-11-02", "2026-11-03", "2026-11-04"];
const NOW = Date.parse("2026-11-10T12:00:00.000Z");
const sum = (employeeId, dayKey, over = {}) => ({
  employeeId, employeeName: employeeId, dayKey,
  firstIn: `${dayKey}T08:00:00.000Z`, lastOut: `${dayKey}T17:00:00.000Z`,
  minutesWorked: 540, late: false, earlyDeparture: false, shiftStart: "08:00", shiftEnd: "17:00", ...over,
});

function make({ names = ["Ama", "Kofi"], summaries, breaks = false, diary = false, noShift = false } = {}) {
  const people = names.map((n, i) => ({ uid: `e${i + 1}`, displayName: n, department: "Ops" }));
  const sums =
    summaries ??
    [
      sum("e1", DAYS[0], noShift ? { shiftStart: undefined, shiftEnd: undefined } : {}),
      sum("e1", DAYS[1], { minutesWorked: 600, late: true, ...(noShift ? { shiftStart: undefined, shiftEnd: undefined } : {}) }),
      sum("e2", DAYS[0], { minutesWorked: 450, ...(noShift ? { shiftStart: undefined, shiftEnd: undefined } : {}) }),
    ];
  const reg = buildAttendanceRegister({
    days: DAYS, people, summaries: sums, leaves: [], holidays: [], timezone: "UTC",
    generatedAt: "2026-11-10T12:00:00.000Z", from: DAYS[0], to: DAYS.at(-1), breaks,
    diary: diary ? [{ employeeId: "e1", dayKey: DAYS[2], status: "approved", verifiedMinutes: 90 }] : [],
    diaryTracked: diary,
  });
  return buildTimesheetReport({ register: reg, summaries: sums, nowMs: NOW });
}

const lines = (csv) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

// ---- the summary file ------------------------------------------------------------------------------------

test("the summary file has one row per person and the columns that apply", () => {
  const rep = make();
  const rows = lines(timesheetToCsv(rep));
  assert.equal(rows.length, 1 + rep.rows.length);
  assert.deepEqual(summaryColumns(rep), [
    "Name", "Department", "Days worked", "Hours at work", "Paid hours", "Expected hours", "Extra (+) or short (-) hours",
    "Late days", "Absent days", "Leave days", "Work from home days", "Days with no check-out",
  ]);
  assert.equal(rows[0], summaryColumns(rep).join(","));
});

test("hours are decimals worked out once from the total minutes, with the sign on extra and short", () => {
  const rep = make();
  const ama = rep.rows.find((r) => r.name === "Ama");
  const cells = summaryRow(rep, ama);
  // 540 + 600 = 1140 minutes = 19.00 hours; expected 540 + 540 + 540 (the third day is absent with a shift? no rota given, so only worked days)
  assert.equal(cells[3], "19.00");
  assert.equal(cells[4], "19.00", "paid equals worked when breaks are not tracked");
  assert.equal(cells[6], "+1.00", "extra: 1140 minutes worked against 1080 expected");
});

test("optional columns appear only when they apply", () => {
  assert.ok(!summaryColumns(make()).includes("Break hours"));
  assert.ok(summaryColumns(make({ breaks: true })).includes("Break hours"));
  assert.ok(!summaryColumns(make()).includes("Work diary hours (approved)"));
  assert.ok(summaryColumns(make({ diary: true })).includes("Work diary hours (approved)"));
  const noShift = make({ noShift: true });
  assert.ok(!summaryColumns(noShift).includes("Expected hours"), "nobody on a shift: no Expected or Extra/short columns");
  assert.ok(!dailyColumns(noShift).includes("Expected hours"));
});

test("every row has as many cells as there are columns", () => {
  for (const opts of [{}, { breaks: true }, { diary: true }, { noShift: true }, { breaks: true, diary: true }]) {
    const rep = make(opts);
    for (const r of rep.rows) assert.equal(summaryRow(rep, r).length, summaryColumns(rep).length, JSON.stringify(opts));
    for (const row of dailyRows(rep)) assert.equal(row.length, dailyColumns(rep).length, JSON.stringify(opts));
  }
});

test("the diary figures stay in their own columns, apart from scanned hours", () => {
  const rep = make({ diary: true });
  const ama = rep.rows.find((r) => r.name === "Ama");
  const cells = summaryRow(rep, ama);
  const cols = summaryColumns(rep);
  assert.equal(cells[cols.indexOf("Work diary hours (approved)")], "1.50");
  assert.equal(cells[cols.indexOf("Hours at work")], "19.00");
});

// ---- the daily detail ------------------------------------------------------------------------------------

test("the daily detail has one row per person per day (people times days)", () => {
  const rep = make();
  assert.equal(dailyRows(rep).length, rep.rows.length * DAYS.length);
  assert.equal(lines(timesheetDailyToCsv(rep)).length, 1 + rep.rows.length * DAYS.length);
});

test("a day's line carries its status, times, hours and flags", () => {
  const rep = make();
  const cols = dailyColumns(rep);
  const row = dailyRows(rep).find((r) => r[0] === "Ama" && r[2] === DAYS[1]);
  assert.equal(row[cols.indexOf("Status")], "Present");
  assert.equal(row[cols.indexOf("First in")], "08:00");
  assert.equal(row[cols.indexOf("Hours at work")], "10.00");
  assert.equal(row[cols.indexOf("Extra (+) or short (-) hours")], "+1.00");
  assert.equal(row[cols.indexOf("Late")], "Yes");
  const absent = dailyRows(rep).find((r) => r[0] === "Kofi" && r[2] === DAYS[1]);
  assert.equal(absent[cols.indexOf("Status")], "Absent");
  assert.equal(absent[cols.indexOf("Hours at work")], "0.00");
});

test("a missing check-out is marked and adds no hours", () => {
  const rep = make({ summaries: [sum("e1", DAYS[0], { lastOut: null, minutesWorked: 0, openSince: `${DAYS[0]}T08:00:00.000Z` })] });
  const cols = dailyColumns(rep);
  const row = dailyRows(rep).find((r) => r[0] === "Ama" && r[2] === DAYS[0]);
  assert.equal(row[cols.indexOf("No check-out")], "Yes");
  assert.equal(row[cols.indexOf("Hours at work")], "0.00");
});

// ---- safety -----------------------------------------------------------------------------------------------

test("a name that starts like a formula cannot run in Excel", () => {
  const rep = make({ names: ["=HYPERLINK(\"http://evil\")", "+cmd", "-1", "@SUM(A1)"], summaries: [sum("e1", DAYS[0])] });
  for (const csv of [timesheetToCsv(rep), timesheetDailyToCsv(rep)]) {
    for (const bad of ["=HYPERLINK", "+cmd", "@SUM"]) {
      assert.ok(!csv.includes(`\r\n${bad}`) && !csv.includes(`\r\n"${bad}`), `${bad} is neutralised`);
    }
    assert.ok(csv.includes("'=HYPERLINK") || csv.includes("\"'=HYPERLINK"));
  }
});

test("a comma or quote in a name is quoted and a UTF-8 marker lets Excel read accents", () => {
  const rep = make({ names: ["Mensah, Ama \"Mimi\"", "Zoë"], summaries: [sum("e1", DAYS[0])] });
  const csv = timesheetToCsv(rep);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes('"Mensah, Ama ""Mimi"""'));
  assert.ok(csv.includes("Zoë"));
});

// ---- names, details and filtering ----------------------------------------------------------------------------

test("file names carry the range and say what they are", () => {
  assert.equal(timesheetFilename("timesheet", "2026-11-02", "2026-11-08", "csv"), "timesheet_2026-11-02_to_2026-11-08.csv");
  assert.equal(timesheetFilename("timesheet-daily", "2026-11-02", "2026-11-08", "xlsx"), "timesheet-daily_2026-11-02_to_2026-11-08.xlsx");
});

test("the details carry the range, the timezone, when it was made and what extra and short mean", () => {
  const rep = make();
  const d = Object.fromEntries(timesheetDetails(rep));
  assert.equal(d.From, DAYS[0]);
  assert.equal(d.To, DAYS.at(-1));
  assert.equal(d.Timezone, "UTC");
  assert.equal(d["Generated at"], "2026-11-10T12:00:00.000Z");
  assert.equal(d.Complete, "Yes");
  assert.match(d.Hours, /not approved overtime/);
  assert.match(Object.fromEntries(timesheetDetails({ ...rep, truncated: true })).Complete, /^No/);
});

test("what is downloaded is what is on screen: a filtered report carries its own rows and totals", () => {
  const rep = make();
  const onlyAma = filterReport(rep, (r) => r.name === "Ama", timesheetSummary);
  assert.equal(onlyAma.rows.length, 1);
  assert.equal(onlyAma.summary.people, 1);
  assert.equal(lines(timesheetToCsv(onlyAma)).length, 2);
  assert.equal(dailyRows(onlyAma).length, DAYS.length);
  assert.equal(rep.rows.length, 2, "the original is untouched");
});

test("the export code is pure: no clock, no browser, no database", () => {
  const src = read("src/lib/timesheet-export.ts");
  assert.doesNotMatch(src, /Date\.now|new Date\(|document\.|window\.|firebase|firestore/i);
  assert.doesNotMatch(src, /from\s+["']@\//);
});
