import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseShiftInput } from "../../src/lib/shift-engine.ts";
import { snapshotFromShiftDoc, readShiftSettings, parseSettingsInput } from "../../src/lib/shift-requests.ts";
import { assignmentFromDoc } from "../../src/lib/shift-scan.ts";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";
import { registerToCsv } from "../../src/lib/report-export.ts";
import { applyEventToSummary } from "../../src/lib/daily-summary.ts";
import { describeShiftTimes } from "../../src/lib/shift-ui.ts";

// Breaks (shifts phase 8): a fixed unpaid break per shift, deducted only when the person was at work for MORE than a
// set time. Reports show time at work, the break and paid time as three figures. The minutes from the scans are
// NEVER changed. Off by default.
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const DAY = { name: "Day", type: "day", start: "08:00", end: "17:00", graceMinutes: 0 };

// ---------------------------------------------------------------- the shift
test("a shift without a break looks exactly as it did before", () => {
  const p = parseShiftInput(DAY);
  assert.equal(p.ok, true);
  assert.deepEqual(p.value, { name: "Day", type: "day", start: "08:00", end: "17:00", graceMinutes: 0, expectedMinutes: null });
  assert.equal(parseShiftInput({ ...DAY, unpaidBreakMinutes: 0 }).value.unpaidBreakMinutes, undefined, "a zero break is stored as none");
});

test("a break comes with the time after which it is taken off, defaulting to six hours", () => {
  assert.deepEqual(
    { b: parseShiftInput({ ...DAY, unpaidBreakMinutes: 60 }).value.unpaidBreakMinutes, a: parseShiftInput({ ...DAY, unpaidBreakMinutes: 60 }).value.deductAfterMinutes },
    { b: 60, a: 360 },
  );
  assert.equal(parseShiftInput({ ...DAY, unpaidBreakMinutes: 45, deductAfterMinutes: 300 }).value.deductAfterMinutes, 300);
});

test("a flexible shift can have a break too", () => {
  const p = parseShiftInput({ name: "Flex", type: "flex", expectedMinutes: 480, unpaidBreakMinutes: 30 });
  assert.equal(p.ok, true);
  assert.equal(p.value.unpaidBreakMinutes, 30);
});

test("impossible breaks are refused with a plain sentence", () => {
  for (const bad of [-1, 241, 30.5, "30", Number.NaN]) {
    const p = parseShiftInput({ ...DAY, unpaidBreakMinutes: bad });
    assert.equal(p.ok, false, `break ${String(bad)}`);
    assert.match(p.error, /unpaid break.*0 to 240/);
  }
  const after = parseShiftInput({ ...DAY, unpaidBreakMinutes: 30, deductAfterMinutes: 721 });
  assert.equal(after.ok, false);
  assert.match(after.error, /0 to 720/);
});

// ---------------------------------------------------------------- copied onto assignments, so editing a shift never rewrites history
test("the snapshot copied onto an assignment carries the break, only when there is one", () => {
  const withBreak = snapshotFromShiftDoc("s1", { ...DAY, unpaidBreakMinutes: 60, deductAfterMinutes: 360 });
  assert.equal(withBreak.unpaidBreakMinutes, 60);
  assert.equal(withBreak.deductAfterMinutes, 360);
  const without = snapshotFromShiftDoc("s2", { ...DAY, unpaidBreakMinutes: 0, deductAfterMinutes: 360 });
  assert.ok(!("unpaidBreakMinutes" in without), "no break fields at all");
});

const assignment = (shift) => ({ orgId: "o", dayKey: "2026-10-19", shift: { shiftId: "s1", name: "Day", type: "day", start: "08:00", end: "17:00", graceMinutes: 0, ...shift } });

test("an assignment keeps its break when read back", () => {
  const a = assignmentFromDoc(assignment({ unpaidBreakMinutes: 45, deductAfterMinutes: 300 }), "o");
  assert.equal(a.shift.unpaidBreakMinutes, 45);
  assert.equal(a.shift.deductAfterMinutes, 300);
});

test("a damaged break never costs anyone their assignment or blocks a scan: it just means no break", () => {
  for (const bad of ["lots", -5, 9999, 12.5, null]) {
    const a = assignmentFromDoc(assignment({ unpaidBreakMinutes: bad }), "o");
    assert.ok(a, `the assignment survives a break of ${String(bad)}`);
    assert.ok(!("unpaidBreakMinutes" in a.shift), "and has no break");
  }
  const a = assignmentFromDoc(assignment({ unpaidBreakMinutes: 30, deductAfterMinutes: "soon" }), "o");
  assert.equal(a.shift.deductAfterMinutes, 360, "a damaged limit falls back to six hours");
});

// ---------------------------------------------------------------- the setting
test("breaks are off by default, and the setting is read and changed like the others", () => {
  assert.equal(readShiftSettings({}).breaksEnabled, false);
  assert.equal(readShiftSettings({ breaksEnabled: true }).breaksEnabled, true);
  assert.equal(readShiftSettings({ breaksEnabled: "yes" }).breaksEnabled, false, "a wrong type is ignored");
  assert.deepEqual(parseSettingsInput({ breaksEnabled: true }), { ok: true, value: { breaksEnabled: true } });
  assert.equal(parseSettingsInput({ breaksEnabled: "yes" }).ok, false);
});

// ---------------------------------------------------------------- the day carries its break
test("the first scan of a shift day copies the break onto the day, and later scans leave it alone", () => {
  const identity = { orgId: "o", managerId: "m", employeeId: "e", employeeName: "E", department: "", dayKey: "2026-10-19", shiftId: "s1", shiftName: "Day", shiftStart: "08:00", shiftEnd: "17:00", shiftUnpaidBreakMinutes: 60, shiftDeductAfterMinutes: 360 };
  const first = applyEventToSummary(null, { type: "in", timestamp: "2026-10-19T08:00:00.000Z" }, identity, "2026-10-19T08:00:00.000Z");
  assert.equal(first.shiftUnpaidBreakMinutes, 60);
  const later = applyEventToSummary(first, { type: "out", timestamp: "2026-10-19T17:00:00.000Z" }, { ...identity, shiftUnpaidBreakMinutes: 999 }, "2026-10-19T17:00:00.000Z");
  assert.equal(later.shiftUnpaidBreakMinutes, 60, "a later scan never rewrites the day's break");
  assert.equal(later.minutesWorked, 540, "time at work is the scans' own minutes");
});

test("a day without a break has no break fields on its summary", () => {
  const identity = { orgId: "o", managerId: "m", employeeId: "e", employeeName: "E", department: "", dayKey: "2026-10-19" };
  const s = applyEventToSummary(null, { type: "in", timestamp: "2026-10-19T08:00:00.000Z" }, identity, "2026-10-19T08:00:00.000Z");
  assert.ok(!("shiftUnpaidBreakMinutes" in s));
});

// ---------------------------------------------------------------- the report
const days = ["2026-10-19", "2026-10-20", "2026-10-21"];
const summary = (dayKey, minutesWorked, extra = {}) => ({ employeeId: "e1", employeeName: "Efua", dayKey, firstIn: "2026-10-19T08:00:00.000Z", lastOut: "2026-10-19T17:00:00.000Z", minutesWorked, late: false, earlyDeparture: false, ...extra });
const register = (summaries, breaks) =>
  buildAttendanceRegister({
    days,
    people: [{ uid: "e1", displayName: "Efua" }],
    summaries,
    leaves: [],
    holidays: [],
    timezone: "UTC",
    generatedAt: "2026-10-22T00:00:00.000Z",
    from: days[0],
    to: days[2],
    breaks,
  });
const brk = (minutes, after = 360) => ({ shiftUnpaidBreakMinutes: minutes, shiftDeductAfterMinutes: after });

test("with breaks tracked, a report shows time at work, the break and paid time, and the three add up", () => {
  const r = register([summary(days[0], 540, brk(60)), summary(days[1], 480, brk(30))], true);
  const row = r.rows[0];
  assert.equal(r.breaksTracked, true);
  assert.deepEqual(
    row.days.slice(0, 2).map((d) => [d.minutesWorked, d.breakMinutes, d.paidMinutes]),
    [[540, 60, 480], [480, 30, 450]],
  );
  assert.deepEqual([row.totals.minutesWorked, row.totals.breakMinutes, row.totals.paidMinutes], [1020, 90, 930]);
  assert.equal(row.totals.breakMinutes + row.totals.paidMinutes, row.totals.minutesWorked, "break plus paid is exactly the time at work");
});

test("the break comes off only when the person was at work for MORE than the limit", () => {
  const at = (worked) => register([summary(days[0], worked, brk(60, 360))], true).rows[0].days[0];
  assert.equal(at(360).breakMinutes, 0, "exactly at the limit: no deduction");
  assert.equal(at(361).breakMinutes, 60, "one minute over: the break comes off");
  assert.equal(at(361).paidMinutes, 301);
  assert.equal(at(20).breakMinutes, 0, "a short day: nothing taken off");
});

test("a break is never more than the time worked, so paid time is never negative", () => {
  const d = register([summary(days[0], 30, brk(60, 0))], true).rows[0].days[0];
  assert.deepEqual([d.minutesWorked, d.breakMinutes, d.paidMinutes], [30, 30, 0]);
});

test("the recorded minutes are identical with breaks on or off", () => {
  const sums = [summary(days[0], 540, brk(60)), summary(days[1], 480, brk(30))];
  const on = register(sums, true).rows[0];
  const off = register(sums, false).rows[0];
  assert.deepEqual(on.days.map((d) => d.minutesWorked), off.days.map((d) => d.minutesWorked));
  assert.equal(on.totals.minutesWorked, off.totals.minutesWorked);
});

test("with breaks off the report has no break or paid figures at all (nothing changes for anyone who does not opt in)", () => {
  const r = register([summary(days[0], 540, brk(60))], false);
  assert.equal(r.breaksTracked, undefined);
  assert.ok(!("breakMinutes" in r.rows[0].days[0]) && !("paidMinutes" in r.rows[0].days[0]));
  assert.ok(!("breakMinutes" in r.rows[0].totals));
});

test("days with no shift break, and damaged break values, count as no break", () => {
  const r = register([summary(days[0], 480), summary(days[1], 480, { shiftUnpaidBreakMinutes: "lots" }), summary(days[2], 480, brk(-5))], true).rows[0];
  assert.deepEqual(r.days.map((d) => d.breakMinutes), [0, 0, 0]);
  assert.deepEqual(r.days.map((d) => d.paidMinutes), [480, 480, 480]);
});

test("days with no attendance add nothing to the break or paid totals", () => {
  const r = register([summary(days[0], 540, brk(60))], true).rows[0];
  assert.equal(r.totals.breakMinutes, 60);
  assert.equal(r.totals.paidMinutes, 480);
});

test("the CSV has Break and Paid columns only when breaks are tracked", () => {
  const sums = [summary(days[0], 540, brk(60))];
  const lines = (csv) => csv.split(/\r?\n/).filter(Boolean);
  const on = lines(registerToCsv(register(sums, true)));
  const off = lines(registerToCsv(register(sums, false)));
  assert.match(on[0], /Hours worked,Break hours,Paid hours$/);
  assert.match(off[0], /Hours worked$/, "the old header, exactly");
  const cells = (line) => line.split(",");
  assert.equal(cells(on[1]).length, cells(off[1]).length + 2, "two more cells in each row");
  assert.deepEqual(cells(on[1]).slice(0, -2), cells(off[1]), "every other cell is exactly what it was");
  const [worked, brokeHours, paid] = cells(on[1]).slice(-3).map(Number);
  assert.ok(Math.abs(worked - brokeHours - paid) < 0.011, "worked = break + paid (to the hundredth of an hour)");
  assert.ok(brokeHours > 0.99 && brokeHours < 1.01, "a one hour break");
});

// ---------------------------------------------------------------- the screens and the server
test("a shift's break is shown only while the organization tracks breaks", () => {
  const shift = { type: "day", start: "08:00", end: "17:00", expectedMinutes: null, graceMinutes: 0, unpaidBreakMinutes: 60 };
  assert.equal(describeShiftTimes(shift), "08:00 to 17:00");
  assert.equal(describeShiftTimes(shift, { breaks: true }), "08:00 to 17:00, 60 minutes unpaid break");
  assert.equal(describeShiftTimes({ ...shift, unpaidBreakMinutes: 0 }, { breaks: true }), "08:00 to 17:00");
});

test("the shifts API stores the break explicitly, so removing one really removes it (edits merge)", () => {
  const api = read("src/routes/api/shifts/index.ts");
  assert.equal((api.match(/unpaidBreakMinutes: parsed\.value\.unpaidBreakMinutes \?\? 0/g) ?? []).length, 3, "create, edit and the edit response");
  assert.ok(api.includes("breaksEnabled") && api.includes("readShiftSettings"), "the list says whether breaks are on");
});

test("the scan route copies the shift's break onto the day's summary", () => {
  const scan = read("src/routes/api/check-in/scan.ts");
  assert.ok(scan.includes("shiftUnpaidBreakMinutes: plan.shift.unpaidBreakMinutes"));
});

test("the register route turns breaks on only when shifts AND breaks are both on", () => {
  const route = read("src/routes/api/reports/register.ts");
  assert.equal((route.match(/breaks: shifts\.shiftsEnabled && shifts\.breaksEnabled/g) ?? []).length, 2, "both paths");
});

test("editing a shift while breaks are off never silently removes its break", () => {
  const form = read("src/components/shifts/ShiftFormDialog.tsx");
  assert.ok(form.includes("editing?.unpaidBreakMinutes ?? 0") && form.includes("editing?.deductAfterMinutes ?? 360"));
  assert.ok(form.includes("{breaksEnabled && ("), "the fields show only while breaks are on");
});

test("the admin can switch breaks on and off, and it says what that does", () => {
  const card = read("src/components/shifts/ShiftSettingsCard.tsx");
  assert.ok(card.includes('aria-label="Track breaks"') && card.includes("breaksEnabled: next"));
  assert.ok(card.replace(/\s+/g, " ").includes("are never changed"), "recorded times are untouched");
});

test("the register screen and the PDF show the extra columns only when tracked", () => {
  const screen = read("src/components/reports/AttendanceRegisterReport.tsx");
  assert.ok(screen.includes("data?.breaksTracked") && screen.includes('["Break", "Paid"]'));
  const exp = read("src/lib/report-export.ts");
  assert.ok(exp.includes("5 + (reg.breaksTracked ? 2 : 0)") && exp.includes('...(reg.breaksTracked ? ["Break", "Paid"] : [])'));
});
