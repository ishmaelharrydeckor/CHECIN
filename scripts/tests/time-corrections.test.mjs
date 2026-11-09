import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summaryFromEvents } from "../../src/lib/daily-summary.ts";
import {
  MAX_SESSION_MS,
  applyCorrections,
  canDecideCorrection,
  canRequestCorrection,
  cancelCorrection,
  decideCorrection,
  nextCorrectionId,
  pendingToDecide,
  validateCorrectionRequest,
} from "../../src/lib/time-corrections.ts";

const DAY = "2026-11-02";
const IN = `${DAY}T08:00:00.000Z`;
const NOW = Date.parse("2026-11-04T09:00:00.000Z");
const AT = "2026-11-04T09:00:00.000Z";

const employee = { uid: "e1", role: "employee", orgId: "orgA" };
const manager = { uid: "m1", role: "manager", orgId: "orgA" };
const otherManager = { uid: "m2", role: "manager", orgId: "orgA" };
const admin = { uid: "a1", role: "org_admin", orgId: "orgA" };
const outsider = { uid: "x1", role: "org_admin", orgId: "orgB" };
const person = { uid: "e1", orgId: "orgA", managerId: "m1" };

const request = (over = {}) => ({
  dayKey: DAY, openSince: IN, proposedAt: `${DAY}T17:00:00.000Z`, reason: "Forgot to scan out, left at five", nowMs: NOW, existing: [], ...over,
});
const correction = (over = {}) => ({
  id: `e1_${DAY}_1`, orgId: "orgA", employeeId: "e1", managerId: "m1", dayKey: DAY, proposedAt: `${DAY}T17:00:00.000Z`,
  reason: "Forgot to scan out", status: "pending", requestedBy: "e1", requestedAt: "2026-11-03T08:00:00.000Z", ...over,
});

// ---- asking -----------------------------------------------------------------------------------------------------

test("a good request is accepted, the time is written as an exact instant and the reason is trimmed", () => {
  const r = validateCorrectionRequest(request({ proposedAt: `${DAY}T18:30:00+01:00`, reason: "  Forgot to scan out  " }));
  assert.deepEqual(r, { ok: true, value: { proposedAt: `${DAY}T17:30:00.000Z`, reason: "Forgot to scan out" } });
});

test("a day with no open check-in has nothing to correct", () => {
  for (const openSince of [null, undefined, "", "not a time", 5]) {
    const r = validateCorrectionRequest(request({ openSince }));
    assert.equal(r.ok, false, String(openSince));
    assert.match(r.error, /no open check-in/);
  }
});

test("the check-out must be after the check-in, not in the future, and not longer than the longest stay", () => {
  assert.match(validateCorrectionRequest(request({ proposedAt: IN })).error, /after the check-in/, "the same minute");
  assert.match(validateCorrectionRequest(request({ proposedAt: `${DAY}T07:00:00.000Z` })).error, /after the check-in/, "before it");
  assert.match(validateCorrectionRequest(request({ proposedAt: "2026-11-04T09:00:00.001Z" })).error, /future/);
  assert.equal(validateCorrectionRequest(request({ openSince: "2026-11-04T01:00:00.000Z", proposedAt: AT })).ok, true, "exactly now is allowed");
  const limit = new Date(Date.parse(IN) + MAX_SESSION_MS).toISOString();
  assert.equal(validateCorrectionRequest(request({ proposedAt: limit })).ok, true, "exactly the longest stay");
  const over = new Date(Date.parse(IN) + MAX_SESSION_MS + 60_000).toISOString();
  assert.match(validateCorrectionRequest(request({ proposedAt: over, nowMs: Date.parse(over) + 1 })).error, /16 hours/);
});

test("a time that is not an exact instant is refused, never guessed", () => {
  for (const bad of [undefined, null, "", "5pm", "2026-11-02", "2026-11-02T17:00", "yesterday", 1730000000000, {}, "2026-13-45T10:00:00Z"]) {
    const r = validateCorrectionRequest(request({ proposedAt: bad }));
    assert.equal(r.ok, false, JSON.stringify(bad));
  }
});

test("the reason is needed, and kept to a sensible length", () => {
  for (const bad of [undefined, null, "", "   ", "no", "x".repeat(501), 7]) {
    assert.match(validateCorrectionRequest(request({ reason: bad })).error, /why/, JSON.stringify(bad));
  }
  assert.equal(validateCorrectionRequest(request({ reason: "x".repeat(500) })).ok, true);
  assert.equal(validateCorrectionRequest(request({ reason: "12345" })).ok, true);
});

test("one waiting or approved correction per day; a declined or withdrawn one can be asked again", () => {
  assert.match(validateCorrectionRequest(request({ existing: [{ status: "pending" }] })).error, /already waiting/);
  assert.match(validateCorrectionRequest(request({ existing: [{ status: "approved" }] })).error, /already been corrected/);
  assert.equal(validateCorrectionRequest(request({ existing: [{ status: "declined" }, { status: "cancelled" }] })).ok, true);
});

test("a day inside a locked pay period cannot be corrected", () => {
  const r = validateCorrectionRequest(request({ dayIsLocked: true }));
  assert.equal(r.ok, false);
  assert.match(r.error, /locked/);
  assert.match(r.error, /reopen/);
});

test("correction ids count up for a person and day, and never reuse one", () => {
  assert.equal(nextCorrectionId([], "e1", DAY), `e1_${DAY}_1`);
  assert.equal(nextCorrectionId([`e1_${DAY}_1`], "e1", DAY), `e1_${DAY}_2`);
  assert.equal(nextCorrectionId([`e1_${DAY}_1`, `e1_${DAY}_3`], "e1", DAY), `e1_${DAY}_4`);
  assert.equal(nextCorrectionId([`e2_${DAY}_5`, `e1_2026-11-03_9`], "e1", DAY), `e1_${DAY}_1`, "other people and days do not count");
  assert.throws(() => nextCorrectionId([], "", DAY), RangeError);
});

// ---- who may ask -------------------------------------------------------------------------------------------------

test("a person asks for themselves, a manager for their own team, an admin for anyone in the organization", () => {
  assert.equal(canRequestCorrection(employee, person), true);
  assert.equal(canRequestCorrection({ ...employee, uid: "e2" }, person), false, "another employee");
  assert.equal(canRequestCorrection(manager, person), true);
  assert.equal(canRequestCorrection(otherManager, person), false, "another team's manager");
  assert.equal(canRequestCorrection(admin, person), true);
  assert.equal(canRequestCorrection(outsider, person), false, "another organization");
  assert.equal(canRequestCorrection({ uid: "", role: "org_admin", orgId: "orgA" }, person), false);
  assert.equal(canRequestCorrection({ uid: "z", role: "owner", orgId: "orgA" }, person), false);
  assert.equal(canRequestCorrection(manager, { ...person, managerId: null }), false, "no empty ids matching");
});

// ---- deciding ------------------------------------------------------------------------------------------------------

test("the day's manager or an admin decides; never the person who asked, an employee or another organization", () => {
  const c = correction();
  assert.equal(canDecideCorrection(manager, c), true);
  assert.equal(canDecideCorrection(admin, c), true);
  assert.equal(canDecideCorrection(otherManager, c), false);
  assert.equal(canDecideCorrection(employee, c), false);
  assert.equal(canDecideCorrection(outsider, c), false);
  assert.equal(canDecideCorrection(manager, correction({ requestedBy: "m1" })), false, "a manager cannot sign off their own request");
  assert.equal(canDecideCorrection(admin, correction({ requestedBy: "a1" })), false, "nor can an admin");
  assert.equal(canDecideCorrection(manager, correction({ managerId: null })), false);
});

test("a manager's request for their team is decided by an admin", () => {
  const byManager = correction({ requestedBy: "m1" });
  assert.equal(decideCorrection(byManager, "approve", manager, AT).ok, false);
  const ok = decideCorrection(byManager, "approve", admin, AT);
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.correction.status, ok.correction.decidedBy, ok.correction.decidedAt], ["approved", "a1", AT]);
});

test("a pending correction is decided once, and the original is untouched", () => {
  const c = correction();
  const ok = decideCorrection(c, "decline", manager, AT);
  assert.equal(ok.correction.status, "declined");
  assert.equal(c.status, "pending");
  const again = decideCorrection(ok.correction, "approve", admin, AT);
  assert.equal(again.ok, false);
  assert.match(again.error, /already been decided/);
});

test("deciding is refused with a sentence when it should be", () => {
  const c = correction();
  const refused = [
    decideCorrection(c, "maybe", manager, AT),
    decideCorrection(c, "approve", manager, ""),
    decideCorrection(c, "approve", manager, "tomorrow"),
    decideCorrection(c, "approve", otherManager, AT),
    decideCorrection(c, "approve", employee, AT),
    decideCorrection(c, "approve", outsider, AT),
    decideCorrection(correction({ requestedBy: "m1" }), "approve", manager, AT),
  ];
  for (const r of refused) {
    assert.equal(r.ok, false);
    assert.ok(r.error.length > 15);
  }
});

test("only the person who asked can withdraw, and only while it is waiting", () => {
  const c = correction();
  assert.equal(cancelCorrection(c, employee, AT).correction.status, "cancelled");
  assert.equal(cancelCorrection(c, manager, AT).ok, false);
  assert.equal(cancelCorrection(c, { ...employee, orgId: "orgB" }, AT).ok, false);
  assert.equal(cancelCorrection({ ...c, status: "approved" }, employee, AT).ok, false);
  assert.equal(cancelCorrection(c, employee, "").ok, false);
});

test("what is waiting for someone to decide is only what they may decide", () => {
  const list = [correction(), correction({ id: "e2_1", employeeId: "e2", managerId: "m2" }), correction({ id: "e3_1", status: "approved" })];
  assert.deepEqual(pendingToDecide(list, manager).map((c) => c.id), [`e1_${DAY}_1`]);
  assert.deepEqual(pendingToDecide(list, admin).map((c) => c.id), [`e1_${DAY}_1`, "e2_1"]);
  assert.deepEqual(pendingToDecide(list, employee), []);
});

// ---- rebuilding the day -----------------------------------------------------------------------------------------------

const identity = { orgId: "orgA", managerId: "m1", employeeId: "e1", employeeName: "Ama", department: "Ops", dayKey: DAY };
const rebuild = (events, corrections) => summaryFromEvents(applyCorrections(events, corrections).events, identity, AT);
const approved = (over = {}) => correction({ status: "approved", decidedBy: "m1", decidedAt: AT, ...over });

test("without a correction the open day has short hours; with an approved one it has the real hours", () => {
  const events = [{ type: "in", timestamp: IN, late: false }];
  const before = rebuild(events, []);
  assert.deepEqual([before.minutesWorked, before.state, before.openSince, before.lastOut], [0, "in", IN, null]);
  const after = rebuild(events, [approved()]);
  assert.equal(after.minutesWorked, 9 * 60, "08:00 to 17:00");
  assert.equal(after.state, "out");
  assert.equal(after.openSince, null);
  assert.equal(after.lastOut, `${DAY}T17:00:00.000Z`);
  assert.equal(after.firstIn, IN, "the real check-in is untouched");
  assert.equal(after.earlyDeparture, false, "a correction never marks someone as leaving early");
});

test("a late flag on the real check-in is kept", () => {
  const s = rebuild([{ type: "in", timestamp: IN, late: true }], [approved()]);
  assert.equal(s.late, true);
});

test("the scans themselves are never changed", () => {
  const events = Object.freeze([Object.freeze({ type: "in", timestamp: IN })]);
  const result = applyCorrections(events, [approved()]);
  assert.equal(events.length, 1);
  assert.equal(result.events.length, 2);
  assert.equal(result.events.filter((e) => !("correctionId" in e)).length, 1);
});

test("only an approved correction counts: waiting, declined and withdrawn ones change nothing", () => {
  for (const status of ["pending", "declined", "cancelled"]) {
    const r = applyCorrections([{ type: "in", timestamp: IN }], [correction({ status })]);
    assert.equal(r.events.length, 1, status);
    assert.deepEqual(r.applied, []);
    assert.deepEqual(r.ignored, []);
  }
});

test("applying the same corrections twice gives the same day", () => {
  const events = [{ type: "in", timestamp: IN }];
  const once = applyCorrections(events, [approved()]);
  const twice = applyCorrections(once.events, [approved()]);
  assert.deepEqual(twice.events, once.events);
  assert.deepEqual(twice.applied, [`e1_${DAY}_1`]);
  assert.equal(summaryFromEvents(twice.events, identity, AT).minutesWorked, 540);
});

test("if the person later scanned out for real, the correction is dropped and said so", () => {
  const events = [{ type: "in", timestamp: IN }, { type: "out", timestamp: `${DAY}T18:00:00.000Z` }];
  const r = applyCorrections(events, [approved()]);
  assert.deepEqual(r.applied, []);
  assert.deepEqual(r.ignored, [{ id: `e1_${DAY}_1`, reason: "The day no longer has an open check-in." }]);
  assert.equal(summaryFromEvents(r.events, identity, AT).minutesWorked, 10 * 60, "the real scan stands");
});

test("a correction for a day that has no scans at all is dropped, not invented", () => {
  const r = applyCorrections([], [approved()]);
  assert.equal(r.events.length, 0);
  assert.equal(r.ignored.length, 1);
});

test("a correction that is not after the check-in is dropped", () => {
  const r = applyCorrections([{ type: "in", timestamp: IN }], [approved({ proposedAt: `${DAY}T07:00:00.000Z` })]);
  assert.deepEqual(r.applied, []);
  assert.match(r.ignored[0].reason, /not after the check-in/);
});

test("only one correction can fix a day", () => {
  const r = applyCorrections([{ type: "in", timestamp: IN }], [approved(), approved({ id: `e1_${DAY}_2`, proposedAt: `${DAY}T19:00:00.000Z` })]);
  assert.deepEqual(r.applied, [`e1_${DAY}_1`]);
  assert.deepEqual(r.ignored.map((i) => i.id), [`e1_${DAY}_2`]);
});

test("a person who came back and left again keeps both stays, and the open one is fixed", () => {
  const events = [
    { type: "in", timestamp: `${DAY}T08:00:00.000Z` },
    { type: "out", timestamp: `${DAY}T12:00:00.000Z` },
    { type: "in", timestamp: `${DAY}T13:00:00.000Z` },
  ];
  const s = summaryFromEvents(applyCorrections(events, [approved({ proposedAt: `${DAY}T17:00:00.000Z` })]).events, identity, AT);
  assert.equal(s.minutesWorked, 4 * 60 + 4 * 60);
  assert.equal(s.lastOut, `${DAY}T17:00:00.000Z`);
});

test("a night shift is fixed across midnight", () => {
  const events = [{ type: "in", timestamp: `${DAY}T22:00:00.000Z` }];
  const c = approved({ proposedAt: "2026-11-03T06:10:00.000Z" });
  assert.equal(summaryFromEvents(applyCorrections(events, [c]).events, identity, AT).minutesWorked, 8 * 60 + 10);
});

test("a scan outside the window stays out of it, as before", () => {
  const events = [{ type: "in", timestamp: IN }, { type: "in", timestamp: `${DAY}T05:00:00.000Z`, outsideWindow: true }];
  const s = summaryFromEvents(applyCorrections(events, [approved()]).events, identity, AT);
  assert.equal(s.minutesWorked, 540);
});

// ---- it stays pure ----------------------------------------------------------------------------------------------------

test("the module is pure: no database, no clock, no device time, no alias imports", () => {
  const src = readFileSync("src/lib/time-corrections.ts", "utf8");
  assert.doesNotMatch(src, /firebase|firestore/i);
  assert.doesNotMatch(src, /Date\.now|new Date\(\)|getHours|toLocale|process\./);
  assert.doesNotMatch(src, /from\s+["']@\//);
});
