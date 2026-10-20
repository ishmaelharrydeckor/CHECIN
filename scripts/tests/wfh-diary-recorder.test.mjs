import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  MOVE_THROTTLE_MS,
  addEvent,
  blocksToSend,
  finishBlock,
  newBlock,
  setVisible,
} from "../../src/lib/wfh-diary-recorder.ts";
import { signReport } from "../../src/lib/wfh-diary-sign.ts";
import { signingPayload } from "../../src/lib/wfh-diary.ts";

// The work-session page's recorder (task 2.3b, phase 3): counts of events inside the page only.
const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 20, 9, 0, 0);
const ev = (type, atMs, trusted = true) => ({ type, atMs, trusted });

test("only real input inside the block is counted, by type; nothing about what was typed exists here", () => {
  let b = newBlock(T0, true);
  b = addEvent(b, ev("key", T0 + 1000));
  b = addEvent(b, ev("key", T0 + 2000, false)); // made by a script: ignored
  b = addEvent(b, ev("click", T0 + 3000));
  b = addEvent(b, ev("scroll", T0 + 4000));
  b = addEvent(b, ev("move", T0 + 5000));
  b = addEvent(b, ev("key", T0 - 1)); // before the block
  b = addEvent(b, ev("key", T0 + 10 * MIN)); // after it
  const r = finishBlock(b, T0 + 10 * MIN);
  assert.deepEqual(r.counts, { keys: 1, clicks: 1, scrolls: 1, moves: 1 });
  assert.deepEqual(Object.keys(r).sort(), ["activeMinutes", "counts", "gapCv", "visibleSeconds"]);
});

test("mouse movement is counted at most four times a second", () => {
  let b = newBlock(T0, true);
  for (let t = 0; t < 1000; t += 10) b = addEvent(b, ev("move", T0 + t));
  assert.equal(finishBlock(b, T0 + 10 * MIN).counts.moves, 1000 / MOVE_THROTTLE_MS);
});

test("active minutes are the minutes of the 10 with any real input", () => {
  let b = newBlock(T0, true);
  for (const m of [0, 0, 3, 9]) b = addEvent(b, ev("click", T0 + m * MIN + 5000));
  assert.equal(finishBlock(b, T0 + 10 * MIN).activeMinutes, 3);
  assert.equal(finishBlock(newBlock(T0, true), T0 + 10 * MIN).activeMinutes, 0);
});

test("visible seconds follow the page being shown or hidden, never more than 600", () => {
  let b = newBlock(T0, true);
  b = setVisible(b, false, T0 + 2 * MIN);
  b = setVisible(b, true, T0 + 5 * MIN);
  assert.equal(finishBlock(b, T0 + 10 * MIN).visibleSeconds, 7 * 60);
  const hidden = newBlock(T0, false);
  assert.equal(finishBlock(hidden, T0 + 10 * MIN).visibleSeconds, 0);
  assert.equal(finishBlock(newBlock(T0, true), T0 + 10 * MIN).visibleSeconds, 600);
});

test("timing regularity: near zero for a metronome, higher for a person, unknown with few events", () => {
  let metro = newBlock(T0, true);
  for (let i = 0; i < 40; i++) metro = addEvent(metro, ev("key", T0 + i * 1000));
  assert.ok(finishBlock(metro, T0 + 10 * MIN).gapCv < 0.05);
  let person = newBlock(T0, true);
  const gaps = [200, 1500, 300, 4000, 250, 800, 6000, 400, 350, 2200, 900, 150];
  let t = T0;
  for (const g of gaps) person = addEvent(person, ev("key", (t += g)));
  assert.ok(finishBlock(person, T0 + 10 * MIN).gapCv > 0.5);
  let few = newBlock(T0, true);
  for (let i = 0; i < 5; i++) few = addEvent(few, ev("key", T0 + i * 1000));
  assert.equal(finishBlock(few, T0 + 10 * MIN).gapCv, null);
});

test("blocks are sent only when they finished just now: a page that slept through a block does not report it", () => {
  const start = T0;
  const end10 = start + 10 * MIN;
  assert.deepEqual(blocksToSend({ startedAtMs: start, nowMs: end10 + 5000, endMs: null, done: new Set() }), [0]);
  assert.deepEqual(blocksToSend({ startedAtMs: start, nowMs: end10 + 5000, endMs: null, done: new Set([0]) }), []);
  // Woke up 25 minutes in: blocks 0 and 1 ended long ago, so they are not invented now.
  assert.deepEqual(blocksToSend({ startedAtMs: start, nowMs: start + 25 * MIN, endMs: null, done: new Set() }), []);
  // After a stop, the last full block is sent; the part-block is not.
  assert.deepEqual(blocksToSend({ startedAtMs: start, nowMs: start + 21 * MIN, endMs: start + 21 * MIN, done: new Set([0]) }), [1]);
  assert.deepEqual(blocksToSend({ startedAtMs: start, nowMs: start + 5 * MIN, endMs: null, done: new Set() }), []);
});

test("the page signs exactly what the server checks", async () => {
  const key = "ab".repeat(32);
  const report = { index: 3, counts: { keys: 1, clicks: 2, scrolls: 3, moves: 4 }, activeMinutes: 5, visibleSeconds: 600, gapCv: 0.25 };
  const sig = await signReport(key, "u1_2026-10-20", report);
  assert.equal(sig, createHmac("sha256", key).update(signingPayload("u1_2026-10-20", report)).digest("hex"));
});

test("the recorder holds counts only: it never reads which key was pressed or what is on the screen", () => {
  const src = readFileSync("src/lib/wfh-diary-recorder.ts", "utf8");
  for (const forbidden of [/\.key\b/, /\.code\b/, /keyCode/, /innerText/, /textContent/, /clipboard/i, /screenshot/i, /location/i]) {
    assert.ok(!forbidden.test(src), String(forbidden));
  }
});

test("plain words for the page: durations, statuses and flags", async () => {
  const ui = await import("../../src/lib/wfh-diary-ui.ts");
  assert.equal(ui.formatMinutes(0), "0 min");
  assert.equal(ui.formatMinutes(45), "45 min");
  assert.equal(ui.formatMinutes(120), "2 h");
  assert.equal(ui.formatMinutes(130), "2 h 10 min");
  assert.match(ui.dayStatusLabel("approved").className, /CBEED3/);
  assert.match(ui.dayStatusLabel("flagged").className, /amber/);
  assert.equal(ui.dayStatusLabel("pending").text, "Waiting for your manager");
  assert.equal(ui.sessionStateLabel("paused"), "Paused");
  assert.deepEqual(ui.flagLines(["too_regular", "unknown"]), ["Unusually regular timing"]);
  assert.equal(ui.secondsLeft(T0, T0 + 30_000, 90_000), 60);
  assert.equal(ui.secondsLeft(T0, T0 + 200_000, 90_000), 0);
});

test("the review strip: one colour and name per block state, and a tally of the checks", async () => {
  const ui = await import("../../src/lib/wfh-diary-ui.ts");
  assert.match(ui.blockLook("verified").className, /CBEED3/);
  assert.match(ui.blockLook("unverified").className, /amber/);
  assert.equal(ui.blockLook("paused").label, "Paused");
  assert.equal(ui.blockLook("pending").label, "Waiting for a check");
  const checks = [
    { dueAtMs: T0, answeredAtMs: T0 + 5000 },
    { dueAtMs: T0 + 60_000, answeredAtMs: null },
    { dueAtMs: T0 + 10 * MIN, answeredAtMs: null },
  ];
  assert.deepEqual(ui.checkTally(checks, T0 + 10 * MIN + 30_000, 90_000), { answered: 1, missed: 1, open: 1 });
});

test("the manager's view of a day's decision", async () => {
  const ui = await import("../../src/lib/wfh-diary-ui.ts");
  assert.equal(ui.reviewStatusLabel("pending").text, "Waiting for your decision");
  assert.equal(ui.reviewStatusLabel("approved").text, "Approved");
  assert.match(ui.reviewStatusLabel("flagged").className, /amber/);
});
