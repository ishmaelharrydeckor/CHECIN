import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overtimeEntryId } from "../../src/lib/overtime.ts";
import {
  LOCK_READ_BUDGET,
  buildPeriodLine,
  buildPeriodLines,
  lockCheck,
  lockPeriod,
  lockSizeError,
  maxLockPeople,
  newPayPeriodState,
  periodLineId,
  reopenPeriod,
} from "../../src/lib/pay-period-lock.ts";

const PERIOD = { startDay: "2026-11-02", endDay: "2026-11-08", days: 7 };

const d = (dayKey, over = {}) => ({
  dayKey, status: "present", workedMinutes: 480, breakMinutes: 0, paidMinutes: 480, expectedMinutes: 480, late: false, noCheckOut: false, ...over,
});
const person = (employeeId, days, over = {}) => ({ employeeId, name: employeeId.toUpperCase(), department: "Ops", payrollCode: null, days, ...over });
const ot = (employeeId, dayKey, minutes, status = "pending") => ({ id: overtimeEntryId(employeeId, dayKey), employeeId, dayKey, minutes, status, managerId: "m1" });

// ---- one person's frozen totals ------------------------------------------------------------------------------------

test("a line adds the person's days, converted from minutes only at the end", () => {
  const line = buildPeriodLine(
    person("e1", [
      d("2026-11-02", { workedMinutes: 540, breakMinutes: 60, paidMinutes: 480 }),
      d("2026-11-03", { workedMinutes: 600, breakMinutes: 60, paidMinutes: 540, late: true }),
      d("2026-11-04", { status: "absent", workedMinutes: 0, paidMinutes: 0 }),
      d("2026-11-05", { status: "leave", workedMinutes: 0, paidMinutes: 0, expectedMinutes: 0 }),
      d("2026-11-06", { status: "holiday", workedMinutes: 0, paidMinutes: 0, expectedMinutes: 0 }),
      d("2026-11-07", { status: "wfh", workedMinutes: 0, paidMinutes: 0, expectedMinutes: 0 }),
      d("2026-11-08", { status: "off", workedMinutes: 0, paidMinutes: 0, expectedMinutes: 0 }),
    ], { payrollCode: "P-100" }),
    [ot("e1", "2026-11-03", 60, "approved")],
    PERIOD,
  );
  assert.equal(line.payrollCode, "P-100");
  assert.equal(line.daysWorked, 2);
  assert.equal(line.workedMinutes, 1140);
  assert.equal(line.breakMinutes, 120);
  assert.equal(line.paidMinutes, 1020);
  assert.equal(line.expectedMinutes, 1440, "three days were owed: two worked and one absent");
  assert.equal(line.approvedOvertimeMinutes, 60);
  assert.equal(line.unapprovedExtraMinutes, 0);
  assert.deepEqual([line.leaveDays, line.holidayDays, line.wfhDays, line.absentDays, line.lateDays, line.noCheckOutDays], [1, 1, 1, 1, 1, 0]);
  assert.equal(line.days.length, 7);
});

test("work from home carries a day count and no hours", () => {
  const line = buildPeriodLine(person("e1", [d("2026-11-02", { status: "wfh", workedMinutes: 0, paidMinutes: 0, expectedMinutes: 0 })]), [], PERIOD);
  assert.equal(line.wfhDays, 1);
  assert.equal(line.workedMinutes, 0);
});

test("pending and declined extra time is reported apart and is not overtime", () => {
  const line = buildPeriodLine(person("e1", [d("2026-11-02")]), [ot("e1", "2026-11-02", 30, "pending"), ot("e1", "2026-11-03", 45, "declined"), ot("e1", "2026-11-04", 15, "approved")], PERIOD);
  assert.equal(line.approvedOvertimeMinutes, 15);
  assert.equal(line.unapprovedExtraMinutes, 75);
});

test("days and overtime outside the period are ignored, and a day counts once", () => {
  const line = buildPeriodLine(
    person("e1", [d("2026-11-01"), d("2026-11-02"), d("2026-11-02"), d("2026-11-09")]),
    [ot("e1", "2026-11-01", 100, "approved"), ot("e1", "2026-11-09", 100, "approved"), ot("e2", "2026-11-02", 100, "approved")],
    PERIOD,
  );
  assert.equal(line.daysWorked, 1);
  assert.equal(line.workedMinutes, 480);
  assert.equal(line.approvedOvertimeMinutes, 0, "another person's and other days' overtime is not added");
});

test("a person with no expected time on any day has none, rather than a made-up zero target", () => {
  const line = buildPeriodLine(person("e1", [d("2026-11-02", { expectedMinutes: null })]), [], PERIOD);
  assert.equal(line.expectedMinutes, 0);
});

test("damaged numbers count as zero and never negative", () => {
  const line = buildPeriodLine(person("e1", [d("2026-11-02", { workedMinutes: -5, paidMinutes: NaN, breakMinutes: "x" })]), [], PERIOD);
  assert.deepEqual([line.workedMinutes, line.paidMinutes, line.breakMinutes], [0, 0, 0]);
});

test("the daily lines are kept, in date order, at most 31", () => {
  const days = Array.from({ length: 31 }, (_, i) => d(`2026-12-${String(31 - i).padStart(2, "0")}`));
  const line = buildPeriodLine(person("e1", days), [], { startDay: "2026-12-01", endDay: "2026-12-31", days: 31 });
  assert.equal(line.days.length, 31);
  assert.equal(line.days[0].dayKey, "2026-12-01");
  assert.equal(line.days.at(-1).dayKey, "2026-12-31");
});

test("lines come out sorted by name, and are plain data that can be stored", () => {
  const lines = buildPeriodLines([person("e2", [d("2026-11-02")], { name: "Zed" }), person("e1", [d("2026-11-02")], { name: "Amy" })], [], PERIOD);
  assert.deepEqual(lines.map((l) => l.name), ["Amy", "Zed"]);
  assert.deepEqual(JSON.parse(JSON.stringify(lines)), lines);
});

test("building the same period twice gives the same lines", () => {
  const people = [person("e1", [d("2026-11-02"), d("2026-11-03", { late: true })])];
  const entries = [ot("e1", "2026-11-03", 40, "approved")];
  assert.deepEqual(buildPeriodLines(people, entries, PERIOD), buildPeriodLines(people, entries, PERIOD));
});

test("a stored line has an id from the period, the person and the version", () => {
  assert.equal(periodLineId("orgA_2026-11-02", "e1", 2), "orgA_2026-11-02_e1_2");
  assert.throws(() => periodLineId("orgA_2026-11-02", "", 1), RangeError);
  assert.throws(() => periodLineId("orgA_2026-11-02", "e1", 0), RangeError);
});

// ---- what blocks a lock -----------------------------------------------------------------------------------------------

const clean = buildPeriodLines([person("e1", [d("2026-11-02")]), person("e2", [d("2026-11-02")])], [], PERIOD);

test("a clean period is not blocked", () => {
  assert.deepEqual(lockCheck(clean, []), { missingCheckOutPeople: 0, missingCheckOutDays: 0, pendingOvertimeEntries: 0, pendingOvertimePeople: 0, blocked: false });
});

test("a missing check-out or a pending overtime day blocks the lock, and is counted", () => {
  const lines = buildPeriodLines([person("e1", [d("2026-11-02", { noCheckOut: true }), d("2026-11-03", { noCheckOut: true })]), person("e2", [d("2026-11-02")])], [], PERIOD);
  const c = lockCheck(lines, [ot("e2", "2026-11-02", 30), ot("e2", "2026-11-03", 30), ot("e1", "2026-11-04", 20, "approved"), ot("e1", "2026-11-05", 20, "declined")]);
  assert.deepEqual(c, { missingCheckOutPeople: 1, missingCheckOutDays: 2, pendingOvertimeEntries: 2, pendingOvertimePeople: 1, blocked: true });
});

test("only the org admin may lock; a block needs 'lock anyway', which records what was overridden", () => {
  const blocked = lockCheck(buildPeriodLines([person("e1", [d("2026-11-02", { noCheckOut: true })])], [], PERIOD), []);
  const state = newPayPeriodState("orgA", PERIOD);

  const asManager = lockPeriod(state, clean, lockCheck(clean, []), { role: "manager", uid: "m1" }, "2026-11-09T08:00:00.000Z", { lockAnyway: false });
  assert.equal(asManager.ok, false);
  assert.match(asManager.error, /admin/i);

  const refused = lockPeriod(state, clean, blocked, { role: "org_admin", uid: "a1" }, "2026-11-09T08:00:00.000Z", { lockAnyway: false });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /1 day/);

  const overridden = lockPeriod(state, clean, blocked, { role: "org_admin", uid: "a1" }, "2026-11-09T08:00:00.000Z", { lockAnyway: true });
  assert.equal(overridden.ok, true);
  assert.deepEqual(overridden.state.lockedOverride, { missingCheckOutDays: 1, pendingOvertimeEntries: 0 });
});

// ---- the period's life: open, locked, reopened --------------------------------------------------------------------------

const admin = { role: "org_admin", uid: "a1" };
const at = "2026-11-09T08:00:00.000Z";

test("a new period is open at version 1", () => {
  assert.deepEqual(newPayPeriodState("orgA", PERIOD), {
    id: "orgA_2026-11-02", orgId: "orgA", startDay: "2026-11-02", endDay: "2026-11-08", status: "open", version: 1, lockedAt: null, lockedBy: null, lockedOverride: null, reopenLog: [],
  });
});

test("locking freezes it: it records who and when, and the same version stays", () => {
  const r = lockPeriod(newPayPeriodState("orgA", PERIOD), clean, lockCheck(clean, []), admin, at, { lockAnyway: false });
  assert.equal(r.ok, true);
  assert.deepEqual([r.state.status, r.state.version, r.state.lockedBy, r.state.lockedAt, r.state.lockedOverride], ["locked", 1, "a1", at, null]);
  assert.equal(r.lineIds.length, 2);
  assert.deepEqual(r.lineIds, ["orgA_2026-11-02_e1_1", "orgA_2026-11-02_e2_1"]);
});

test("locking twice, or a retry, changes nothing the second time", () => {
  const first = lockPeriod(newPayPeriodState("orgA", PERIOD), clean, lockCheck(clean, []), admin, at, { lockAnyway: false });
  const second = lockPeriod(first.state, clean, lockCheck(clean, []), admin, "2026-11-09T09:00:00.000Z", { lockAnyway: false });
  assert.equal(second.ok, false);
  assert.match(second.error, /already locked/i);
  assert.equal(first.state.lockedAt, at, "the first lock time stands");
});

test("reopening needs a written reason, raises the version, and is logged", () => {
  const locked = lockPeriod(newPayPeriodState("orgA", PERIOD), clean, lockCheck(clean, []), admin, at, { lockAnyway: false }).state;
  const r = reopenPeriod(locked, admin, "2026-11-10T08:00:00.000Z", "A late sick note changed Ama's leave");
  assert.equal(r.ok, true);
  assert.deepEqual([r.state.status, r.state.version, r.state.lockedAt, r.state.lockedBy], ["open", 2, null, null]);
  assert.deepEqual(r.state.reopenLog, [{ fromVersion: 1, reason: "A late sick note changed Ama's leave", by: "a1", at: "2026-11-10T08:00:00.000Z" }]);
  assert.equal(locked.status, "locked", "the original is untouched");
  const relock = lockPeriod(r.state, clean, lockCheck(clean, []), admin, "2026-11-11T08:00:00.000Z", { lockAnyway: false });
  assert.equal(relock.state.version, 2);
  assert.deepEqual(relock.lineIds, ["orgA_2026-11-02_e1_2", "orgA_2026-11-02_e2_2"], "the frozen lines of version 1 are kept, version 2 has its own");
});

test("reopening is refused when it should be, with a sentence", () => {
  const locked = lockPeriod(newPayPeriodState("orgA", PERIOD), clean, lockCheck(clean, []), admin, at, { lockAnyway: false }).state;
  const open = newPayPeriodState("orgA", PERIOD);
  const cases = [
    reopenPeriod(open, admin, at, "Because the numbers changed"),
    reopenPeriod(locked, { role: "manager", uid: "m1" }, at, "Because the numbers changed"),
    reopenPeriod(locked, admin, at, ""),
    reopenPeriod(locked, admin, at, "   "),
    reopenPeriod(locked, admin, at, "no"),
    reopenPeriod(locked, admin, at, "x".repeat(501)),
    reopenPeriod(locked, admin, "", "Because the numbers changed"),
  ];
  for (const r of cases) {
    assert.equal(r.ok, false);
    assert.ok(r.error.length > 15);
  }
});

// ---- size ----------------------------------------------------------------------------------------------------------------

test("a lock reads people times days, so a big organization gets a clear limit instead of a hang", () => {
  assert.equal(maxLockPeople(31), Math.floor(LOCK_READ_BUDGET / 31));
  assert.equal(maxLockPeople(7), Math.floor(LOCK_READ_BUDGET / 7));
  assert.equal(lockSizeError(250, 31), null, "250 people for 31 days is 7,750 reads");
  assert.match(lockSizeError(1000, 31), /1000 people/);
  assert.match(lockSizeError(1000, 31), /contact support/i);
  assert.equal(lockSizeError(0, 7), null);
});

test("the module is pure: no database, no clock, no device time, no alias imports", () => {
  const src = readFileSync("src/lib/pay-period-lock.ts", "utf8");
  assert.doesNotMatch(src, /firebase|firestore/i);
  assert.doesNotMatch(src, /Date\.now|new Date\(|getHours|toLocale|process\./);
  assert.doesNotMatch(src, /from\s+["']@\//);
});
