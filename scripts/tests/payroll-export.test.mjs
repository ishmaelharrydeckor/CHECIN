import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPeriodLines } from "../../src/lib/pay-period-lock.ts";
import { overtimeEntryId } from "../../src/lib/overtime.ts";
import {
  DAILY_HEADINGS,
  DEFAULT_PAYROLL_EXPORT_SETTINGS,
  DEFAULT_SUMMARY_COLUMNS,
  SUMMARY_COLUMNS,
  dailyTable,
  formatPayrollHours,
  parsePayrollExportSettings,
  payrollDailyCsv,
  payrollFilename,
  payrollSummaryCsv,
  summaryTable,
} from "../../src/lib/payroll-export.ts";

const PERIOD = { startDay: "2026-11-02", endDay: "2026-11-04" };
const HEADER = { startDay: "2026-11-02", endDay: "2026-11-04", version: 2, lockedAt: "2026-11-09T08:00:00.000Z", timezone: "Africa/Accra" };

const d = (dayKey, over = {}) => ({ dayKey, status: "present", workedMinutes: 480, breakMinutes: 0, paidMinutes: 480, expectedMinutes: 480, late: false, noCheckOut: false, ...over });
const person = (employeeId, name, days, over = {}) => ({ employeeId, name, department: "Ops", payrollCode: null, days, ...over });
const entry = (employeeId, dayKey, minutes, status) => ({ id: overtimeEntryId(employeeId, dayKey), employeeId, dayKey, minutes, status, managerId: "m1" });

const lines = buildPeriodLines(
  [
    person("e1", "Ama Mensah", [d("2026-11-02", { workedMinutes: 570, breakMinutes: 60, paidMinutes: 510, late: true }), d("2026-11-03"), d("2026-11-04", { status: "wfh", workedMinutes: 0, paidMinutes: 0, expectedMinutes: 0 })], { payrollCode: "P-100" }),
    person("e2", "Kofi Boateng", [d("2026-11-02", { status: "absent", workedMinutes: 0, paidMinutes: 0 }), d("2026-11-03", { noCheckOut: true, workedMinutes: 0, paidMinutes: 0 })]),
  ],
  [entry("e1", "2026-11-02", 30, "approved"), entry("e1", "2026-11-03", 20, "pending"), entry("e1", "2026-11-04", 45, "declined")],
  PERIOD,
);
const csvLines = (csv) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

// ---- hours, written once from the total -------------------------------------------------------------------------

test("hours are written as decimals or as hours and minutes, from the total minutes", () => {
  assert.equal(formatPayrollHours(450, "decimal"), "7.50");
  assert.equal(formatPayrollHours(450, "hhmm"), "7:30");
  assert.equal(formatPayrollHours(5, "hhmm"), "0:05");
  assert.equal(formatPayrollHours(0, "hhmm"), "0:00");
  assert.equal(formatPayrollHours(0, "decimal"), "0.00");
  assert.equal(formatPayrollHours(1500, "hhmm"), "25:00", "a long period does not wrap at 24");
  assert.equal(formatPayrollHours(1, "decimal"), "0.02");
  assert.equal(formatPayrollHours(-30, "decimal"), "0.00", "never negative");
  assert.equal(formatPayrollHours("x", "hhmm"), "0:00");
  assert.equal(formatPayrollHours(90.9, "hhmm"), "1:30", "whole minutes only");
});

test("rounded numbers are never added: the total is converted, not the days", () => {
  // Three days of 20 minutes: 60 minutes is exactly 1.00 hours. Adding three rounded 0.33s would give 0.99.
  const three = buildPeriodLines([person("e9", "Z", ["2026-11-02", "2026-11-03", "2026-11-04"].map((k) => d(k, { workedMinutes: 20, paidMinutes: 20 })))], [], PERIOD);
  const table = summaryTable(three, DEFAULT_PAYROLL_EXPORT_SETTINGS);
  assert.equal(table[1][table[0].indexOf("Hours worked")], "1.00");
});

// ---- choosing the columns ------------------------------------------------------------------------------------------

test("the default columns are the ones the design lists, with the payroll code first", () => {
  assert.deepEqual(DEFAULT_SUMMARY_COLUMNS, [
    "payrollCode", "name", "department", "daysWorked", "workedHours", "breakHours", "paidHours", "expectedHours",
    "approvedOvertimeHours", "unapprovedExtraHours", "leaveDays", "holidayDays", "wfhDays", "absentDays", "lateDays",
  ]);
  assert.equal(SUMMARY_COLUMNS.length, DEFAULT_SUMMARY_COLUMNS.length);
  assert.deepEqual(DEFAULT_PAYROLL_EXPORT_SETTINGS, { columns: [...DEFAULT_SUMMARY_COLUMNS], hoursFormat: "decimal" });
});

test("the admin can choose and reorder columns and pick the hours format", () => {
  const ok = parsePayrollExportSettings({ columns: ["name", "payrollCode", "paidHours"], hoursFormat: "hhmm" });
  assert.deepEqual(ok, { ok: true, value: { columns: ["name", "payrollCode", "paidHours"], hoursFormat: "hhmm" } });
  assert.deepEqual(parsePayrollExportSettings({}), { ok: true, value: DEFAULT_PAYROLL_EXPORT_SETTINGS });
  const table = summaryTable(lines, ok.value);
  assert.deepEqual(table[0], ["Name", "Payroll code", "Paid hours"]);
  assert.deepEqual(table[1], ["Ama Mensah", "P-100", "16:30"]);
});

test("bad choices are refused in plain words", () => {
  for (const bad of [null, 7, [], { columns: [] }, { columns: "name" }, { columns: ["name", "name"] }, { columns: ["name", "salary"] }, { columns: [1] }, { hoursFormat: "minutes" }, { hoursFormat: 7.5 }]) {
    const r = parsePayrollExportSettings(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.error.length > 20 && !/undefined|\[object/.test(r.error), JSON.stringify(bad));
  }
});

test("there is no column for money, a rate or pay", () => {
  for (const c of SUMMARY_COLUMNS) assert.doesNotMatch(c.label, /rate|salary|wage|pay amount|gross|net|tax|currency|cost/i, c.label);
  assert.equal(parsePayrollExportSettings({ columns: ["salary"] }).ok, false);
});

// ---- the summary ----------------------------------------------------------------------------------------------------

test("the summary has a heading and one row per person, with the frozen figures", () => {
  const t = summaryTable(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS);
  assert.equal(t.length, 3);
  const col = (name) => t[0].indexOf(name);
  const ama = t[1];
  assert.equal(ama[col("Payroll code")], "P-100");
  assert.equal(ama[col("Name")], "Ama Mensah");
  assert.equal(ama[col("Days worked")], 2);
  assert.equal(ama[col("Hours worked")], "17.50", "570 + 480 minutes");
  assert.equal(ama[col("Break hours")], "1.00");
  assert.equal(ama[col("Paid hours")], "16.50");
  assert.equal(ama[col("Expected hours")], "16.00", "two worked days plus the work-from-home day, which expects nothing");
  assert.equal(ama[col("Approved overtime hours")], "0.50");
  assert.equal(ama[col("Unapproved extra hours")], "1.08", "pending 20 plus declined 45 is 65 minutes");
  assert.equal(ama[col("Work from home days")], 1);
  assert.equal(ama[col("Late count")], 1);
  const kofi = t[2];
  assert.equal(kofi[col("Payroll code")], "", "a person with no code has an empty cell, not a made-up one");
  assert.equal(kofi[col("Absent days")], 1);
});

test("work from home is a day count with no hours", () => {
  const t = summaryTable(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS);
  const daily = dailyTable(lines, "decimal");
  const wfh = daily.find((r) => r[1] === "Ama Mensah" && r[3] === "2026-11-04");
  assert.equal(wfh[4], "Work from home");
  assert.equal(wfh[5], "0.00");
  assert.equal(t[1][t[0].indexOf("Work from home days")], 1);
});

test("unapproved extra time sits in its own column and is never added to approved overtime", () => {
  const t = summaryTable(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS);
  const col = (n) => t[0].indexOf(n);
  assert.notEqual(col("Approved overtime hours"), col("Unapproved extra hours"));
  assert.equal(t[1][col("Approved overtime hours")], "0.50");
});

// ---- the daily detail -------------------------------------------------------------------------------------------------

test("the daily detail has a heading and one row per person per day", () => {
  const t = dailyTable(lines, "hhmm");
  assert.deepEqual(t[0], [...DAILY_HEADINGS]);
  assert.equal(t.length - 1, lines.reduce((n, l) => n + l.days.length, 0));
  const row = t.find((r) => r[1] === "Ama Mensah" && r[3] === "2026-11-02");
  assert.deepEqual(row, ["P-100", "Ama Mensah", "Ops", "2026-11-02", "Present", "9:30", "1:00", "8:30", "8:00", "Yes", ""]);
  const missing = t.find((r) => r[1] === "Kofi Boateng" && r[3] === "2026-11-03");
  assert.equal(missing[10], "Yes");
  assert.equal(missing[5], "0:00", "a missing check-out adds no hours");
});

// ---- the files --------------------------------------------------------------------------------------------------------

test("the file header names the period, the timezone, the version and the lock time", () => {
  const rows = csvLines(payrollSummaryCsv(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER));
  assert.deepEqual(rows.slice(0, 6), [
    "ChecIN pay period summary",
    "Period,2026-11-02 to 2026-11-04",
    "Timezone,Africa/Accra",
    "Version,2",
    "Locked at,2026-11-09T08:00:00.000Z",
    "",
  ]);
  assert.equal(rows[6].split(",")[0], "Payroll code");
  assert.equal(csvLines(payrollDailyCsv(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER))[0], "ChecIN pay period daily detail");
});

test("the same locked period gives the same file every time, with no download time in it", () => {
  const a = payrollSummaryCsv(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER);
  const b = payrollSummaryCsv(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER);
  assert.equal(a, b);
  assert.equal(payrollDailyCsv(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER), payrollDailyCsv(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER));
  assert.doesNotMatch(a, /download|generated/i);
  const src = readFileSync("src/lib/payroll-export.ts", "utf8");
  assert.doesNotMatch(src, /Date\.now|new Date\(|toISOString/);
});

test("a new version gives a different header and a different file name", () => {
  const v1 = payrollSummaryCsv(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS, { ...HEADER, version: 1 });
  const v2 = payrollSummaryCsv(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER);
  assert.notEqual(v1, v2);
  assert.equal(payrollFilename("summary", "2026-11-02", "2026-11-04", 2, "csv"), "pay-period-summary_2026-11-02_to_2026-11-04_v2.csv");
});

test("the header can be left off for tools that want a bare table", () => {
  const rows = csvLines(payrollSummaryCsv(lines, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER, { header: false }));
  assert.equal(rows[0].split(",")[0], "Payroll code");
  assert.equal(rows.length, 3);
});

test("a name or code that starts like a formula cannot run in Excel", () => {
  const evil = buildPeriodLines([person("e1", "=HYPERLINK(\"http://evil\")", [d("2026-11-02")], { payrollCode: "+cmd" }), person("e2", "@SUM(A1)", [d("2026-11-02")], { payrollCode: "-1+2" })], [], PERIOD);
  for (const csv of [payrollSummaryCsv(evil, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER), payrollDailyCsv(evil, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER)]) {
    for (const bad of ["=HYPERLINK", "+cmd", "@SUM", "-1+2"]) {
      assert.ok(!csv.includes(`\r\n${bad}`) && !csv.includes(`,${bad}`) && !csv.includes(`"${bad}`), `${bad} is neutralised`);
    }
  }
});

test("accents and commas survive, and Excel is told the file is UTF-8", () => {
  const l = buildPeriodLines([person("e1", "Zoë, \"Mimi\" Owusu", [d("2026-11-02")])], [], PERIOD);
  const csv = payrollSummaryCsv(l, DEFAULT_PAYROLL_EXPORT_SETTINGS, HEADER);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes('"Zoë, ""Mimi"" Owusu"'));
});

test("the module is pure: no database, no device time, no alias imports", () => {
  const src = readFileSync("src/lib/payroll-export.ts", "utf8");
  assert.doesNotMatch(src, /firebase|firestore/i);
  assert.doesNotMatch(src, /getHours|toLocale|process\./);
  assert.doesNotMatch(src, /from\s+["']@\//);
});
