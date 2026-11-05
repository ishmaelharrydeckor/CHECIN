import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAttendanceRegister, diaryTotals } from "../../src/lib/report-data.ts";
import { registerToCsv } from "../../src/lib/report-export.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const DAYS = ["2026-10-19", "2026-10-20", "2026-10-21"];
const people = [
  { uid: "a", displayName: "Ama" },
  { uid: "b", displayName: "Kofi" },
];
const summary = (employeeId, dayKey, minutesWorked) => ({ employeeId, dayKey, minutesWorked, firstIn: null, lastOut: null });
const d = (employeeId, dayKey, status, verifiedMinutes) => ({ employeeId, dayKey, status, verifiedMinutes });

function build(extra = {}) {
  return buildAttendanceRegister({
    days: DAYS,
    people,
    summaries: [summary("a", "2026-10-19", 480)],
    leaves: [],
    holidays: [],
    timezone: "Africa/Accra",
    generatedAt: "2026-10-22T08:00:00.000Z",
    from: DAYS[0],
    to: DAYS[2],
    ...extra,
  });
}

// ---------------------------------------------------------------- the sums
test("only approved days count as diary hours; flagged and waiting days are counted as days, not hours", () => {
  const t = diaryTotals(DAYS, [
    d("a", "2026-10-19", "approved", 240),
    d("a", "2026-10-20", "flagged", 600),
    d("a", "2026-10-21", "pending", 120),
  ]);
  assert.deepEqual(t, { diaryApprovedMinutes: 240, diaryFlaggedDays: 1, diaryWaitingDays: 1 });
});

test("days outside the report are ignored, and a repeated day counts once", () => {
  const t = diaryTotals(DAYS, [
    d("a", "2026-10-18", "approved", 500),
    d("a", "2026-10-19", "approved", 60),
    d("a", "2026-10-19", "approved", 60),
  ]);
  assert.equal(t.diaryApprovedMinutes, 60);
});

test("damaged figures never add anything", () => {
  const t = diaryTotals(DAYS, [d("a", "2026-10-19", "approved", Number.NaN), d("a", "2026-10-20", "approved", -30), d("a", "2026-10-21", "approved", "x")]);
  assert.equal(t.diaryApprovedMinutes, 0);
  assert.deepEqual(diaryTotals(DAYS, undefined), { diaryApprovedMinutes: 0, diaryFlaggedDays: 0, diaryWaitingDays: 0 });
});

// ---------------------------------------------------------------- the register
test("with the diary on, each person gets their own figures, and scanned hours are untouched", () => {
  const reg = build({
    diaryTracked: true,
    diary: [d("a", "2026-10-20", "approved", 180), d("b", "2026-10-20", "flagged", 90), d("b", "2026-10-21", "pending", 30)],
  });
  assert.equal(reg.diaryTracked, true);
  const ama = reg.rows.find((r) => r.name === "Ama").totals;
  const kofi = reg.rows.find((r) => r.name === "Kofi").totals;
  assert.equal(ama.diaryApprovedMinutes, 180);
  assert.equal(ama.minutesWorked, 480, "diary time is never added to scanned hours");
  assert.deepEqual([kofi.diaryApprovedMinutes, kofi.diaryFlaggedDays, kofi.diaryWaitingDays], [0, 1, 1]);
  assert.equal(kofi.minutesWorked, 0);
});

test("with the diary off, the report is exactly as before: no flag, no diary figures", () => {
  const reg = build({ diary: [d("a", "2026-10-20", "approved", 180)] });
  assert.equal(reg.diaryTracked, undefined);
  assert.ok(reg.rows.every((r) => !("diaryApprovedMinutes" in r.totals)));
});

test("someone who left the team keeps their diary figures for the days under this manager", () => {
  const reg = build({
    diaryTracked: true,
    summaries: [summary("gone", "2026-10-19", 300)],
    diary: [d("gone", "2026-10-19", "approved", 120)],
  });
  const former = reg.rows.find((r) => r.employeeId === "gone");
  assert.equal(former.totals.diaryApprovedMinutes, 120);
});

// ---------------------------------------------------------------- the file
test("the CSV has the three diary columns, apart from hours worked, only when the diary is on", () => {
  const on = registerToCsv(build({ diaryTracked: true, diary: [d("a", "2026-10-20", "approved", 150), d("a", "2026-10-21", "flagged", 60)] }));
  const header = on.replace("﻿", "").split("\r\n")[0].split(",");
  assert.deepEqual(header.slice(-3), ["WFH diary hours (approved)", "WFH diary days flagged", "WFH diary days awaiting approval"]);
  const ama = on.split("\r\n").find((l) => l.startsWith("Ama")).split(",");
  assert.deepEqual(ama.slice(-3), ["2.5", "1", "0"]);
  assert.ok(ama.includes("8.0"), "scanned hours stay as they were");
  const off = registerToCsv(build());
  assert.ok(!off.includes("WFH diary"));
});

// ---------------------------------------------------------------- the route and the screen
const route = read("src/routes/api/reports/register.ts");
const data = read("src/lib/attendance-data.server.ts");
const screen = read("src/components/reports/AttendanceRegisterReport.tsx");
const pdf = read("src/lib/report-export.ts");

test("the diary is read only for an organization that has it on, in the caller's own scope, and a failure only marks the report incomplete", () => {
  assert.ok(route.includes("context.diaryEnabled"));
  assert.ok(route.includes("loadDiaryDays(scope,"), "scope comes from the verified token");
  assert.ok(route.includes("truncated: true"), "an unreadable diary says the report may be incomplete");
  const fn = data.slice(data.indexOf("export async function loadDiaryDays"));
  assert.ok(fn.includes('.where("orgId", "==", scope.orgId)'));
  assert.ok(fn.includes('scope.role === "manager"') && fn.includes('.where("managerId", "==", scope.uid)'));
  assert.ok(fn.includes(".limit(cap)"), "bounded");
  assert.ok(fn.includes('"wfh_diary_days"') && !fn.includes("wfh_diary_intervals") && !fn.includes("wfh_diary_sessions"), "summaries only, never the blocks");
});

test("the indexes for the diary range query exist", () => {
  const idx = JSON.parse(read("firestore.indexes.json")).indexes.filter((i) => i.collectionGroup === "wfh_diary_days");
  const shapes = idx.map((i) => i.fields.map((f) => f.fieldPath).join(","));
  assert.ok(shapes.includes("orgId,dayKey"));
  assert.ok(shapes.includes("orgId,managerId,dayKey"));
});

test("the screen and the PDF show the diary columns only when the diary is on", () => {
  assert.ok(screen.includes("data?.diaryTracked"));
  assert.ok(screen.includes('"Diary hrs", "Diary flagged", "Diary waiting"'));
  assert.ok(pdf.includes("reg.diaryTracked"));
  assert.ok(pdf.includes("5 + (reg.breaksTracked ? 2 : 0) + (reg.diaryTracked ? 3 : 0)"));
});
