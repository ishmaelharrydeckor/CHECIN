import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  countsPerDay,
  describeAllowedTime,
  describeAssignment,
  describeRefusal,
  formatDayHeader,
  formatDayMonth,
  formatWeekRange,
  indexAssignments,
  mondayOf,
  parseRefusedQuery,
  shiftWeek,
  weekDays,
  weekdaysLabel,
} from "../../src/lib/shift-rota.ts";

const night = { shiftId: "n", name: "Night", type: "night", start: "22:00", end: "06:00", graceMinutes: 10, expectedMinutes: null };
const flex = { shiftId: "f", name: "Flex", type: "flex", start: null, end: null, graceMinutes: 0, expectedMinutes: 480 };

test("weeks run Monday to Sunday and move by whole weeks", () => {
  assert.equal(mondayOf("2026-10-12"), "2026-10-12"); // a Monday
  assert.equal(mondayOf("2026-10-14"), "2026-10-12");
  assert.equal(mondayOf("2026-10-18"), "2026-10-12"); // Sunday
  assert.equal(mondayOf("2026-10-19"), "2026-10-19");
  assert.deepEqual(weekDays("2026-10-12"), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.equal(shiftWeek("2026-10-12", 1), "2026-10-19");
  assert.equal(shiftWeek("2026-10-12", -1), "2026-10-05");
});

test("a week across a month and a year end", () => {
  assert.equal(mondayOf("2026-11-01"), "2026-10-26"); // a Sunday
  assert.deepEqual(weekDays("2026-12-28").slice(-1), ["2027-01-03"]);
  assert.equal(formatWeekRange("2026-12-28"), "28 Dec to 3 Jan 2027");
});

test("day labels", () => {
  assert.equal(formatDayHeader("2026-10-12"), "Mon 12");
  assert.equal(formatDayHeader("2026-10-18"), "Sun 18");
  assert.equal(formatDayMonth("2026-03-05"), "5 Mar");
  assert.equal(formatWeekRange("2026-10-12"), "12 Oct to 18 Oct 2026");
});

test("assignments are looked up person then day, and bad rows are skipped", () => {
  const idx = indexAssignments([
    { employeeId: "a", dayKey: "2026-10-12", shift: night },
    { employeeId: "a", dayKey: "2026-10-13", shift: flex },
    { employeeId: "b", dayKey: "2026-10-12", shift: night },
    null,
    { employeeId: 5, dayKey: "2026-10-12", shift: night },
    { employeeId: "c", dayKey: "2026-10-12" },
  ]);
  assert.equal(idx.get("a").get("2026-10-12").name, "Night");
  assert.equal(idx.get("a").size, 2);
  assert.equal(idx.has("c"), false);
  assert.deepEqual(countsPerDay(idx, ["2026-10-12", "2026-10-13", "2026-10-14"], ["a", "b", "zzz"]), [2, 1, 0]);
});

test("a day's shift reads plainly", () => {
  assert.equal(describeAssignment(night), "Night, 22:00 to 06:00");
  assert.equal(describeAssignment(flex), "Flex, flexible");
});

test("the allowed-time sentence", () => {
  assert.equal(describeAllowedTime(120), "You can check in from 2 hours before your shift starts until 2 hours after it ends.");
  assert.equal(describeAllowedTime(60), "You can check in from 1 hour before your shift starts until 1 hour after it ends.");
  assert.equal(describeAllowedTime(90), "You can check in from 90 minutes before your shift starts until 90 minutes after it ends.");
});

test("weekday summaries", () => {
  assert.equal(weekdaysLabel([0, 1, 2, 3, 4]), "Monday to Friday");
  assert.equal(weekdaysLabel([4, 0, 2, 0]), "Mon, Wed, Fri");
  assert.equal(weekdaysLabel([0, 1, 2, 3, 4, 5, 6]), "every day");
  assert.equal(weekdaysLabel([]), "no days");
  assert.equal(weekdaysLabel([9, -1]), "no days");
});

test("refused-scan sentences use the organization's time zone", () => {
  const base = { id: "1", employeeId: "e", employeeName: "Kofi", shiftName: "Night", shiftStart: "22:00", shiftEnd: "06:00" };
  const early = describeRefusal({ ...base, at: "2026-10-12T15:02:00.000Z", reason: "too_early", opensAt: "2026-10-12T20:00:00.000Z", closesAt: "2026-10-13T08:00:00.000Z" }, "Africa/Accra");
  assert.equal(early, "Tried to check in at 15:02, before Night. Check-in opens at 20:00.");
  const late = describeRefusal({ ...base, at: "2026-10-13T10:00:00.000Z", reason: "too_late", opensAt: "2026-10-12T20:00:00.000Z", closesAt: "2026-10-13T08:00:00.000Z" }, "Africa/Accra");
  assert.equal(late, "Tried to check in at 10:00, after Night. Check-in closed at 08:00.");
  const lagos = describeRefusal({ ...base, at: "2026-10-12T15:02:00.000Z", reason: "too_early", opensAt: "2026-10-12T20:00:00.000Z", closesAt: "x" }, "Africa/Lagos");
  assert.match(lagos, /16:02/);
  assert.match(describeRefusal({ ...base, shiftName: "", at: "2026-10-12T15:02:00.000Z", reason: "other", opensAt: "", closesAt: "" }, "UTC"), /outside their shift/);
});

test("the refused-scans page parameters are checked", () => {
  assert.deepEqual(parseRefusedQuery(null, null), { ok: true, pageSize: 50, cursor: null });
  assert.deepEqual(parseRefusedQuery("20", "2026-10-12T15:02:00.000Z"), { ok: true, pageSize: 20, cursor: "2026-10-12T15:02:00.000Z" });
  assert.equal(parseRefusedQuery("5000", null).pageSize, 100);
  for (const bad of ["0", "-3", "abc", "1.5"]) assert.equal(parseRefusedQuery(bad, null).ok, false, bad);
  for (const bad of ["not a date", "x".repeat(60)]) assert.equal(parseRefusedQuery(null, bad).ok, false, bad);
});

// ---------------------------------------------------------------- guards on the real files
test("the refused-scans route reads only the caller's own organization (and a manager's own team), bounded and ordered", () => {
  const p = "src/routes/api/shifts/refused-scans.ts";
  assert.ok(existsSync(p), "the route exists");
  const src = readFileSync(p, "utf8");
  assert.ok(src.includes("verifyCallerToken"));
  assert.ok(src.includes('.where("orgId", "==", orgId)'));
  assert.ok(src.includes('.where("managerId", "==", caller.uid)'));
  assert.ok(src.includes('.orderBy("at", "desc")'));
  assert.ok(src.includes(".limit(pageSize + 1)"));
  assert.ok(!/body\??\.(orgId|role|managerId)/.test(src), "nothing about the caller comes from the request");
  assert.ok(src.includes('caller.role !== "org_admin" && caller.role !== "manager"'), "employees are refused");
});

test("the settings answer carries the organization's today, so the rota never trusts the device clock", () => {
  const src = readFileSync("src/routes/api/shifts/settings.ts", "utf8");
  assert.ok(src.includes("today"), "settings GET returns today");
});

test("the new screens exist and follow the file-name rule", () => {
  for (const f of [
    "src/components/shifts/RotaTab.tsx",
    "src/components/shifts/AssignShiftsDialog.tsx",
    "src/components/shifts/RefusedScansTab.tsx",
    "src/routes/_authenticated/my-shifts.tsx",
  ]) assert.ok(existsSync(f), `${f} is missing`);
});

test("the rota only offers editing to people who may manage shifts", () => {
  const src = readFileSync("src/components/shifts/RotaTab.tsx", "utf8");
  assert.ok(src.includes("canAssign"), "the rota takes a canAssign flag");
  const page = readFileSync("src/routes/_authenticated/shifts.tsx", "utf8");
  assert.ok(page.includes("canAssign={canManageShifts}"), "the page passes the real permission");
});

test("the assign form checks the request with the server's rules before sending", () => {
  const src = readFileSync("src/components/shifts/AssignShiftsDialog.tsx", "utf8");
  assert.ok(src.includes("parseAssignRequest"));
  const checkAt = src.indexOf("parseAssignRequest(");
  const sendAt = src.search(/authedFetch</);
  assert.ok(checkAt > 0 && sendAt > checkAt, "validate first, then send");
});

test("no new screen file uses browser storage, console output, inline styles or untyped data", () => {
  for (const f of [
    "src/components/shifts/RotaTab.tsx",
    "src/components/shifts/AssignShiftsDialog.tsx",
    "src/components/shifts/RefusedScansTab.tsx",
    "src/routes/_authenticated/my-shifts.tsx",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!src.includes("localStorage"), `${f}: localStorage`);
    assert.ok(!/console\.log/.test(src), `${f}: console.log`);
    assert.ok(!/\sstyle=\{\{/.test(src), `${f}: inline style`);
    assert.ok(!/:\s*any\b|as any\b/.test(src), `${f}: any`);
  }
});
