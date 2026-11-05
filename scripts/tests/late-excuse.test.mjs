import test from "node:test";
import assert from "node:assert/strict";
import {
  EXCUSE_WINDOW_DAYS, HISTORY_MAX, MAX_EXCUSE_PEOPLE, NOTE_MAX, REASON_MAX,
  appendHistory, arrivedByCutoff, canExcuse, excuseDecision, isDayInWindow, isEffectivelyLate,
  parseExcuseRequest, parseNoteRequest, parseReason, parseRevokeRequest, stampFor, windowStart,
} from "../../src/lib/late-excuse.ts";

const TODAY = "2026-10-17";
const body = (o = {}) => ({ dayKey: "2026-10-16", employeeIds: ["a", "b"], reason: "Tablet switched on late", ...o });

test("the window: today and 14 days back, nothing older, nothing in the future", () => {
  assert.equal(EXCUSE_WINDOW_DAYS, 14);
  assert.equal(windowStart(TODAY), "2026-10-03");
  assert.ok(isDayInWindow("2026-10-17", TODAY));
  assert.ok(isDayInWindow("2026-10-03", TODAY));
  assert.ok(!isDayInWindow("2026-10-02", TODAY));
  assert.ok(!isDayInWindow("2026-10-18", TODAY));
  assert.ok(!isDayInWindow("2026-02-30", TODAY));
  assert.ok(!isDayInWindow("nonsense", TODAY));
});

test("excuse request: a good one is accepted and cleaned", () => {
  const r = parseExcuseRequest(body({ employeeIds: ["a", " a ", "b"], reason: "  Manager   was\nlate  " }), TODAY);
  assert.ok(r.ok);
  assert.deepEqual(r.value.employeeIds, ["a", "b"]);
  assert.equal(r.value.reason, "Manager was late");
});

test("excuse request: bad days are refused with a plain sentence", () => {
  for (const dayKey of ["2026-10-02", "2026-10-18", "2026-13-01", "", null, 5, undefined]) {
    const r = parseExcuseRequest(body({ dayKey }), TODAY);
    assert.equal(r.ok, false, String(dayKey));
    assert.ok(r.error.length > 10);
  }
  assert.match(parseExcuseRequest(body({ dayKey: "2026-09-01" }), TODAY).error, /locked/);
  assert.match(parseExcuseRequest(body({ dayKey: "2026-10-18" }), TODAY).error, /not happened/);
});

test("excuse request: people must be real ids, at least one, at most 200", () => {
  for (const employeeIds of [[], null, "a", [""], ["a/b"], [5], [null], ["x".repeat(129)]]) {
    assert.equal(parseExcuseRequest(body({ employeeIds }), TODAY).ok, false, JSON.stringify(employeeIds));
  }
  const ok = Array.from({ length: MAX_EXCUSE_PEOPLE }, (_, i) => `e${i}`);
  assert.ok(parseExcuseRequest(body({ employeeIds: ok }), TODAY).ok);
  assert.equal(parseExcuseRequest(body({ employeeIds: [...ok, "extra"] }), TODAY).ok, false);
});

test("reason: 3 to 200 characters of plain text", () => {
  assert.equal(parseReason("ab").ok, false);
  assert.equal(parseReason("   ").ok, false);
  assert.equal(parseReason(null).ok, false);
  assert.equal(parseReason(12345).ok, false);
  assert.ok(parseReason("abc").ok);
  assert.ok(parseReason("x".repeat(REASON_MAX)).ok);
  assert.equal(parseReason("x".repeat(REASON_MAX + 1)).ok, false);
  assert.equal(parseReason("line one\u0000\u0007 line two").value, "line one line two");
  // a reason made only of control characters is empty after cleaning
  assert.equal(parseReason("\u0000\u0001\u0002\u0003").ok, false);
});

test("the request never carries an identity, organization or manager", () => {
  const r = parseExcuseRequest(body({ orgId: "other", managerId: "x", role: "org_admin", decidedBy: "me" }), TODAY);
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.value).sort(), ["dayKey", "employeeIds", "reason"]);
  const n = parseNoteRequest({ dayKey: "2026-10-16", note: "Waited at the door", employeeId: "someone-else" }, TODAY);
  assert.ok(n.ok);
  assert.deepEqual(Object.keys(n.value).sort(), ["dayKey", "note"], "the note belongs to the caller; no person in the body");
});

test("revoke needs a day, a person and a reason", () => {
  const ok = parseRevokeRequest({ dayKey: "2026-10-16", employeeId: " a ", reason: "Excused by mistake" }, TODAY);
  assert.ok(ok.ok);
  assert.equal(ok.value.employeeId, "a");
  assert.equal(parseRevokeRequest({ dayKey: "2026-10-16", employeeId: "a" }, TODAY).ok, false);
  assert.equal(parseRevokeRequest({ dayKey: "2026-09-01", employeeId: "a", reason: "xxx" }, TODAY).ok, false);
  assert.equal(parseRevokeRequest({ dayKey: "2026-10-16", employeeId: "", reason: "xxx" }, TODAY).ok, false);
  assert.equal(parseRevokeRequest(null, TODAY).ok, false);
});

test("note: short plain text, only inside the window", () => {
  assert.ok(parseNoteRequest({ dayKey: TODAY, note: "Bus broke down" }, TODAY).ok);
  assert.equal(parseNoteRequest({ dayKey: TODAY, note: "" }, TODAY).ok, false);
  assert.equal(parseNoteRequest({ dayKey: TODAY, note: "x".repeat(NOTE_MAX + 1) }, TODAY).ok, false);
  assert.equal(parseNoteRequest({ dayKey: "2026-09-01", note: "late" }, TODAY).ok, false);
  assert.equal(parseNoteRequest({ dayKey: "2026-10-18", note: "late" }, TODAY).ok, false);
});

test("who may excuse whom", () => {
  const admin = { uid: "adm", role: "org_admin" };
  const mgr = { uid: "m1", role: "manager" };
  const emp = { uid: "e1", role: "employee" };
  // admin: anyone, including a manager's own late and their own
  assert.ok(canExcuse(admin, { employeeId: "e9", managerId: "m2" }));
  assert.ok(canExcuse(admin, { employeeId: "m1", managerId: "m1" }));
  assert.ok(canExcuse(admin, { employeeId: "adm", managerId: null }));
  // manager: own team only
  assert.ok(canExcuse(mgr, { employeeId: "e2", managerId: "m1" }));
  assert.ok(!canExcuse(mgr, { employeeId: "e9", managerId: "m2" }), "another team");
  assert.ok(!canExcuse(mgr, { employeeId: "m2", managerId: "m2" }), "another manager");
  assert.ok(!canExcuse(mgr, { employeeId: "m1", managerId: "m1" }), "a manager cannot excuse their own late");
  assert.ok(!canExcuse(mgr, { employeeId: "e2", managerId: null }), "unfiled day");
  // everyone else: no
  assert.ok(!canExcuse(emp, { employeeId: "e1", managerId: "m1" }), "an employee cannot excuse themself");
  assert.ok(!canExcuse({ uid: "x", role: null }, { employeeId: "e1", managerId: "m1" }));
  assert.ok(!canExcuse({ uid: "", role: "org_admin" }, { employeeId: "e1", managerId: "m1" }));
  assert.ok(!canExcuse(null, { employeeId: "e1", managerId: "m1" }));
  assert.ok(!canExcuse(admin, { employeeId: "", managerId: "m1" }));
});

test("only a day that was actually late can be excused, once", () => {
  assert.equal(excuseDecision(null), "no_record");
  assert.equal(excuseDecision(undefined), "no_record");
  assert.equal(excuseDecision({ late: true }), "no_record", "no first-in means no real scan");
  assert.equal(excuseDecision({ firstIn: "x", late: false }), "not_late");
  assert.equal(excuseDecision({ firstIn: "x" }), "not_late");
  assert.equal(excuseDecision({ firstIn: "x", late: "true" }), "not_late", "only a real boolean counts");
  assert.equal(excuseDecision({ firstIn: "x", late: true, lateExcused: true }), "already_excused");
  assert.equal(excuseDecision({ firstIn: "x", late: true }), "ok");
});

test("what the screens count: late and not excused", () => {
  assert.equal(isEffectivelyLate({ late: true }), true);
  assert.equal(isEffectivelyLate({ late: true, lateExcused: true }), false);
  assert.equal(isEffectivelyLate({ late: true, lateExcused: false }), true);
  assert.equal(isEffectivelyLate({ late: false }), false);
  assert.equal(isEffectivelyLate({}), false);
  assert.equal(isEffectivelyLate(null), false);
});

test("the original late flag is never changed by an excuse", () => {
  const stored = Object.freeze({ firstIn: "2026-10-16T08:41:00Z", late: true });
  const stamp = stampFor("excused");
  assert.deepEqual(stamp, { lateExcused: true });
  const after = { ...stored, ...stamp };
  assert.equal(after.late, true, "late stays as recorded");
  assert.equal(after.firstIn, stored.firstIn);
  assert.equal(stampFor("revoked"), null, "revoking removes the stamp");
});

test("arrival-time helper ticks people who arrived by the cutoff, not later", () => {
  const arrivals = [
    { employeeId: "a", arrivedAt: "08:05" },
    { employeeId: "b", arrivedAt: "08:40" },
    { employeeId: "c", arrivedAt: "08:41" },
    { employeeId: "d", arrivedAt: "10:30" },
    { employeeId: "e", arrivedAt: "bad" },
    { employeeId: "f", arrivedAt: "" },
  ];
  assert.deepEqual(arrivedByCutoff(arrivals, "08:40"), ["a", "b"]);
  assert.deepEqual(arrivedByCutoff(arrivals, "23:59"), ["a", "b", "c", "d"]);
  assert.deepEqual(arrivedByCutoff(arrivals, "00:00"), []);
  assert.deepEqual(arrivedByCutoff(arrivals, "8:40"), [], "a malformed cutoff ticks nobody");
  assert.deepEqual(arrivedByCutoff(arrivals, "24:00"), []);
  assert.deepEqual(arrivedByCutoff([], "08:40"), []);
});

test("history keeps the newest ten, oldest dropped, and never mutates the input", () => {
  let h = [];
  for (let i = 0; i < HISTORY_MAX + 3; i++) {
    const next = appendHistory(h, { action: i % 2 ? "revoked" : "excused", by: "m", at: `t${i}`, reason: `r${i}` });
    assert.notEqual(next, h);
    h = next;
  }
  assert.equal(h.length, HISTORY_MAX);
  assert.equal(h[0].at, "t3");
  assert.equal(h.at(-1).at, `t${HISTORY_MAX + 2}`);
  const frozen = Object.freeze([]);
  assert.equal(appendHistory(frozen, { action: "excused", by: "m", at: "t", reason: "rr" }).length, 1);
  assert.equal(appendHistory(undefined, { action: "excused", by: "m", at: "t", reason: "rr" }).length, 1);
});

import { buildReviewRows, REVIEW_ROW_CAP } from "../../src/lib/late-excuse.ts";

test("review rows: only real late days, excused ones included, ordered newest day then earliest arrival", () => {
  const clock = (iso) => iso.slice(11, 16);
  const sum = (employeeId, dayKey, hhmm, extra = {}) => ({
    employeeId, employeeName: employeeId.toUpperCase(), department: "Ops", dayKey,
    firstIn: `${dayKey}T${hhmm}:00.000Z`, late: true, ...extra,
  });
  const excuses = new Map([
    ["b_2026-10-16", { employeeNote: "Waited at the door", reason: "Tablet late", decidedByName: "Adwoa" }],
    ["c_2026-10-16", { employeeNote: "Bus", reason: "should not show: not excused" }],
  ]);
  const { rows, truncated } = buildReviewRows({
    summaries: [
      sum("a", "2026-10-15", "09:10"),
      sum("c", "2026-10-16", "10:30"),
      sum("b", "2026-10-16", "08:41", { lateExcused: true }),
      { ...sum("d", "2026-10-16", "08:00"), late: false },
      { ...sum("e", "2026-10-16", "08:05"), firstIn: null },
      { ...sum("f", "bad-day", "08:05") },
      { employeeName: "no id", dayKey: "2026-10-16", firstIn: "x", late: true },
    ],
    excuses, clock,
  });
  assert.equal(truncated, false);
  assert.deepEqual(rows.map((r) => `${r.dayKey} ${r.arrivedAt} ${r.employeeId}`), [
    "2026-10-16 08:41 b", "2026-10-16 10:30 c", "2026-10-15 09:10 a",
  ]);
  const b = rows[0];
  assert.equal(b.excused, true);
  assert.equal(b.reason, "Tablet late");
  assert.equal(b.decidedByName, "Adwoa");
  assert.equal(b.note, "Waited at the door");
  const c = rows[1];
  assert.equal(c.excused, false);
  assert.equal(c.reason, "", "a reason is only shown for an excused day");
  assert.equal(c.note, "Bus", "the employee's note is shown either way");
});

test("review rows: capped, and says so", () => {
  const many = Array.from({ length: REVIEW_ROW_CAP + 5 }, (_, i) => ({
    employeeId: `e${i}`, dayKey: "2026-10-16", firstIn: "2026-10-16T08:00:00.000Z", late: true,
  }));
  const r = buildReviewRows({ summaries: many, excuses: new Map(), clock: () => "08:00" });
  assert.equal(r.rows.length, REVIEW_ROW_CAP);
  assert.equal(r.truncated, true);
  assert.equal(r.rows[0].name, "Employee", "a missing name never shows an id");
});
