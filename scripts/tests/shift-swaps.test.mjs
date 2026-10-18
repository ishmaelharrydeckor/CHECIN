import test from "node:test";
import assert from "node:assert/strict";
import {
  SWAP_NOTE_MAX_LENGTH,
  SWAP_STATUSES,
  approverRule,
  buildSwapDoc,
  canSeeSwap,
  checkSwapEligibility,
  currentParties,
  decideSwapAction,
  isOpenSwap,
  parseProposeRequest,
  parseSwapActionRequest,
  parseSwapSettingsInput,
  readSwapsEnabled,
  shiftsStillAsProposed,
  swapAssignments,
  swapDocId,
  swapManagerIds,
  swapRowFromDoc,
} from "../../src/lib/shift-swaps.ts";

const TODAY = "2026-10-13";
const REQ = "0b7c9d3e-1f2a-4b5c-8d6e-7f8091a2b3c4";

// Ann proposes, Ben is the colleague; both report to manager M.
const SWAP = {
  proposerId: "ann",
  colleagueId: "ben",
  proposerManagerId: "mgr",
  colleagueManagerId: "mgr",
  status: "pending",
};
const ANN = { uid: "ann", role: "employee" };
const BEN = { uid: "ben", role: "employee" };
const MGR = { uid: "mgr", role: "manager" };
const OTHER_MGR = { uid: "mgr2", role: "manager" };
const ADMIN = { uid: "boss", role: "org_admin" };
const STRANGER = { uid: "cara", role: "employee" };

const DAY_SHIFT = { shiftId: "day", name: "Day", type: "day", start: "08:00", end: "16:00", graceMinutes: 0, expectedMinutes: null };
const NIGHT_SHIFT = { shiftId: "night", name: "Night", type: "night", start: "22:00", end: "06:00", graceMinutes: 5, expectedMinutes: null };

function person(uid, shift, extra = {}) {
  return {
    uid,
    assignment: shift ? { shiftId: shift.shiftId, shift } : null,
    onLeave: false,
    recordedToday: false,
    ...extra,
  };
}

function eligibility(overrides = {}) {
  return checkSwapEligibility({
    today: TODAY,
    dayKey: "2026-10-15",
    holiday: false,
    proposer: person("ann", DAY_SHIFT),
    colleague: person("ben", NIGHT_SHIFT),
    ...overrides,
  });
}

// ---------------------------------------------------------------- constants and helpers
test("shift-swaps exports the five statuses in order", () => {
  assert.deepEqual(SWAP_STATUSES, ["pending", "accepted", "approved", "declined", "cancelled"]);
  assert.equal(SWAP_NOTE_MAX_LENGTH, 200);
});

test("isOpenSwap: pending and accepted are open; the other three are final", () => {
  assert.equal(isOpenSwap("pending"), true);
  assert.equal(isOpenSwap("accepted"), true);
  for (const s of ["approved", "declined", "cancelled", "nonsense", undefined]) assert.equal(isOpenSwap(s), false);
});

test("approverRule: same manager means that manager or an admin; different managers means admin only", () => {
  assert.equal(approverRule("mgr", "mgr"), "manager_or_admin");
  assert.equal(approverRule("mgr", "mgr2"), "admin_only");
  assert.equal(approverRule(null, "mgr"), "admin_only");
  assert.equal(approverRule(null, null), "admin_only");
});

test("swapDocId is deterministic per proposal request and refuses slashes", () => {
  assert.equal(swapDocId("ann", "2026-10-15", REQ), swapDocId("ann", "2026-10-15", REQ));
  assert.notEqual(swapDocId("ann", "2026-10-15", REQ), swapDocId("ann", "2026-10-16", REQ));
  assert.throws(() => swapDocId("a/b", "2026-10-15", REQ));
  assert.throws(() => swapDocId("ann", "2026-10-15", ""));
});

// ---------------------------------------------------------------- the status machine
test("every allowed move, by the only person allowed to make it", () => {
  const ok = (swap, caller, action, next) => {
    const r = decideSwapAction(swap, caller, action);
    assert.equal(r.ok, true, `${caller.uid} ${action} from ${swap.status}: ${r.error ?? ""}`);
    assert.equal(r.next, next);
  };
  ok(SWAP, BEN, "accept", "accepted");
  ok(SWAP, BEN, "decline", "declined");
  ok(SWAP, ANN, "cancel", "cancelled");
  ok({ ...SWAP, status: "accepted" }, ANN, "cancel", "cancelled");
  ok({ ...SWAP, status: "accepted" }, MGR, "approve", "approved");
  ok({ ...SWAP, status: "accepted" }, MGR, "reject", "declined");
  ok({ ...SWAP, status: "accepted" }, ADMIN, "approve", "approved");
  ok({ ...SWAP, status: "accepted" }, ADMIN, "reject", "declined");
});

test("the wrong person is refused with 403 for every action", () => {
  const no = (swap, caller, action) => {
    const r = decideSwapAction(swap, caller, action);
    assert.equal(r.ok, false, `${caller.uid} ${action} should be refused`);
    assert.equal(r.status, 403);
    assert.ok(r.error.length > 0);
  };
  // Only the colleague accepts or declines.
  for (const c of [ANN, MGR, ADMIN, STRANGER]) {
    no(SWAP, c, "accept");
    no(SWAP, c, "decline");
  }
  // Only the proposer cancels.
  for (const c of [BEN, MGR, ADMIN, STRANGER]) no(SWAP, c, "cancel");
  // Only their manager or an admin approves or rejects.
  const accepted = { ...SWAP, status: "accepted" };
  for (const c of [ANN, BEN, OTHER_MGR, STRANGER]) {
    no(accepted, c, "approve");
    no(accepted, c, "reject");
  }
});

test("different managers: only an org admin can approve, not either manager", () => {
  const split = { ...SWAP, colleagueManagerId: "mgr2", status: "accepted" };
  assert.equal(decideSwapAction(split, MGR, "approve").status, 403);
  assert.equal(decideSwapAction(split, OTHER_MGR, "approve").status, 403);
  assert.equal(decideSwapAction(split, ADMIN, "approve").ok, true);
});

test("a manager who is one of the two people cannot approve their own swap", () => {
  // A manager's managerId is their own uid, so they and their report share a "manager".
  const own = { proposerId: "mgr", colleagueId: "ben", proposerManagerId: "mgr", colleagueManagerId: "mgr", status: "accepted" };
  const r = decideSwapAction(own, MGR, "approve");
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(decideSwapAction(own, ADMIN, "approve").ok, true);
});

test("moves from the wrong status are refused with 409, and final swaps never move", () => {
  const conflict = (swap, caller, action) => {
    const r = decideSwapAction(swap, caller, action);
    assert.equal(r.ok, false, `${action} from ${swap.status}`);
    assert.equal(r.status, 409);
  };
  conflict({ ...SWAP, status: "accepted" }, BEN, "accept");
  conflict({ ...SWAP, status: "accepted" }, BEN, "decline");
  conflict(SWAP, MGR, "approve"); // not accepted yet
  conflict(SWAP, ADMIN, "reject");
  for (const final of ["approved", "declined", "cancelled"]) {
    conflict({ ...SWAP, status: final }, BEN, "accept");
    conflict({ ...SWAP, status: final }, ANN, "cancel");
    conflict({ ...SWAP, status: final }, ADMIN, "approve");
  }
  // A retried approval is refused, so it can never swap twice.
  conflict({ ...SWAP, status: "approved" }, MGR, "approve");
});

test("unknown actions and broken input are refused", () => {
  assert.equal(decideSwapAction(SWAP, BEN, "steal").status, 400);
  assert.equal(decideSwapAction(SWAP, null, "accept").ok, false);
  assert.equal(decideSwapAction(null, BEN, "accept").ok, false);
  assert.equal(decideSwapAction({ ...SWAP, status: "weird" }, BEN, "accept").status, 409);
});

// ---------------------------------------------------------------- who can see a swap
test("canSeeSwap: the two people, either person's manager and admins; nobody else", () => {
  const split = { ...SWAP, colleagueManagerId: "mgr2" };
  assert.equal(canSeeSwap(split, ANN), true);
  assert.equal(canSeeSwap(split, BEN), true);
  assert.equal(canSeeSwap(split, MGR), true);
  assert.equal(canSeeSwap(split, OTHER_MGR), true);
  assert.equal(canSeeSwap(split, ADMIN), true);
  assert.equal(canSeeSwap(split, STRANGER), false);
  assert.equal(canSeeSwap(split, { uid: "mgr3", role: "manager" }), false);
  assert.equal(canSeeSwap(split, null), false);
});

// ---------------------------------------------------------------- eligibility checks
test("checkSwapEligibility accepts a normal future swap", () => {
  assert.deepEqual(eligibility(), { ok: true });
});

test("checkSwapEligibility refuses each broken case with a plain reason", () => {
  const cases = [
    [{ dayKey: "2026-10-12" }, "past"],
    [{ dayKey: "2026-02-30" }, "not a real day"],
    [{ colleague: person("ann", NIGHT_SHIFT) }, "same person"],
    [{ proposer: person("ann", null) }, "proposer has no shift"],
    [{ colleague: person("ben", null) }, "colleague has no shift"],
    [{ colleague: person("ben", DAY_SHIFT) }, "same shift"],
    [{ proposer: person("ann", DAY_SHIFT, { onLeave: true }) }, "proposer on leave"],
    [{ colleague: person("ben", NIGHT_SHIFT, { onLeave: true }) }, "colleague on leave"],
    [{ holiday: true }, "holiday"],
  ];
  for (const [over, label] of cases) {
    const r = eligibility(over);
    assert.equal(r.ok, false, label);
    assert.equal(typeof r.error, "string", label);
    assert.ok(r.error.length > 0, label);
  }
});

test("today can be swapped only while neither person has attendance recorded", () => {
  assert.equal(eligibility({ dayKey: TODAY }).ok, true);
  assert.equal(eligibility({ dayKey: TODAY, proposer: person("ann", DAY_SHIFT, { recordedToday: true }) }).ok, false);
  assert.equal(eligibility({ dayKey: TODAY, colleague: person("ben", NIGHT_SHIFT, { recordedToday: true }) }).ok, false);
  // Attendance on a future day cannot exist; the flag is ignored there.
  assert.equal(eligibility({ proposer: person("ann", DAY_SHIFT, { recordedToday: true }) }).ok, true);
});

test("two different shifts with the same id but different times are still the same shift", () => {
  const edited = { ...DAY_SHIFT, start: "09:00" };
  assert.equal(eligibility({ colleague: person("ben", edited) }).ok, false);
});

test("the leave message names who is on leave", () => {
  assert.match(eligibility({ colleague: person("ben", NIGHT_SHIFT, { onLeave: true }) }).error, /colleague/i);
  assert.match(eligibility({ proposer: person("ann", DAY_SHIFT, { onLeave: true }) }).error, /you/i);
});

// ---------------------------------------------------------------- request parsing
test("parseProposeRequest takes the colleague, the day and an optional note; never a proposer", () => {
  assert.deepEqual(parseProposeRequest({ colleagueId: " ben ", dayKey: "2026-10-15", requestId: REQ }, TODAY), {
    ok: true,
    value: { colleagueId: "ben", dayKey: "2026-10-15", note: "", requestId: REQ },
  });
  const withNote = parseProposeRequest({ colleagueId: "ben", dayKey: "2026-10-15", note: "  Doctor's appointment ", requestId: REQ }, TODAY);
  assert.equal(withNote.value.note, "Doctor's appointment");
  // Anything that names the proposer, their org or manager is refused, not ignored.
  for (const key of ["proposerId", "orgId", "managerId", "role", "status"]) {
    assert.equal(
      parseProposeRequest({ colleagueId: "ben", dayKey: "2026-10-15", requestId: REQ, [key]: "x" }, TODAY).ok,
      false,
      key,
    );
  }
});

test("parseProposeRequest refuses bad input", () => {
  const base = { colleagueId: "ben", dayKey: "2026-10-15", requestId: REQ };
  const bad = [
    null,
    [],
    { ...base, colleagueId: "" },
    { ...base, colleagueId: "a/b" },
    { ...base, colleagueId: 7 },
    { ...base, dayKey: "15-10-2026" },
    { ...base, dayKey: "2026-02-30" },
    { ...base, dayKey: "2026-10-12" },
    { ...base, note: 5 },
    { ...base, note: "x".repeat(SWAP_NOTE_MAX_LENGTH + 1) },
    { ...base, requestId: "" },
    { ...base, requestId: "x".repeat(65) },
  ];
  for (const raw of bad) assert.equal(parseProposeRequest(raw, TODAY).ok, false, JSON.stringify(raw));
  assert.equal(parseProposeRequest(base, "bad").ok, false);
});

test("parseSwapActionRequest takes a swap id and one of the five actions", () => {
  assert.deepEqual(parseSwapActionRequest({ swapId: "s1", action: "accept" }), { ok: true, value: { swapId: "s1", action: "accept" } });
  for (const a of ["accept", "decline", "cancel", "approve", "reject"]) {
    assert.equal(parseSwapActionRequest({ swapId: "s1", action: a }).ok, true, a);
  }
  for (const raw of [null, {}, { swapId: "s1" }, { swapId: "", action: "accept" }, { swapId: "a/b", action: "accept" }, { swapId: "s1", action: "steal" }]) {
    assert.equal(parseSwapActionRequest(raw).ok, false, JSON.stringify(raw));
  }
});

// ---------------------------------------------------------------- the swap itself
const ANN_DOC = {
  orgId: "org1",
  managerId: "mgr",
  employeeId: "ann",
  employeeName: "Ann",
  dayKey: "2026-10-15",
  shiftId: "day",
  shift: DAY_SHIFT,
  assignedBy: "mgr",
  assignedAt: "2026-10-01T09:00:00.000Z",
  patternId: "ann_req1",
};
const BEN_DOC = {
  orgId: "org1",
  managerId: "mgr",
  employeeId: "ben",
  employeeName: "Ben",
  dayKey: "2026-10-15",
  shiftId: "night",
  shift: NIGHT_SHIFT,
  assignedBy: "mgr",
  assignedAt: "2026-10-01T09:00:00.000Z",
};
const AT = "2026-10-13T10:00:00.000Z";

test("swapAssignments exchanges only the shifts; each person keeps their own identity", () => {
  const r = swapAssignments({ proposer: ANN_DOC, colleague: BEN_DOC, swapId: "sw1", approvedBy: "mgr", at: AT });
  assert.equal(r.ok, true);
  const { proposer, colleague } = r.value;
  assert.equal(proposer.employeeId, "ann");
  assert.equal(proposer.employeeName, "Ann");
  assert.equal(proposer.managerId, "mgr");
  assert.equal(proposer.orgId, "org1");
  assert.equal(proposer.dayKey, "2026-10-15");
  assert.equal(proposer.shiftId, "night");
  assert.deepEqual(proposer.shift, NIGHT_SHIFT);
  assert.equal(colleague.employeeId, "ben");
  assert.equal(colleague.shiftId, "day");
  assert.deepEqual(colleague.shift, DAY_SHIFT);
  // Who changed it and why is recorded on both.
  for (const doc of [proposer, colleague]) {
    assert.equal(doc.assignedBy, "mgr");
    assert.equal(doc.assignedAt, AT);
    assert.equal(doc.swapId, "sw1");
  }
});

test("a swapped day counts as assigned by hand: no pattern can rewrite it later", () => {
  const r = swapAssignments({ proposer: ANN_DOC, colleague: BEN_DOC, swapId: "sw1", approvedBy: "mgr", at: AT });
  assert.equal("patternId" in r.value.proposer, false);
  assert.equal("patternId" in r.value.colleague, false);
});

test("swapAssignments does not change its inputs and swaps back to the start when done twice", () => {
  const before = JSON.stringify([ANN_DOC, BEN_DOC]);
  const once = swapAssignments({ proposer: ANN_DOC, colleague: BEN_DOC, swapId: "sw1", approvedBy: "mgr", at: AT }).value;
  assert.equal(JSON.stringify([ANN_DOC, BEN_DOC]), before);
  const twice = swapAssignments({ proposer: once.proposer, colleague: once.colleague, swapId: "sw2", approvedBy: "mgr", at: AT }).value;
  assert.equal(twice.proposer.shiftId, "day");
  assert.equal(twice.colleague.shiftId, "night");
});

test("swapAssignments refuses documents that do not belong together", () => {
  const args = (p, c) => ({ proposer: p, colleague: c, swapId: "sw1", approvedBy: "mgr", at: AT });
  const cases = [
    [args({ ...ANN_DOC, dayKey: "2026-10-16" }, BEN_DOC), "different days"],
    [args(ANN_DOC, { ...BEN_DOC, orgId: "org2" }), "different organizations"],
    [args(ANN_DOC, { ...BEN_DOC, employeeId: "ann" }), "same person"],
    [args(ANN_DOC, { ...BEN_DOC, shiftId: "day", shift: DAY_SHIFT }), "same shift"],
    [args(null, BEN_DOC), "missing document"],
    [args(ANN_DOC, { ...BEN_DOC, shift: null }), "damaged shift"],
  ];
  for (const [input, label] of cases) assert.equal(swapAssignments(input).ok, false, label);
  assert.equal(swapAssignments({ ...args(ANN_DOC, BEN_DOC), approvedBy: "" }).ok, false, "no approver");
});

// ---------------------------------------------------------------- step 2 helpers

test("readSwapsEnabled: off unless the organization has switched it on", () => {
  for (const org of [undefined, null, {}, "x", { shiftSwapsEnabled: "yes" }, { shiftSwapsEnabled: 1 }]) {
    assert.equal(readSwapsEnabled(org), false, JSON.stringify(org));
  }
  assert.equal(readSwapsEnabled({ shiftSwapsEnabled: true }), true);
  assert.equal(readSwapsEnabled({ shiftSwapsEnabled: false }), false);
});

test("parseSwapSettingsInput takes only a true/false switch", () => {
  assert.deepEqual(parseSwapSettingsInput({ shiftSwapsEnabled: true }), { ok: true, value: { shiftSwapsEnabled: true } });
  assert.deepEqual(parseSwapSettingsInput({ shiftSwapsEnabled: false }), { ok: true, value: { shiftSwapsEnabled: false } });
  for (const raw of [null, {}, { shiftSwapsEnabled: "true" }, { shiftSwapsEnabled: true, orgId: "x" }, []]) {
    assert.equal(parseSwapSettingsInput(raw).ok, false, JSON.stringify(raw));
  }
});

const PARTY = (uid, name, managerId, shift) => ({ uid, name, managerId, assignment: { shiftId: shift.shiftId, shift } });

test("buildSwapDoc records both people, their managers and shifts, and starts pending", () => {
  const doc = buildSwapDoc({
    orgId: "org1",
    dayKey: "2026-10-15",
    proposer: PARTY("ann", "Ann", "mgr", DAY_SHIFT),
    colleague: PARTY("ben", "Ben", "mgr2", NIGHT_SHIFT),
    note: "Doctor",
    requestId: REQ,
    at: AT,
  });
  assert.equal(doc.status, "pending");
  assert.equal(doc.orgId, "org1");
  assert.equal(doc.proposerId, "ann");
  assert.equal(doc.colleagueId, "ben");
  assert.equal(doc.proposerManagerId, "mgr");
  assert.equal(doc.colleagueManagerId, "mgr2");
  assert.deepEqual(doc.managerIds, ["mgr", "mgr2"]);
  assert.equal(doc.proposerShiftId, "day");
  assert.equal(doc.colleagueShiftId, "night");
  assert.equal(doc.proposerAssignmentId, "ann_2026-10-15");
  assert.equal(doc.colleagueAssignmentId, "ben_2026-10-15");
  assert.equal(doc.proposerShiftLabel, "Day, 08:00 to 16:00");
  assert.equal(doc.colleagueShiftLabel, "Night, 22:00 to 06:00");
  assert.equal(doc.createdAt, AT);
  assert.equal(doc.note, "Doctor");
});

test("buildSwapDoc lists one manager once and leaves out a missing manager", () => {
  const same = buildSwapDoc({ orgId: "o", dayKey: "2026-10-15", proposer: PARTY("ann", "Ann", "mgr", DAY_SHIFT), colleague: PARTY("ben", "Ben", "mgr", NIGHT_SHIFT), note: "", requestId: REQ, at: AT });
  assert.deepEqual(same.managerIds, ["mgr"]);
  const none = buildSwapDoc({ orgId: "o", dayKey: "2026-10-15", proposer: PARTY("ann", "Ann", null, DAY_SHIFT), colleague: PARTY("ben", "Ben", "mgr", NIGHT_SHIFT), note: "", requestId: REQ, at: AT });
  assert.deepEqual(none.managerIds, ["mgr"]);
  assert.equal(none.proposerManagerId, null);
});

test("shiftsStillAsProposed refuses an approval when either shift changed since the proposal", () => {
  const swap = { proposerShiftId: "day", colleagueShiftId: "night" };
  assert.equal(shiftsStillAsProposed(swap, { shiftId: "day" }, { shiftId: "night" }), true);
  assert.equal(shiftsStillAsProposed(swap, { shiftId: "late" }, { shiftId: "night" }), false);
  assert.equal(shiftsStillAsProposed(swap, { shiftId: "day" }, null), false);
  assert.equal(shiftsStillAsProposed(swap, null, { shiftId: "night" }), false);
});

test("swapRowFromDoc returns only the display fields, with safe defaults", () => {
  const doc = buildSwapDoc({ orgId: "org1", dayKey: "2026-10-15", proposer: PARTY("ann", "Ann", "mgr", DAY_SHIFT), colleague: PARTY("ben", "Ben", "mgr", NIGHT_SHIFT), note: "", requestId: REQ, at: AT });
  const row = swapRowFromDoc("sw1", doc);
  assert.equal(row.id, "sw1");
  assert.equal(row.status, "pending");
  assert.equal(row.proposerName, "Ann");
  assert.equal(row.colleagueName, "Ben");
  assert.equal(row.dayKey, "2026-10-15");
  assert.equal("managerIds" in row, false, "internal routing fields are not sent to the screen");
  assert.equal("requestId" in row, false);
  assert.equal(swapRowFromDoc("x", null), null);
  assert.equal(swapRowFromDoc("x", { status: "pending" }), null, "a damaged record is skipped");
});

test("an open swap is checked against each person's manager now, not the one stored at proposal", () => {
  // Proposed while both reported to "old"; both now report to "new".
  const stored = { ...SWAP, proposerManagerId: "old", colleagueManagerId: "old", status: "accepted" };
  const now = currentParties(stored, { proposerManagerId: "new", colleagueManagerId: "new" });
  const newMgr = { uid: "new", role: "manager" };
  const oldMgr = { uid: "old", role: "manager" };
  assert.equal(canSeeSwap(stored, newMgr), false, "the stored managers alone would hide it from the new manager");
  assert.equal(canSeeSwap(now, newMgr), true);
  assert.equal(decideSwapAction(now, newMgr, "approve").ok, true, "the new manager can approve without an admin");
  assert.equal(canSeeSwap(now, oldMgr), false, "the previous manager no longer sees an open swap");
  assert.equal(decideSwapAction(now, oldMgr, "approve").ok, false);
  // One person moved: the two now have different managers, so only an admin can decide.
  const split = currentParties(stored, { proposerManagerId: "new", colleagueManagerId: "old" });
  assert.equal(canSeeSwap(split, newMgr), true);
  assert.equal(decideSwapAction(split, newMgr, "approve").status, 403);
  assert.equal(decideSwapAction(split, { uid: "adm", role: "org_admin" }, "approve").ok, true);
  // Someone who left the organization has no manager now.
  assert.equal(currentParties(stored, { proposerManagerId: null, colleagueManagerId: "new" }).proposerManagerId, null);
});

test("a finished swap keeps the managers it was decided under", () => {
  for (const status of ["approved", "declined", "cancelled"]) {
    const stored = { ...SWAP, proposerManagerId: "old", colleagueManagerId: "old", status };
    const parties = currentParties(stored, { proposerManagerId: "new", colleagueManagerId: "new" });
    assert.equal(parties.proposerManagerId, "old", status);
    assert.equal(canSeeSwap(parties, { uid: "old", role: "manager" }), true, `${status}: history stays with its manager`);
  }
});

test("swapManagerIds lists each manager once and leaves out a missing one", () => {
  assert.deepEqual(swapManagerIds("a", "a"), ["a"]);
  assert.deepEqual(swapManagerIds("a", "b"), ["a", "b"]);
  assert.deepEqual(swapManagerIds(null, "b"), ["b"]);
  assert.deepEqual(swapManagerIds(null, null), []);
});
