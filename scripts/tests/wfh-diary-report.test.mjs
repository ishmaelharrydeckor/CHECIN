import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diaryTotalsByPerson, withDiaryTotals } from "../../src/lib/wfh-diary-report.ts";
import { CSV_BOM, registerToCsv } from "../../src/lib/report-export.ts";

// Work-from-home diary in the attendance register (task 2.3b, phase 4).
const day = (employeeId, dayKey, status, verifiedMinutes) => ({ employeeId, dayKey, status, verifiedMinutes });
const register = () => ({
  from: "2026-10-19",
  to: "2026-10-20",
  timezone: "UTC",
  generatedAt: "2026-10-20T09:00:00Z",
  truncated: false,
  rows: [
    { employeeId: "ann", name: "Ann", department: "Ops", days: [], totals: { presentDays: 1, lateDays: 0, absentDays: 0, leaveDays: 0, wfhDays: 1, minutesWorked: 480 } },
    { employeeId: "ben", name: "Ben", department: "Ops", days: [], totals: { presentDays: 2, lateDays: 0, absentDays: 0, leaveDays: 0, wfhDays: 0, minutesWorked: 900 } },
  ],
});

test("approved diary time is counted separately; anything not yet approved is shown apart and never as hours", () => {
  const totals = diaryTotalsByPerson([
    day("ann", "2026-10-19", "approved", 300),
    day("ann", "2026-10-20", "pending", 120),
    day("ben", "2026-10-19", "flagged", 200),
    day("ben", "2026-10-20", "approved", 60),
  ]);
  assert.deepEqual(totals.get("ann"), { approvedMinutes: 300, unapprovedMinutes: 120, flaggedDays: 0 });
  assert.deepEqual(totals.get("ben"), { approvedMinutes: 60, unapprovedMinutes: 200, flaggedDays: 1 });
  assert.equal(totals.get("cara"), undefined);
});

test("damaged or unknown entries are ignored", () => {
  const totals = diaryTotalsByPerson([day("ann", "2026-10-19", "approved", -5), day("ann", "2026-10-19", "weird", 60), { employeeId: "", dayKey: "2026-10-19", status: "approved", verifiedMinutes: 10 }]);
  assert.deepEqual(totals.get("ann"), { approvedMinutes: 0, unapprovedMinutes: 0, flaggedDays: 0 });
  assert.equal(totals.get(""), undefined);
});

test("the register gets the diary columns only when the diary is used; scanned hours never change", () => {
  const reg = withDiaryTotals(register(), [day("ann", "2026-10-19", "approved", 300), day("zed", "2026-10-19", "approved", 999)], false);
  assert.equal(reg.diaryTracked, true);
  assert.deepEqual(
    reg.rows.map((r) => [r.totals.minutesWorked, r.totals.diaryApprovedMinutes, r.totals.diaryUnapprovedMinutes, r.totals.diaryFlaggedDays]),
    [
      [480, 300, 0, 0],
      [900, 0, 0, 0],
    ],
    "people outside the register are not added; everyone shown gets the columns",
  );
  assert.equal(reg.truncated, false);
  assert.equal(withDiaryTotals(register(), [], true).truncated, true, "a capped diary read marks the register incomplete");
});

test("the CSV has the three diary columns after the others, only when the diary is used", () => {
  const plain = registerToCsv(register()).replace(CSV_BOM, "").split("\r\n")[0];
  assert.ok(!plain.includes("diary"));
  const reg = withDiaryTotals(
    register(),
    [day("ann", "2026-10-19", "approved", 300), day("ann", "2026-10-20", "flagged", 90), day("ann", "2026-10-21", "approved", 600)],
    false,
  );
  const [head, ann] = registerToCsv(reg).replace(CSV_BOM, "").split("\r\n");
  assert.ok(head.endsWith("WFH diary hours (approved),WFH diary hours (not yet approved),Flagged diary days"));
  assert.ok(ann.endsWith("8.0,5.0,1.5,1"), `scanned hours stay 8.0; a day after the range is left out: ${ann}`);
});

test("the PDF and the screen show the same three figures", () => {
  const pdf = readFileSync("src/lib/report-export.ts", "utf8");
  assert.ok(pdf.includes('...(reg.diaryTracked ? ["Diary", "Unappr.", "Flagged"] : [])'));
  const screen = readFileSync("src/components/reports/AttendanceRegisterReport.tsx", "utf8");
  assert.ok(screen.includes("data?.diaryTracked"));
});
