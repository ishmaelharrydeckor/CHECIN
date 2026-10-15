import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  SHIFT_TYPE_LABELS,
  describeShiftTimes,
  expectedMinutesToHours,
  hoursToExpectedMinutes,
  windowFromInput,
} from "../../src/lib/shift-ui.ts";

const shift = (over = {}) => ({ type: "day", start: "09:00", end: "17:00", expectedMinutes: null, graceMinutes: 0, ...over });

test("every shift type has a plain label", () => {
  assert.deepEqual(SHIFT_TYPE_LABELS, { day: "Day", early: "Early", late: "Late", night: "Night", flex: "Flexible" });
});

test("times read naturally, including shifts that run past midnight", () => {
  assert.equal(describeShiftTimes(shift()), "09:00 to 17:00");
  assert.equal(describeShiftTimes(shift({ type: "night", start: "22:00", end: "06:00" })), "22:00 to 06:00 (overnight)");
  assert.equal(describeShiftTimes(shift({ start: "00:00", end: "08:00" })), "00:00 to 08:00");
});

test("flexible shifts show their hours", () => {
  const flex = (m, g = 0) => shift({ type: "flex", start: null, end: null, expectedMinutes: m, graceMinutes: g });
  assert.equal(describeShiftTimes(flex(480)), "Flexible, 8 hours");
  assert.equal(describeShiftTimes(flex(450)), "Flexible, 7.5 hours");
  assert.equal(describeShiftTimes(flex(60)), "Flexible, 1 hour");
  assert.equal(describeShiftTimes(flex(null)), "Flexible");
});

test("grace is added only when there is some, with the right singular", () => {
  assert.equal(describeShiftTimes(shift({ graceMinutes: 10 })), "09:00 to 17:00, 10 minutes grace");
  assert.equal(describeShiftTimes(shift({ graceMinutes: 1 })), "09:00 to 17:00, 1 minute grace");
  assert.equal(describeShiftTimes(shift({ graceMinutes: 0 })), "09:00 to 17:00");
  assert.equal(describeShiftTimes(shift({ graceMinutes: NaN })), "09:00 to 17:00");
});

test("a damaged shift never crashes the list", () => {
  assert.equal(describeShiftTimes(shift({ start: null, end: null })), "Times not set");
});

test("hours and minutes convert both ways", () => {
  assert.equal(hoursToExpectedMinutes(8), 480);
  assert.equal(hoursToExpectedMinutes(7.5), 450);
  assert.equal(hoursToExpectedMinutes(1), 60);
  assert.equal(hoursToExpectedMinutes(24), 1440);
  assert.equal(hoursToExpectedMinutes(0), null);
  assert.equal(hoursToExpectedMinutes(0.5), null);
  assert.equal(hoursToExpectedMinutes(25), null);
  assert.equal(hoursToExpectedMinutes(NaN), null);
  assert.equal(expectedMinutesToHours(480), "8");
  assert.equal(expectedMinutesToHours(450), "7.5");
  assert.equal(expectedMinutesToHours(495), "8.25");
  assert.equal(expectedMinutesToHours(null), "");
  assert.equal(expectedMinutesToHours(0), "");
});

test("the allowed time accepts whole minutes from 30 to 240 only", () => {
  assert.deepEqual(windowFromInput("30"), { ok: true, value: 30 });
  assert.deepEqual(windowFromInput(" 120 "), { ok: true, value: 120 });
  assert.deepEqual(windowFromInput("240"), { ok: true, value: 240 });
  for (const bad of ["29", "241", "0", "", "   ", "abc", "90.5", "-30", "1e2"]) {
    const r = windowFromInput(bad);
    assert.equal(r.ok, false, `"${bad}" must be refused`);
    assert.match(r.error, /30/, "the sentence names the limits");
  }
});

// ---------------------------------------------------------------- guards on the real files
const files = [
  "src/routes/_authenticated/shifts.tsx",
  "src/components/shifts/ShiftsList.tsx",
  "src/components/shifts/ShiftFormDialog.tsx",
  "src/components/shifts/ShiftSettingsCard.tsx",
  "src/components/shifts/ManagerShiftAccessCard.tsx",
  "src/components/shifts/shiftApi.ts",
];

test("the new screens exist, with capitalised component file names", () => {
  for (const f of files) assert.ok(existsSync(f), `${f} is missing`);
});

test("the form checks the shift with the same rules as the server before sending", () => {
  const src = readFileSync("src/components/shifts/ShiftFormDialog.tsx", "utf8");
  assert.ok(src.includes("parseShiftInput"), "the form must call parseShiftInput");
  const checkAt = src.indexOf("parseShiftInput(");
  const sendAt = src.search(/authedFetch</);
  assert.ok(checkAt > 0 && sendAt > 0, "found both the check and the send");
  assert.ok(checkAt < sendAt, "validate first, then send");
});

test("no screen file uses browser storage, console output, inline styles or untyped data", () => {
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.ok(!src.includes("localStorage"), `${f}: localStorage`);
    assert.ok(!/console\.log/.test(src), `${f}: console.log`);
    assert.ok(!/\sstyle=\{\{/.test(src), `${f}: inline style`);
    assert.ok(!/:\s*any\b|as any\b/.test(src), `${f}: any`);
  }
});

test("the menu keeps its entries and gains Shifts and Departments", () => {
  const shell = readFileSync("src/components/AppShell.tsx", "utf8");
  for (const label of ["Roster", "History", "Reports", "Notices", "Leave", "Holidays", "Settings", "Shifts", "Departments"]) {
    assert.ok(shell.includes(`label: "${label}"`), `menu entry ${label}`);
  }
  assert.ok(/MANAGER_ONLY_PATHS = \[[^\]]*"\/shifts"/.test(shell), "employees are turned away from /shifts");
  assert.ok(shell.includes('label: "My Shifts"'), "employees get a My Shifts entry");
});

test("the permission is read from the login like the tablet permission", () => {
  const claims = readFileSync("src/lib/auth-claims.ts", "utf8");
  assert.ok(claims.includes("tokenResult.claims.shiftAdmin === true"));
  assert.ok(claims.includes("export function canManageShiftsRole"));
});
