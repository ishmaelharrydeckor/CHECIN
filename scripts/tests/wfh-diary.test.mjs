import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  DIARY_INTERVAL_MS,
  DIARY_MAX_INTERVALS,
  LIVENESS_RESPONSE_MS,
  answerLivenessCheck,
  buildDaySummary,
  checkIntervalTiming,
  classifyInterval,
  deriveSessionKey,
  intervalWindow,
  livenessResult,
  parseIntervalReport,
  parseLivenessPerHour,
  patternFlags,
  planLivenessChecks,
  safeEqualHex,
  signingPayload,
  summarizeMinutes,
  verifyIntervalSignature,
} from "../../src/lib/wfh-diary.ts";

// Work-from-home diary engine (task 2.3b, phase 1; docs/WFH-DIARY-DESIGN.md).
// Times are plain milliseconds passed in: the engine never reads a clock.
const MIN = 60_000;
const START = Date.UTC(2026, 9, 19, 8, 0, 0); // 08:00 UTC
const hmac = (key, msg) => createHmac("sha256", key).update(msg).digest("hex");
const COUNTS = { keys: 120, clicks: 30, scrolls: 12, moves: 400 };
const REPORT = (index, over = {}) => ({ index, counts: { ...COUNTS }, activeMinutes: 7, visibleSeconds: 540, gapCv: 0.8, signature: "", ...over });
const SESSION = { startedAtMs: START, endedAtMs: null, pauses: [] };

// ---------------------------------------------------------------- intervals

test("each interval is a fixed 10-minute block counted from the session start", () => {
  assert.equal(DIARY_INTERVAL_MS, 10 * MIN);
  assert.deepEqual(intervalWindow(START, 0), { startMs: START, endMs: START + 10 * MIN });
  assert.deepEqual(intervalWindow(START, 5), { startMs: START + 50 * MIN, endMs: START + 60 * MIN });
  assert.equal(DIARY_MAX_INTERVALS, 72, "12 hours at most");
});

test("an interval report is checked field by field; anything odd is refused", () => {
  const ok = parseIntervalReport({ ...REPORT(0), signature: "ab".repeat(32) });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.gapCv, 0.8);
  assert.equal(parseIntervalReport({ ...REPORT(0), gapCv: null, signature: "ab".repeat(32) }).value.gapCv, null);
  const cases = [
    [null, "not an object"],
    [{ ...REPORT(-1), signature: "ab".repeat(32) }, "negative index"],
    [{ ...REPORT(1.5), signature: "ab".repeat(32) }, "fractional index"],
    [{ ...REPORT(72), signature: "ab".repeat(32) }, "past 12 hours"],
    [{ ...REPORT(0, { counts: { ...COUNTS, keys: -1 } }), signature: "ab".repeat(32) }, "negative count"],
    [{ ...REPORT(0, { counts: { ...COUNTS, moves: 1e9 } }), signature: "ab".repeat(32) }, "absurd count"],
    [{ ...REPORT(0, { counts: { keys: 1, clicks: 1, scrolls: 1 } }), signature: "ab".repeat(32) }, "missing count"],
    [{ ...REPORT(0, { counts: { ...COUNTS, text: 1 } }), signature: "ab".repeat(32) }, "extra count type"],
    [{ ...REPORT(0, { activeMinutes: 11 }), signature: "ab".repeat(32) }, "more than 10 active minutes"],
    [{ ...REPORT(0, { visibleSeconds: 601 }), signature: "ab".repeat(32) }, "more than 600 visible seconds"],
    [{ ...REPORT(0, { gapCv: -0.1 }), signature: "ab".repeat(32) }, "negative regularity"],
    [{ ...REPORT(0), signature: "not-hex" }, "bad signature"],
    [{ ...REPORT(0), signature: "ab".repeat(32), url: "https://example.com" }, "content is never accepted"],
  ];
  for (const [raw, why] of cases) assert.equal(parseIntervalReport(raw).ok, false, why);
});

test("timing: an interval is accepted only once it has finished, inside the session, and only once", () => {
  const done = START + 10 * MIN;
  assert.equal(checkIntervalTiming({ session: SESSION, index: 0, nowMs: done, existing: new Map() }).ok, true);
  const early = checkIntervalTiming({ session: SESSION, index: 0, nowMs: done - 1, existing: new Map() });
  assert.equal(early.ok, false, "not in the future: the interval has not ended yet");
  assert.equal(early.status, 400);
  // Ended session: nothing after the end; a part-interval at the end is not accepted.
  const ended = { ...SESSION, endedAtMs: START + 25 * MIN };
  assert.equal(checkIntervalTiming({ session: ended, index: 1, nowMs: START + 2 * 60 * MIN, existing: new Map() }).ok, true);
  assert.equal(checkIntervalTiming({ session: ended, index: 2, nowMs: START + 2 * 60 * MIN, existing: new Map() }).ok, false);
  // No more than 12 hours.
  assert.equal(checkIntervalTiming({ session: SESSION, index: 72, nowMs: START + 13 * 60 * MIN, existing: new Map() }).ok, false);
});

test("a retried interval is accepted once; a different one for the same block is refused", () => {
  const existing = new Map([[3, "hashA"]]);
  const same = checkIntervalTiming({ session: SESSION, index: 3, nowMs: START + 60 * MIN, existing, payloadHash: "hashA" });
  assert.deepEqual(same, { ok: true, duplicate: true }, "the same report again changes nothing");
  const other = checkIntervalTiming({ session: SESSION, index: 3, nowMs: START + 60 * MIN, existing, payloadHash: "hashB" });
  assert.equal(other.ok, false);
  assert.equal(other.status, 409, "no overlap: one report per block");
});

// ---------------------------------------------------------------- signing

test("each session has its own key, derived on the server, so the database never holds it", () => {
  const k1 = deriveSessionKey("server-secret", "sess1", hmac);
  const k2 = deriveSessionKey("server-secret", "sess2", hmac);
  assert.match(k1, /^[0-9a-f]{64}$/);
  assert.notEqual(k1, k2);
  assert.equal(deriveSessionKey("server-secret", "sess1", hmac), k1, "the same session always gets the same key");
  assert.notEqual(deriveSessionKey("other-secret", "sess1", hmac), k1);
  assert.throws(() => deriveSessionKey("", "sess1", hmac), "a missing secret is an error, never a fallback");
});

test("a signed interval verifies only for its own session, block and numbers", () => {
  const key = deriveSessionKey("server-secret", "sess1", hmac);
  const report = REPORT(4);
  report.signature = hmac(key, signingPayload("sess1", report));
  assert.equal(verifyIntervalSignature({ sessionId: "sess1", report, key, hmac }), true);
  assert.equal(verifyIntervalSignature({ sessionId: "sess2", report, key, hmac }), false, "copied into another session");
  assert.equal(verifyIntervalSignature({ sessionId: "sess1", report: { ...report, index: 5 }, key, hmac }), false, "shifted to another block");
  assert.equal(verifyIntervalSignature({ sessionId: "sess1", report: { ...report, counts: { ...COUNTS, keys: 999 } }, key, hmac }), false, "numbers changed");
  assert.equal(verifyIntervalSignature({ sessionId: "sess1", report: { ...report, activeMinutes: 10 }, key, hmac }), false);
  const otherKey = deriveSessionKey("server-secret", "sess9", hmac);
  assert.equal(verifyIntervalSignature({ sessionId: "sess1", report, key: otherKey, hmac }), false);
});

test("the signing text is fixed and versioned, so both sides build the same string", () => {
  assert.equal(signingPayload("s", REPORT(2)), "v1|s|2|120|30|12|400|7|540|0.8");
  assert.equal(signingPayload("s", REPORT(2, { gapCv: null })), "v1|s|2|120|30|12|400|7|540|-");
});

test("signatures are compared in constant time and only as same-length hex", () => {
  assert.equal(safeEqualHex("abcd", "abcd"), true);
  assert.equal(safeEqualHex("abcd", "abce"), false);
  assert.equal(safeEqualHex("abcd", "abcdef"), false);
  assert.equal(safeEqualHex("zz", "zz"), false, "not hex");
});

// ---------------------------------------------------------------- liveness

test("still-here checks: 0 to 4 an hour, 2 by default", () => {
  assert.deepEqual(parseLivenessPerHour(undefined), { ok: true, value: 2 });
  for (const n of [0, 1, 2, 3, 4]) assert.deepEqual(parseLivenessPerHour(n), { ok: true, value: n });
  for (const bad of [-1, 5, 1.5, "2", null]) assert.equal(parseLivenessPerHour(bad).ok, false, String(bad));
});

test("checks are spread one per slot of the hour, at unpredictable times, each with time to answer", () => {
  let seed = 0.123;
  const random = () => ((seed = (seed * 9301 + 0.49297) % 1), seed);
  const hour = START + 60 * MIN;
  const checks = planLivenessChecks({ hourStartMs: hour, perHour: 3, random });
  assert.equal(checks.length, 3);
  const slot = (60 * MIN) / 3;
  checks.forEach((c, i) => {
    assert.ok(c.dueAtMs >= hour + i * slot, "inside its own slot");
    assert.ok(c.dueAtMs + LIVENESS_RESPONSE_MS <= hour + (i + 1) * slot, "the 90 seconds to answer fit in the slot");
  });
  assert.equal(planLivenessChecks({ hourStartMs: hour, perHour: 0, random }).length, 0);
  // The extremes of the random number still land inside the slot.
  const lo = planLivenessChecks({ hourStartMs: hour, perHour: 4, random: () => 0 });
  const hi = planLivenessChecks({ hourStartMs: hour, perHour: 4, random: () => 0.999999 });
  lo.concat(hi).forEach((c) => assert.ok(c.dueAtMs >= hour && c.dueAtMs + LIVENESS_RESPONSE_MS <= hour + 60 * MIN));
  assert.notDeepEqual(
    planLivenessChecks({ hourStartMs: hour, perHour: 2, random: () => 0.1 }).map((c) => c.dueAtMs),
    planLivenessChecks({ hourStartMs: hour, perHour: 2, random: () => 0.7 }).map((c) => c.dueAtMs),
    "times depend on the server's random numbers",
  );
});

test("an answer counts only with the right one-time code, within 90 seconds, once", () => {
  const check = { dueAtMs: START + 5 * MIN, code: "c0de", answeredAtMs: null };
  assert.deepEqual(answerLivenessCheck({ check, code: "c0de", nowMs: check.dueAtMs + 30_000 }), { ok: true, answeredAtMs: check.dueAtMs + 30_000 });
  assert.equal(answerLivenessCheck({ check, code: "c0de", nowMs: check.dueAtMs + LIVENESS_RESPONSE_MS }).ok, true, "exactly 90 seconds is in time");
  const cases = [
    [{ check, code: "nope", nowMs: check.dueAtMs + 1000 }, "wrong_code"],
    [{ check, code: "c0de", nowMs: check.dueAtMs - 1 }, "not_yet"],
    [{ check, code: "c0de", nowMs: check.dueAtMs + LIVENESS_RESPONSE_MS + 1 }, "too_late"],
    [{ check: { ...check, answeredAtMs: check.dueAtMs + 5000 }, code: "c0de", nowMs: check.dueAtMs + 6000 }, "already_answered"],
  ];
  for (const [input, reason] of cases) assert.equal(answerLivenessCheck(input).reason, reason, reason);
});

test("an interval's liveness: ok, missed, or still waiting for an answer", () => {
  const w = intervalWindow(START, 1); // 08:10 to 08:20
  const answered = { dueAtMs: START + 12 * MIN, code: "a", answeredAtMs: START + 12 * MIN + 20_000 };
  const missed = { dueAtMs: START + 14 * MIN, code: "b", answeredAtMs: null };
  const late = { dueAtMs: START + 19.5 * MIN, code: "c", answeredAtMs: null };
  const elsewhere = { dueAtMs: START + 30 * MIN, code: "d", answeredAtMs: null };
  assert.equal(livenessResult(w, [], START + 21 * MIN), "ok", "no check fell in this block");
  assert.equal(livenessResult(w, [answered, elsewhere], START + 21 * MIN), "ok");
  assert.equal(livenessResult(w, [answered, missed], START + 21 * MIN), "missed");
  assert.equal(livenessResult(w, [late], START + 20.5 * MIN), "pending", "its 90 seconds are not over");
  assert.equal(livenessResult(w, [late], START + 21.1 * MIN), "missed");
});

// ---------------------------------------------------------------- verified time

test("an interval is verified only when signed correctly, still-here checks passed, and not paused", () => {
  const w = intervalWindow(START, 2);
  assert.deepEqual(classifyInterval({ window: w, signatureOk: true, liveness: "ok", pauses: [] }), { state: "verified", reasons: [] });
  assert.deepEqual(classifyInterval({ window: w, signatureOk: false, liveness: "ok", pauses: [] }), { state: "unverified", reasons: ["bad_signature"] });
  assert.deepEqual(classifyInterval({ window: w, signatureOk: true, liveness: "missed", pauses: [] }), { state: "unverified", reasons: ["missed_check"] });
  assert.equal(classifyInterval({ window: w, signatureOk: true, liveness: "pending", pauses: [] }).state, "pending");
  const pause = { fromMs: w.startMs + 3 * MIN, toMs: w.startMs + 4 * MIN };
  assert.equal(classifyInterval({ window: w, signatureOk: true, liveness: "ok", pauses: [pause] }).state, "paused", "any pause inside the block");
  const open = { fromMs: w.startMs - 30 * MIN, toMs: null };
  assert.equal(classifyInterval({ window: w, signatureOk: true, liveness: "ok", pauses: [open] }).state, "paused", "a pause still running");
  const before = { fromMs: w.startMs - 5 * MIN, toMs: w.startMs };
  assert.equal(classifyInterval({ window: w, signatureOk: true, liveness: "ok", pauses: [before] }).state, "verified", "a pause that ended exactly at the start");
  // Activity is context only: a verified interval needs no keys or clicks.
  assert.equal(classifyInterval({ window: w, signatureOk: true, liveness: "ok", pauses: [] }).state, "verified");
});

test("hours are verified intervals times 10 minutes; nothing else counts", () => {
  const states = ["verified", "verified", "unverified", "paused", "verified", "pending"].map((state) => ({ state }));
  assert.deepEqual(summarizeMinutes(states), { verifiedMinutes: 30, unverifiedMinutes: 10, pausedMinutes: 10, pendingMinutes: 10 });
  assert.deepEqual(summarizeMinutes([]), { verifiedMinutes: 0, unverifiedMinutes: 0, pausedMinutes: 0, pendingMinutes: 0 });
});

// ---------------------------------------------------------------- pattern flags

const ROW = (index, over = {}) => ({ index, counts: { ...COUNTS, keys: 100 + index * 7, moves: 300 + index * 13 }, activeMinutes: 6 + (index % 4), visibleSeconds: 500, gapCv: 0.7 + (index % 3) / 10, ...over });
const codes = (flags) => flags.map((f) => f.code).sort();

test("an ordinary day raises no flags", () => {
  const day = Array.from({ length: 30 }, (_, i) => ROW(i, i % 9 === 0 ? { activeMinutes: 2 } : {}));
  assert.deepEqual(patternFlags(day, [21_000, 48_000, 9_500, 33_000]), []);
  assert.deepEqual(patternFlags([], []), []);
});

test("identical counts three blocks in a row look automated; two do not", () => {
  const same = { counts: { keys: 50, clicks: 5, scrolls: 0, moves: 200 } };
  const two = [ROW(0), ROW(1, same), ROW(2, same), ROW(3)];
  assert.deepEqual(codes(patternFlags(two, [])), []);
  const three = [ROW(0), ROW(1, same), ROW(2, same), ROW(3, same), ROW(4)];
  const f = patternFlags(three, []);
  assert.deepEqual(codes(f), ["identical_counts"]);
  assert.deepEqual(f[0].indexes, [1, 2, 3]);
  // Three identical empty blocks are just idle, not automation.
  const zero = { counts: { keys: 0, clicks: 0, scrolls: 0, moves: 0 }, activeMinutes: 0 };
  assert.ok(!codes(patternFlags([ROW(0, zero), ROW(1, zero), ROW(2, zero)], [])).includes("identical_counts"));
  // Not consecutive blocks (a gap) do not count as a row.
  assert.deepEqual(codes(patternFlags([ROW(1, same), ROW(2, same), ROW(4, same)], [])), []);
});

test("too regular: machine-like input timing, or answers always after the same delay", () => {
  const metronome = { gapCv: 0.01 };
  const day = [ROW(0, metronome), ROW(1, metronome), ROW(2), ROW(3, metronome)];
  assert.deepEqual(codes(patternFlags(day, [])), ["too_regular"], "three blocks with near-zero variation");
  assert.deepEqual(codes(patternFlags([ROW(0, metronome), ROW(1, metronome)], [])), [], "two are not enough");
  const quiet = (n) => ({ gapCv: 0.01, counts: { keys: 2, clicks: 0, scrolls: 0, moves: 3 + n } });
  assert.deepEqual(codes(patternFlags([ROW(0, quiet(0)), ROW(1, quiet(1)), ROW(2, quiet(2))], [])), [], "too few events to judge");
  assert.deepEqual(codes(patternFlags([], [12_000, 12_050, 12_100])), ["too_regular"], "answers within 0.3 s of each other");
  assert.deepEqual(codes(patternFlags([], [12_000, 12_050])), [], "two answers are not a pattern");
  assert.deepEqual(codes(patternFlags([], [12_000, 30_000, 12_100])), []);
});

test("movement with no clicks or keys for two hours looks like a mouse jiggler", () => {
  // Moves vary a little each block, so this is not also "identical counts".
  const jiggle = (i) => ({ counts: { keys: 0, clicks: 0, scrolls: 0, moves: 900 + i } });
  const eleven = Array.from({ length: 11 }, (_, i) => ROW(i, jiggle(i)));
  assert.deepEqual(codes(patternFlags(eleven, [])), [], "1 hour 50 minutes is not yet two hours");
  const twelve = Array.from({ length: 12 }, (_, i) => ROW(i, jiggle(i)));
  const f = patternFlags(twelve, []);
  assert.ok(codes(f).includes("moves_only"));
  assert.equal(f.find((x) => x.code === "moves_only").indexes.length, 12);
  const broken = Array.from({ length: 12 }, (_, i) => ROW(i, i === 6 ? {} : jiggle(i)));
  assert.ok(!codes(patternFlags(broken, [])).includes("moves_only"), "one block with a click breaks the run");
});

test("input while the page was hidden cannot come from a person, so it is flagged", () => {
  const f = patternFlags([ROW(0), ROW(1, { visibleSeconds: 0 }), ROW(2, { visibleSeconds: 0, counts: { keys: 0, clicks: 0, scrolls: 0, moves: 0 }, activeMinutes: 0 })], []);
  assert.deepEqual(codes(f), ["active_while_hidden", "no_activity"]);
  assert.deepEqual(f.find((x) => x.code === "active_while_hidden").indexes, [1], "a hidden block with no input is fine");
});

test("never a single idle stretch over three hours looks automated", () => {
  const busy = { activeMinutes: 10 };
  const day = Array.from({ length: 18 }, (_, i) => ROW(i, busy));
  assert.ok(codes(patternFlags(day, [])).includes("never_idle"));
  assert.ok(!codes(patternFlags(day.slice(0, 17), [])).includes("never_idle"), "under three hours is not judged");
  const withBreak = day.map((r, i) => (i === 9 ? { ...r, activeMinutes: 9 } : r));
  assert.ok(!codes(patternFlags(withBreak, [])).includes("never_idle"), "one minute of idle is enough");
});

test("blocks with no activity at all are noted for the manager, as information", () => {
  const empty = { counts: { keys: 0, clicks: 0, scrolls: 0, moves: 0 }, activeMinutes: 0 };
  const f = patternFlags([ROW(0), ROW(1, empty)], []);
  assert.deepEqual(codes(f), ["no_activity"]);
  assert.equal(f[0].severity, "info");
});

test("every flag has a plain sentence and the blocks it is about, and never changes the minutes", () => {
  const jiggle = { counts: { keys: 0, clicks: 0, scrolls: 0, moves: 900 }, visibleSeconds: 0 };
  const flags = patternFlags(Array.from({ length: 12 }, (_, i) => ROW(i, jiggle)), [5000, 5000, 5000]);
  assert.ok(flags.length >= 3);
  for (const f of flags) {
    assert.ok(f.text.length > 10 && !/automatically|penal/i.test(f.text), f.code);
    assert.ok(Array.isArray(f.indexes));
    assert.ok(f.severity === "review" || f.severity === "info");
  }
});

// ---------------------------------------------------------------- day summary

test("the day summary adds up the minutes and lists each flag once, waiting for the manager", () => {
  const rows = [
    { index: 0, state: "verified" },
    { index: 1, state: "verified" },
    { index: 2, state: "unverified" },
    { index: 3, state: "paused" },
  ];
  const flags = [{ code: "no_activity", severity: "info", indexes: [3], text: "x" }, { code: "too_regular", severity: "review", indexes: [], text: "y" }];
  const s = buildDaySummary({ intervals: rows, flags, previous: null });
  assert.equal(s.verifiedMinutes, 20);
  assert.equal(s.unverifiedMinutes, 10);
  assert.equal(s.pausedMinutes, 10);
  assert.equal(s.intervalCount, 4);
  assert.deepEqual(s.flags, ["no_activity", "too_regular"]);
  assert.equal(s.reviewFlags, 1, "only flags that need a look are counted for the 'flagged days' column");
  assert.equal(s.status, "pending");
  assert.equal(s.decidedBy, null);
});

test("a decision stands only while the day's figures stay the same", () => {
  const rows = [{ index: 0, state: "verified" }];
  const decided = { ...buildDaySummary({ intervals: rows, flags: [], previous: null }), status: "approved", decidedBy: "mgr", decidedAt: "2026-10-19T18:00:00.000Z" };
  const again = buildDaySummary({ intervals: rows, flags: [], previous: decided });
  assert.equal(again.status, "approved", "a rebuild with the same figures keeps the approval");
  assert.equal(again.decidedBy, "mgr");
  const more = buildDaySummary({ intervals: [...rows, { index: 1, state: "verified" }], flags: [], previous: decided });
  assert.equal(more.status, "pending", "time added after approval needs a new look");
  assert.equal(more.decidedBy, null);
  const newFlag = buildDaySummary({ intervals: rows, flags: [{ code: "too_regular", severity: "review", indexes: [], text: "y" }], previous: decided });
  assert.equal(newFlag.status, "pending", "a new flag after approval needs a new look");
});

// ---------------------------------------------------------------- boundaries

test("boundaries: a block ending exactly when the session stops counts; a check due exactly at a block's end belongs to the next", () => {
  const ended = { ...SESSION, endedAtMs: START + 20 * MIN };
  assert.equal(checkIntervalTiming({ session: ended, index: 1, nowMs: START + 20 * MIN, existing: new Map() }).ok, true);
  const w0 = intervalWindow(START, 0);
  const atEnd = { dueAtMs: w0.endMs, code: "x", answeredAtMs: null };
  assert.equal(livenessResult(w0, [atEnd], w0.endMs + 5 * MIN), "ok", "not this block's check");
  assert.equal(livenessResult(intervalWindow(START, 1), [atEnd], w0.endMs + 5 * MIN), "missed");
  const pauseFromEnd = { fromMs: w0.endMs, toMs: w0.endMs + MIN };
  assert.equal(classifyInterval({ window: w0, signatureOk: true, liveness: "ok", pauses: [pauseFromEnd] }).state, "verified");
});

test("a stored block with no hash to compare is never silently accepted again", () => {
  const r = checkIntervalTiming({ session: SESSION, index: 0, nowMs: START + 60 * MIN, existing: new Map([[0, "h"]]) });
  assert.equal(r.ok, false);
});

test("a paused block with a bad signature is shown as paused, with both reasons kept", () => {
  const w = intervalWindow(START, 0);
  const r = classifyInterval({ window: w, signatureOk: false, liveness: "missed", pauses: [{ fromMs: w.startMs, toMs: null }] });
  assert.deepEqual(r, { state: "paused", reasons: ["paused", "bad_signature", "missed_check"] });
});

test("the engine stays pure: no Firebase, no app imports, no clock, no randomness of its own", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/lib/wfh-diary.ts", "utf8");
  assert.ok(!/from "@\//.test(src), "relative imports only");
  assert.ok(!/firebase/i.test(src.replace(/No Firebase/g, "")));
  assert.ok(!/Date\.now\(|new Date\(|Math\.random\(/.test(src), "times and random numbers are passed in");
  assert.ok(!/geolocation|navigator\./.test(src), "no GPS, no browser access");
});
