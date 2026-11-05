import test from "node:test";
import assert from "node:assert/strict";
import {
  CSV_BOM,
  buildCsv,
  csvCell,
  dayCellText,
  formatHours,
  leaveLedgerToCsv,
  registerToCsv,
  reportFilename,
} from "../../src/lib/report-export.ts";

// ------------------------------------------------------------ CSV safety (the part that can hurt)
test("csvCell: a cell that Excel could run as a formula is neutralised with a leading quote", () => {
  for (const evil of ["=1+1", "+SUM(A1)", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
    assert.ok(csvCell(evil).startsWith("'") || csvCell(evil).startsWith(`"'`), `not neutralised: ${JSON.stringify(evil)}`);
  }
  assert.equal(csvCell("=Kwame Test"), "'=Kwame Test");
  assert.equal(csvCell("+Finance"), "'+Finance");
  assert.equal(csvCell("@Support"), "'@Support");
});

test("csvCell: ordinary text, numbers and empty values are left alone", () => {
  assert.equal(csvCell("Ama Mensah"), "Ama Mensah");
  assert.equal(csvCell(8.3), "8.3");
  assert.equal(csvCell(0), "0");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell("2026-10-05"), "2026-10-05");
});

test("csvCell: commas, quotes and line breaks are quoted correctly", () => {
  assert.equal(csvCell('Élodie "Elo" O\'Brien, Jr.'), '"Élodie ""Elo"" O\'Brien, Jr."');
  assert.equal(csvCell("a\nb"), '"a\nb"');
  // a formula with a comma is both neutralised and quoted
  assert.equal(csvCell("=A1,B1"), `"'=A1,B1"`);
});

test("buildCsv: UTF-8 byte order mark (so Excel shows accents), CRLF lines, trailing newline", () => {
  const csv = buildCsv([
    ["Name", "Hours"],
    ["Élodie", 8],
  ]);
  assert.ok(csv.startsWith(CSV_BOM));
  assert.equal(csv, `${CSV_BOM}Name,Hours\r\nÉlodie,8\r\n`);
});

// ------------------------------------------------------------ the two reports
const day = (over = {}) => ({
  dayKey: "2026-10-05",
  status: "present",
  firstIn: "08:14",
  lastOut: "17:02",
  minutesWorked: 495,
  late: false,
  earlyDeparture: false,
  ...over,
});

const register = {
  from: "2026-10-05",
  to: "2026-10-06",
  timezone: "Africa/Accra",
  generatedAt: "2026-10-07T09:00:00Z",
  truncated: false,
  rows: [
    {
      employeeId: "u1",
      name: "=Kwame Test",
      department: "+Finance",
      days: [day(), day({ dayKey: "2026-10-06", status: "absent", firstIn: null, lastOut: null, minutesWorked: 0 })],
      totals: { presentDays: 1, lateDays: 0, absentDays: 1, leaveDays: 0, wfhDays: 0, minutesWorked: 495 },
    },
  ],
};

test("registerToCsv: headings, one column per day, totals, hours with one decimal", () => {
  const lines = registerToCsv(register).replace(CSV_BOM, "").trim().split("\r\n");
  assert.equal(lines[0], "Name,Department,2026-10-05,2026-10-06,Present days,Late days,Absent days,Leave days,Work from home days,Hours worked");
  assert.equal(lines[1].split(",").length, lines[0].split(",").length);
  assert.ok(lines[1].endsWith(",1,0,1,0,0,8.3"));
});

test("registerToCsv: names and departments that look like formulas are neutralised", () => {
  const csv = registerToCsv(register);
  assert.ok(csv.includes("'=Kwame Test"));
  assert.ok(csv.includes("'+Finance"));
  assert.ok(!/(^|,)=Kwame/.test(csv));
});

test("leaveLedgerToCsv: an undecided request has an empty 'Decided on'", () => {
  const csv = leaveLedgerToCsv({
    from: "2026-10-01",
    to: "2026-10-31",
    generatedAt: "2026-10-07T09:00:00Z",
    truncated: false,
    rows: [
      { id: "r1", employeeId: "u1", name: "Ama", department: "Ops", type: "Annual leave", startDate: "2026-10-10", endDate: "2026-10-12", days: 3, status: "pending", decidedOn: null },
    ],
  });
  const lines = csv.replace(CSV_BOM, "").trim().split("\r\n");
  assert.equal(lines[0], "Name,Department,Leave type,Start date,End date,Days,Status,Decided on");
  assert.equal(lines[1], "Ama,Ops,Annual leave,2026-10-10,2026-10-12,3,pending,");
});

// ------------------------------------------------------------ small helpers
test("formatHours and dayCellText", () => {
  assert.equal(formatHours(495), "8.3");
  assert.equal(formatHours(0), "0.0");
  assert.equal(dayCellText(day()), "Present 08:14-17:02");
  assert.equal(dayCellText(day({ late: true, earlyDeparture: true })), "Present 08:14-17:02 (late, left early)");
  assert.equal(dayCellText(day({ status: "leave", firstIn: null, lastOut: null })), "On leave");
});

test("reportFilename names the report and the range", () => {
  assert.equal(reportFilename("attendance-register", "2026-10-01", "2026-10-14", "csv"), "attendance-register_2026-10-01_to_2026-10-14.csv");
});
