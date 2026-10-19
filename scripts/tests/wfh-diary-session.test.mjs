import test from "node:test";
import assert from "node:assert/strict";
import {
  DIARY_CONSENT_TEXT,
  DIARY_CONSENT_VERSION,
  DIARY_INTERVAL_MS,
  LIVENESS_RESPONSE_MS,
  canDecideDay,
  decideDay,
  diaryDocId,
  evaluateSession,
  intervalDocId,
  nextSessionState,
  parseDiaryAction,
  parseDiarySettingsInput,
  readDiarySettings,
  sessionEndMs,
  upcomingChecks,
} from "../../src/lib/wfh-diary.ts";

// Work-from-home diary, phase 2: the rules the routes use (task 2.3b; docs/WFH-DIARY-DESIGN.md).
const MIN = 60_000;
const START = Date.UTC(2026, 9, 20, 8, 0, 0);
const COUNTS = { keys: 80, clicks: 20, scrolls: 5, moves: 300 };
const ROW = (index, over = {}) => ({ index, counts: { ...COUNTS, keys: 80 + index }, activeMinutes: 6, visibleSeconds: 550, gapCv: 0.8, signatureOk: true, ...over });
const SESSION = { startedAtMs: START, endedAtMs: null, pauses: [], status: "active" };

// ---------------------------------------------------------------- settings and ids

test("the diary is off until an admin switches it on; checks default to 2 an hour, detail kept 12 months", () => {
  assert.deepEqual(readDiarySettings(undefined), { enabled: false, livenessPerHour: 2, retentionMonths: 12 });
  assert.deepEqual(readDiarySettings({ wfhDiaryEnabled: true, livenessChecksPerHour: 4, diaryRetentionMonths: 6 }), { enabled: true, livenessPerHour: 4, retentionMonths: 6 });
  assert.deepEqual(readDiarySettings({ wfhDiaryEnabled: "yes", livenessChecksPerHour: 9, diaryRetentionMonths: -1 }), { enabled: false, livenessPerHour: 2, retentionMonths: 12 }, "bad stored values fall back to the safe defaults");
});

test("the admin's settings form accepts only the three diary settings, within range", () => {
  assert.deepEqual(parseDiarySettingsInput({ wfhDiaryEnabled: true }), { ok: true, value: { wfhDiaryEnabled: true } });
  assert.deepEqual(parseDiarySettingsInput({ livenessChecksPerHour: 0, diaryRetentionMonths: 24 }), { ok: true, value: { livenessChecksPerHour: 0, diaryRetentionMonths: 24 } });
  for (const bad of [{}, null, { wfhDiaryEnabled: "true" }, { livenessChecksPerHour: 5 }, { diaryRetentionMonths: 0 }, { diaryRetentionMonths: 61 }, { diaryCountsTowardOvertime: true }, { orgId: "x" }]) {
    assert.equal(parseDiarySettingsInput(bad).ok, false, JSON.stringify(bad));
  }
});

test("one session and one day summary per person per day; one stored interval per block", () => {
  assert.equal(diaryDocId("u1", "2026-10-20"), "u1_2026-10-20");
  assert.equal(intervalDocId("u1_2026-10-20", 7), "u1_2026-10-20_7");
  assert.throws(() => diaryDocId("a/b", "2026-10-20"));
  assert.throws(() => diaryDocId("u1", "20-10-2026"));
});

test("the consent wording says what is recorded and what never is, with a version", () => {
  assert.match(DIARY_CONSENT_TEXT, /never records what you type or see/);
  assert.match(DIARY_CONSENT_TEXT, /still-here/);
  assert.equal(typeof DIARY_CONSENT_VERSION, "string");
});

// ---------------------------------------------------------------- requests

test("each request is read strictly: known actions, known fields, nothing about who is asking", () => {
  assert.deepEqual(parseDiaryAction({ action: "start", requestId: "r-1" }), { ok: true, value: { action: "start", requestId: "r-1" } });
  assert.deepEqual(parseDiaryAction({ action: "pause" }), { ok: true, value: { action: "pause" } });
  assert.deepEqual(parseDiaryAction({ action: "consent", version: DIARY_CONSENT_VERSION }), { ok: true, value: { action: "consent", version: DIARY_CONSENT_VERSION } });
  assert.deepEqual(parseDiaryAction({ action: "answer", check: 3, code: "a1b2c3d4e5f6" }), { ok: true, value: { action: "answer", check: 3, code: "a1b2c3d4e5f6" } });
  assert.deepEqual(parseDiaryAction({ action: "decide", employeeId: "u1", dayKey: "2026-10-20", decision: "flag" }).ok, true);
  const report = { index: 0, counts: COUNTS, activeMinutes: 5, visibleSeconds: 500, gapCv: null, signature: "ab".repeat(32) };
  assert.equal(parseDiaryAction({ action: "interval", report }).ok, true);
  const refused = [
    null,
    { action: "delete" },
    { action: "start" },
    { action: "start", requestId: "r-1", employeeId: "someone-else" },
    { action: "start", requestId: "r-1", orgId: "x" },
    { action: "decide", employeeId: "u1", dayKey: "2026-02-30", decision: "approve" },
    { action: "consent", version: "0" },
    { action: "answer", check: -1, code: "a1b2c3d4e5f6" },
    { action: "answer", check: 1, code: "zz" },
    { action: "decide", employeeId: "u1", dayKey: "2026-10-20", decision: "approve", hours: 8 },
    { action: "decide", employeeId: "u1", dayKey: "bad", decision: "approve" },
    { action: "decide", employeeId: "u1", dayKey: "2026-10-20", decision: "pay" },
    { action: "interval", report: { ...report, url: "x" } },
    { action: "pause", sessionId: "x" },
  ];
  for (const raw of refused) assert.equal(parseDiaryAction(raw).ok, false, JSON.stringify(raw));
});

// ---------------------------------------------------------------- session states

test("a session can pause, resume and stop, in that order only, and lasts 12 hours at most", () => {
  const p = nextSessionState(SESSION, "pause", START + 30 * MIN);
  assert.equal(p.ok, true);
  assert.equal(p.value.status, "paused");
  assert.deepEqual(p.value.pauses, [{ fromMs: START + 30 * MIN, toMs: null }]);
  assert.equal(nextSessionState(p.value, "pause", START + 31 * MIN).ok, false, "already paused");
  const r = nextSessionState(p.value, "resume", START + 45 * MIN);
  assert.deepEqual(r.value.pauses, [{ fromMs: START + 30 * MIN, toMs: START + 45 * MIN }]);
  assert.equal(r.value.status, "active");
  assert.equal(nextSessionState(r.value, "resume", START + 46 * MIN).ok, false, "not paused");
  const s = nextSessionState(nextSessionState(r.value, "pause", START + 60 * MIN).value, "stop", START + 70 * MIN);
  assert.equal(s.value.status, "ended");
  assert.equal(s.value.endedAtMs, START + 70 * MIN);
  assert.deepEqual(s.value.pauses[1], { fromMs: START + 60 * MIN, toMs: START + 70 * MIN }, "stopping closes a running pause");
  for (const a of ["pause", "resume", "stop"]) assert.equal(nextSessionState(s.value, a, START + 80 * MIN).ok, false, `${a} after stop`);
  // Past 12 hours the session has ended on its own.
  const late = START + 12 * 60 * MIN + 1;
  assert.equal(sessionEndMs(SESSION, late), START + 12 * 60 * MIN);
  assert.equal(sessionEndMs(SESSION, START + 60 * MIN), null, "still running");
  assert.equal(nextSessionState(SESSION, "pause", late).ok, false);
});

// ---------------------------------------------------------------- checks shown to the page

test("the page is told only about checks that are due soon or still open, never the whole day", () => {
  const checks = [
    { index: 0, dueAtMs: START + 5 * MIN, code: "c0", answeredAtMs: START + 5.2 * MIN },
    { index: 1, dueAtMs: START + 25 * MIN, code: "c1", answeredAtMs: null },
    { index: 2, dueAtMs: START + 33 * MIN, code: "c2", answeredAtMs: null },
    { index: 3, dueAtMs: START + 70 * MIN, code: "c3", answeredAtMs: null },
  ];
  const now = START + 26 * MIN;
  const shown = upcomingChecks(checks, now, 2 * DIARY_INTERVAL_MS);
  assert.deepEqual(shown.map((c) => c.index), [1, 2], "answered and far-away checks are not sent");
  assert.deepEqual(Object.keys(shown[0]).sort(), ["code", "dueAtMs", "index"]);
  assert.deepEqual(upcomingChecks(checks, START + 25 * MIN + LIVENESS_RESPONSE_MS + 1, 0).map((c) => c.index), [], "a check whose time has passed is gone");
});

// ---------------------------------------------------------------- evaluating a day

test("evaluating a session: verified, missed, paused and waiting blocks, with the flags", () => {
  const session = { ...SESSION, pauses: [{ fromMs: START + 21 * MIN, toMs: START + 29 * MIN }] };
  const checks = [
    { index: 0, dueAtMs: START + 4 * MIN, code: "a", answeredAtMs: START + 4 * MIN + 15_000 },
    { index: 1, dueAtMs: START + 12 * MIN, code: "b", answeredAtMs: null },
    { index: 2, dueAtMs: START + 39.5 * MIN, code: "c", answeredAtMs: null },
  ];
  const rows = [ROW(0), ROW(1), ROW(2), ROW(3, { signatureOk: false })];
  const r = evaluateSession({ session, rows, checks, nowMs: START + 40.5 * MIN });
  assert.deepEqual(r.intervals.map((i) => i.state), ["verified", "unverified", "paused", "unverified"]);
  assert.deepEqual(r.intervals[3].reasons, ["bad_signature"]);
  const later = evaluateSession({ session, rows: [...rows.slice(0, 3), ROW(3)], checks, nowMs: START + 40.5 * MIN });
  assert.equal(later.intervals[3].state, "pending", "the check in 08:30 to 08:40 can still be answered");
  assert.deepEqual(r.answerDelaysMs, [15_000]);
  assert.deepEqual(r.flags, []);
});

test("blocks the session never reached, or after it stopped, are not evaluated", () => {
  const ended = { ...SESSION, endedAtMs: START + 20 * MIN, status: "ended" };
  const r = evaluateSession({ session: ended, rows: [ROW(0), ROW(1), ROW(5)], checks: [], nowMs: START + 2 * 60 * MIN });
  assert.deepEqual(r.intervals.map((i) => i.index), [0, 1]);
});

// ---------------------------------------------------------------- deciding a day

test("a manager decides their own team's days, an admin any day, nobody their own", () => {
  const day = { employeeId: "ann", managerId: "mgr" };
  assert.equal(canDecideDay({ uid: "mgr", role: "manager" }, day), true);
  assert.equal(canDecideDay({ uid: "mgr2", role: "manager" }, day), false);
  assert.equal(canDecideDay({ uid: "adm", role: "org_admin" }, day), true);
  assert.equal(canDecideDay({ uid: "ann", role: "employee" }, day), false);
  assert.equal(canDecideDay({ uid: "mgr", role: "manager" }, { employeeId: "mgr", managerId: "mgr" }), false, "not your own day");
  assert.equal(canDecideDay({ uid: "adm", role: "org_admin" }, { employeeId: "adm", managerId: null }), false);
});

test("a day can be decided only once the session is over and nothing is still waiting on a check", () => {
  const summary = { verifiedMinutes: 120, unverifiedMinutes: 10, pausedMinutes: 0, pendingMinutes: 0, status: "pending" };
  assert.deepEqual(decideDay({ summary, sessionOpen: false, decision: "approve" }), { ok: true, value: { status: "approved" } });
  assert.deepEqual(decideDay({ summary, sessionOpen: false, decision: "flag" }), { ok: true, value: { status: "flagged" } });
  assert.equal(decideDay({ summary, sessionOpen: true, decision: "approve" }).ok, false, "still running");
  assert.equal(decideDay({ summary: { ...summary, pendingMinutes: 10 }, sessionOpen: false, decision: "approve" }).ok, false);
  assert.equal(decideDay({ summary: { ...summary, status: "approved" }, sessionOpen: false, decision: "flag" }).ok, true, "a manager can change their mind");
  assert.equal(decideDay({ summary: { ...summary, status: "approved" }, sessionOpen: false, decision: "approve" }).ok, false, "already approved");
});
