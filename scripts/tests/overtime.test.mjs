import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_OVERTIME_SETTINGS,
  approveAllPending,
  canDecideOvertime,
  decideOvertime,
  expectedMinutesForDay,
  generateOvertime,
  overtimeEntryId,
  overtimeMinutes,
  overtimeTotals,
  parseOvertimeSettings,
  reconcileOvertime,
} from "../../src/lib/overtime.ts";

const S = DEFAULT_OVERTIME_SETTINGS; // enabled false, 8 hours, 15 minutes, Monday to Friday
const on = { ...S, enabled: true };
const DAY_SHIFT = { start: "08:00", end: "17:00", unpaidBreakMinutes: 60 };
const MON = "2026-11-02";
const SAT = "2026-11-07";

// ---- settings -----------------------------------------------------------------------------------------------

test("the defaults are the approved ones: off, an 8-hour day, a 15-minute threshold, Monday to Friday", () => {
  assert.deepEqual(S, { enabled: false, standardDayMinutes: 480, thresholdMinutes: 15, workDays: [0, 1, 2, 3, 4] });
});

test("good settings are accepted, with missing parts filled from the defaults", () => {
  assert.deepEqual(parseOvertimeSettings({}), { ok: true, value: S });
  assert.deepEqual(parseOvertimeSettings({ enabled: true, standardDayMinutes: 450, thresholdMinutes: 0, workDays: [0, 2, 4] }), {
    ok: true,
    value: { enabled: true, standardDayMinutes: 450, thresholdMinutes: 0, workDays: [0, 2, 4] },
  });
  assert.deepEqual(parseOvertimeSettings({ workDays: [4, 0, 4, 1] }).value.workDays, [0, 1, 4], "sorted, no repeats");
});

test("bad settings are refused in plain words", () => {
  for (const bad of [null, 7, "on", [], { enabled: "yes" }, { standardDayMinutes: 0 }, { standardDayMinutes: 29 }, { standardDayMinutes: 961 }, { standardDayMinutes: 480.5 }, { standardDayMinutes: "480" }, { thresholdMinutes: -1 }, { thresholdMinutes: 121 }, { thresholdMinutes: 1.5 }, { workDays: [] }, { workDays: [7] }, { workDays: [-1] }, { workDays: ["0"] }, { workDays: "mon" }]) {
    const r = parseOvertimeSettings(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.error.length > 20 && !/undefined|\[object|NaN/.test(r.error), JSON.stringify(bad));
  }
});

// ---- what a day expects ----------------------------------------------------------------------------------------

test("a shift expects its own length, less its break only when breaks are tracked", () => {
  assert.equal(expectedMinutesForDay({ dayKey: MON, status: "present", shift: DAY_SHIFT, settings: on, breaksTracked: true }), 480);
  assert.equal(expectedMinutesForDay({ dayKey: MON, status: "present", shift: DAY_SHIFT, settings: on, breaksTracked: false }), 540);
});

test("a night shift is counted across midnight", () => {
  const night = { start: "22:00", end: "06:00" };
  assert.equal(expectedMinutesForDay({ dayKey: MON, status: "present", shift: night, settings: on, breaksTracked: false }), 480);
});

test("with no shift the standard day applies on a working weekday only", () => {
  assert.equal(expectedMinutesForDay({ dayKey: MON, status: "present", shift: null, settings: on, breaksTracked: false }), 480);
  assert.equal(expectedMinutesForDay({ dayKey: MON, status: "absent", shift: null, settings: { ...on, standardDayMinutes: 450 }, breaksTracked: false }), 450);
  assert.equal(expectedMinutesForDay({ dayKey: SAT, status: "present", shift: null, settings: on, breaksTracked: false }), 0, "a weekend expects nothing");
  assert.equal(expectedMinutesForDay({ dayKey: SAT, status: "present", shift: null, settings: { ...on, workDays: [0, 1, 2, 3, 4, 5] }, breaksTracked: false }), 480, "unless Saturday is a work day");
});

test("a damaged shift is treated as no shift, never as a guess", () => {
  for (const shift of [{ start: "8am", end: "5pm" }, { start: null, end: null }, { start: "08:00", end: "08:00" }, {}]) {
    assert.equal(expectedMinutesForDay({ dayKey: MON, status: "present", shift, settings: on, breaksTracked: false }), 480, JSON.stringify(shift));
  }
});

test("days that owe no hours expect nothing, whatever the shift", () => {
  for (const status of ["leave", "holiday", "off", "wfh", "other", "expected"]) {
    assert.equal(expectedMinutesForDay({ dayKey: MON, status, shift: DAY_SHIFT, settings: on, breaksTracked: false }), 0, status);
  }
});

// ---- overtime for one day: the threshold edge -------------------------------------------------------------------

test("extra time under the threshold counts as zero; at or over it, the whole extra counts", () => {
  const ot = (paid) => overtimeMinutes({ paidMinutes: paid, expectedMinutes: 480, thresholdMinutes: 15 });
  assert.equal(ot(480), 0, "exactly on time");
  assert.equal(ot(481), 0, "one minute over");
  assert.equal(ot(494), 0, "14 minutes over");
  assert.equal(ot(495), 15, "exactly the threshold counts, and the whole 15");
  assert.equal(ot(496), 16, "the whole extra, not just the part over the threshold");
  assert.equal(ot(600), 120);
  assert.equal(ot(479), 0, "short is never negative overtime");
  assert.equal(ot(0), 0, "a missing check-out has no paid time and so no overtime");
});

test("a threshold of zero counts every minute over", () => {
  assert.equal(overtimeMinutes({ paidMinutes: 481, expectedMinutes: 480, thresholdMinutes: 0 }), 1);
  assert.equal(overtimeMinutes({ paidMinutes: 480, expectedMinutes: 480, thresholdMinutes: 0 }), 0);
});

test("on a day that expects nothing, all the time worked is extra (once past the threshold)", () => {
  assert.equal(overtimeMinutes({ paidMinutes: 180, expectedMinutes: 0, thresholdMinutes: 15 }), 180);
  assert.equal(overtimeMinutes({ paidMinutes: 10, expectedMinutes: 0, thresholdMinutes: 15 }), 0);
});

test("damaged numbers never invent overtime, and nothing is rounded", () => {
  for (const bad of [NaN, -5, Infinity, "600", null, undefined]) {
    assert.equal(overtimeMinutes({ paidMinutes: bad, expectedMinutes: 480, thresholdMinutes: 15 }), 0, String(bad));
  }
  assert.equal(overtimeMinutes({ paidMinutes: 500.9, expectedMinutes: 480, thresholdMinutes: 15 }), 20, "whole minutes only (500.9 is 500)");
  assert.equal(overtimeMinutes({ paidMinutes: 10_000_000, expectedMinutes: 480, thresholdMinutes: 15 }), 10_000_000 - 480);
});

// ---- the entries for a range of days -----------------------------------------------------------------------------

const day = (employeeId, dayKey, paidMinutes, over = {}) => ({
  employeeId, dayKey, managerId: "m1", status: "present", paidMinutes, shift: { start: "08:00", end: "16:00" }, ...over,
}); // an 8-hour shift

test("nothing is generated while overtime is off", () => {
  assert.deepEqual(generateOvertime([day("e1", MON, 600)], S, false), []);
});

test("only days over the threshold become pending entries, with a stable id and the day's manager", () => {
  const entries = generateOvertime([day("e1", MON, 600), day("e1", "2026-11-03", 490), day("e2", MON, 495), day("e3", MON, 480, { status: "absent" })], on, false);
  assert.deepEqual(entries.map((e) => [e.id, e.minutes, e.status, e.managerId]), [
    [`e1_${MON}`, 120, "pending", "m1"],
    [`e2_${MON}`, 15, "pending", "m1"],
  ]);
  assert.equal(overtimeEntryId("e1", MON), `e1_${MON}`);
});

test("a missing check-out, a half day and a holiday never make overtime", () => {
  const entries = generateOvertime([day("e1", MON, 0), day("e2", MON, 240), day("e3", MON, 0, { status: "holiday" })], on, false);
  assert.deepEqual(entries, []);
});

test("an assigned night shift that ran long is overtime on the day it started", () => {
  const e = generateOvertime([day("e1", MON, 540, { shift: { start: "22:00", end: "06:00" } })], on, false);
  assert.equal(e[0].dayKey, MON);
  assert.equal(e[0].minutes, 60);
});

test("entries come out in a fixed order, so a re-run gives the same list", () => {
  const input = [day("e2", "2026-11-03", 600), day("e1", MON, 600), day("e1", "2026-11-03", 600), day("e2", MON, 600)];
  const a = generateOvertime(input, on, false).map((e) => e.id);
  const b = generateOvertime([...input].reverse(), on, false).map((e) => e.id);
  assert.deepEqual(a, b);
  assert.deepEqual(a, [`e1_${MON}`, "e1_2026-11-03", `e2_${MON}`, "e2_2026-11-03"]);
});

test("the day's own manager is kept, so moving a person later does not reroute old days", () => {
  const e = generateOvertime([day("e1", MON, 600, { managerId: "oldManager" })], on, false);
  assert.equal(e[0].managerId, "oldManager");
});

// ---- generating again never undoes a decision ------------------------------------------------------------------------

const entry = (employeeId, dayKey, minutes, status = "pending", over = {}) => ({ id: overtimeEntryId(employeeId, dayKey), employeeId, dayKey, minutes, status, managerId: "m1", ...over });

test("reconciling: new days are written, unchanged ones are left alone", () => {
  const r = reconcileOvertime([entry("e1", MON, 120)], [entry("e1", MON, 120), entry("e2", MON, 30)]);
  assert.deepEqual(r.write.map((e) => e.id), [`e2_${MON}`]);
  assert.deepEqual(r.remove, []);
  assert.deepEqual(r.stale, []);
});

test("reconciling: a pending entry follows the new figure, or goes when it is no longer overtime", () => {
  const changed = reconcileOvertime([entry("e1", MON, 120)], [entry("e1", MON, 90)]);
  assert.deepEqual(changed.write.map((e) => [e.id, e.minutes]), [[`e1_${MON}`, 90]]);
  const gone = reconcileOvertime([entry("e1", MON, 120)], []);
  assert.deepEqual(gone.remove, [`e1_${MON}`]);
});

test("reconciling: a decided entry is never overwritten or removed, only reported as out of date", () => {
  const approved = entry("e1", MON, 120, "approved", { decidedBy: "m1", decidedAt: "2026-11-03T09:00:00.000Z" });
  const declined = entry("e2", MON, 60, "declined", { decidedBy: "m1", decidedAt: "2026-11-03T09:00:00.000Z" });
  const r = reconcileOvertime([approved, declined], [entry("e1", MON, 150), entry("e3", MON, 45)]);
  assert.deepEqual(r.write.map((e) => e.id), [`e3_${MON}`], "only the new day is written");
  assert.deepEqual(r.remove, []);
  assert.deepEqual(r.stale, [
    { id: `e1_${MON}`, decidedMinutes: 120, newMinutes: 150 },
    { id: `e2_${MON}`, decidedMinutes: 60, newMinutes: 0 },
  ]);
});

test("reconciling is repeatable: applying the result and running again changes nothing", () => {
  const existing = [entry("e1", MON, 120), entry("e2", MON, 60, "approved", { decidedBy: "m1", decidedAt: "x" })];
  const generated = [entry("e1", MON, 100), entry("e3", MON, 30)];
  const first = reconcileOvertime(existing, generated);
  const after = [...existing.filter((e) => !first.remove.includes(e.id) && !first.write.some((w) => w.id === e.id)), ...first.write];
  const second = reconcileOvertime(after, generated);
  assert.deepEqual(second.write, []);
  assert.deepEqual(second.remove, []);
});

// ---- deciding --------------------------------------------------------------------------------------------------------

test("only the day's manager or an org admin may decide; an employee never", () => {
  const e = entry("e1", MON, 120);
  assert.equal(canDecideOvertime({ role: "manager", uid: "m1" }, e), true);
  assert.equal(canDecideOvertime({ role: "manager", uid: "m2" }, e), false, "another team's manager");
  assert.equal(canDecideOvertime({ role: "org_admin", uid: "a1" }, e), true);
  assert.equal(canDecideOvertime({ role: "employee", uid: "e1" }, e), false, "not even for their own");
  assert.equal(canDecideOvertime({ role: "owner", uid: "m1" }, e), false);
  assert.equal(canDecideOvertime({ role: "manager", uid: "" }, { ...e, managerId: "" }), false, "no empty ids matching each other");
  assert.equal(canDecideOvertime({ role: "manager", uid: "m1" }, { ...e, managerId: null }), false);
});

test("a pending entry can be approved or declined once, with who and when", () => {
  const e = entry("e1", MON, 120);
  const ok = decideOvertime(e, "approve", { role: "manager", uid: "m1" }, "2026-11-03T09:00:00.000Z");
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.entry.status, ok.entry.decidedBy, ok.entry.decidedAt], ["approved", "m1", "2026-11-03T09:00:00.000Z"]);
  assert.equal(e.status, "pending", "the original is untouched");
  assert.equal(decideOvertime(e, "decline", { role: "org_admin", uid: "a1" }, "2026-11-03T09:00:00.000Z").entry.status, "declined");
});

test("deciding is refused when it should be, with a sentence", () => {
  const e = entry("e1", MON, 120);
  const cases = [
    decideOvertime({ ...e, status: "approved" }, "decline", { role: "manager", uid: "m1" }, "t"),
    decideOvertime(e, "approve", { role: "manager", uid: "m2" }, "t"),
    decideOvertime(e, "approve", { role: "employee", uid: "e1" }, "t"),
    decideOvertime(e, "maybe", { role: "manager", uid: "m1" }, "t"),
    decideOvertime(e, "approve", { role: "manager", uid: "m1" }, ""),
  ];
  for (const r of cases) {
    assert.equal(r.ok, false);
    assert.ok(r.error.length > 15);
  }
});

test("approve all: a manager approves only their own team's pending days; an admin approves all", () => {
  const list = [entry("e1", MON, 120), entry("e2", MON, 60, "pending", { managerId: "m2" }), entry("e3", MON, 30, "declined")];
  const mine = approveAllPending(list, { role: "manager", uid: "m1" }, "2026-11-03T09:00:00.000Z");
  assert.deepEqual(mine.map((e) => e.id), [`e1_${MON}`]);
  assert.ok(mine.every((e) => e.status === "approved" && e.decidedBy === "m1"));
  const all = approveAllPending(list, { role: "org_admin", uid: "a1" }, "t");
  assert.deepEqual(all.map((e) => e.id), [`e1_${MON}`, `e2_${MON}`], "a declined entry is not touched");
  assert.deepEqual(approveAllPending(list, { role: "employee", uid: "e1" }, "t"), []);
});

// ---- the totals --------------------------------------------------------------------------------------------------------

test("only approved time is overtime; pending and declined extra time is reported apart, never dropped", () => {
  const t = overtimeTotals([entry("e1", MON, 120, "approved"), entry("e1", "2026-11-03", 30, "pending"), entry("e1", "2026-11-04", 45, "declined"), entry("e1", "2026-11-05", 15, "approved")]);
  assert.deepEqual(t, { approvedMinutes: 135, pendingMinutes: 30, declinedMinutes: 45, unapprovedMinutes: 75 });
  assert.deepEqual(overtimeTotals([]), { approvedMinutes: 0, pendingMinutes: 0, declinedMinutes: 0, unapprovedMinutes: 0 });
});

test("the module is pure: no database, no clock, no device time, no alias imports", () => {
  const src = readFileSync("src/lib/overtime.ts", "utf8");
  assert.doesNotMatch(src, /firebase|firestore/i);
  assert.doesNotMatch(src, /Date\.now|new Date\(|getHours|toLocale|process\./);
  assert.doesNotMatch(src, /from\s+["']@\//);
});
