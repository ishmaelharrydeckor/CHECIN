import test from "node:test";
import assert from "node:assert/strict";
import { classifyScan, countedEvents, nextDirection } from "../../src/lib/shift-lenient.ts";

// Small helpers so each test reads like a day of scans. `at` is only a label for readability.
const inn = (at) => ({ type: "in", at });
const out = (at) => ({ type: "out", at });
const outsideIn = (at) => ({ type: "in", at, outsideWindow: true });
const outsideOut = (at) => ({ type: "out", at, outsideWindow: true });

// What the summary builder will take from the counted events.
const firstIn = (events) => countedEvents(events).find((e) => e.type === "in") ?? null;
const lastOut = (events) => countedEvents(events).findLast((e) => e.type === "out") ?? null;

// ---------------------------------------------------------------- classifyScan: every mode and window
const MODE_TABLE = [
  // [mode, insideWindow, expected]
  ["strict", true, { record: true, counted: true, note: false }],
  ["lenient", true, { record: true, counted: true, note: false }],
  ["strict", false, { record: false, counted: false, note: true }],
  ["lenient", false, { record: true, counted: false, note: true }],
];

for (const [mode, insideWindow, expected] of MODE_TABLE) {
  test(`classifyScan: ${mode}, ${insideWindow ? "inside" : "outside"} the window`, () => {
    assert.deepEqual(classifyScan({ mode, insideWindow }), expected);
  });
}

test("classifyScan: a missing or unknown mode behaves as Strict (the default)", () => {
  for (const mode of [undefined, null, "", "Lenient", "LENIENT", "relaxed", 1]) {
    assert.deepEqual(classifyScan({ mode, insideWindow: false }), {
      record: false,
      counted: false,
      note: true,
    });
    assert.deepEqual(classifyScan({ mode, insideWindow: true }), {
      record: true,
      counted: true,
      note: false,
    });
  }
});

test("classifyScan: every outside-window scan writes a note; no inside-window scan does", () => {
  for (const mode of ["strict", "lenient"]) {
    assert.equal(classifyScan({ mode, insideWindow: false }).note, true);
    assert.equal(classifyScan({ mode, insideWindow: true }).note, false);
  }
});

test("classifyScan: nothing is counted that is not recorded", () => {
  for (const [mode, insideWindow] of MODE_TABLE) {
    const r = classifyScan({ mode, insideWindow });
    if (r.counted) assert.equal(r.record, true);
  }
});

test("classifyScan refuses a missing input or a non-boolean insideWindow", () => {
  assert.throws(() => classifyScan(), TypeError);
  assert.throws(() => classifyScan(null), TypeError);
  for (const bad of [undefined, null, "true", 1, 0]) {
    assert.throws(() => classifyScan({ mode: "lenient", insideWindow: bad }), TypeError);
  }
});

// ---------------------------------------------------------------- countedEvents
test("countedEvents: an empty day has no counted events", () => {
  assert.deepEqual(countedEvents([]), []);
});

test("countedEvents: a normal day keeps every event, in order", () => {
  const day = [inn("09:00"), out("12:00"), inn("13:00"), out("17:00")];
  assert.deepEqual(countedEvents(day), day);
});

test("countedEvents: drops outside-window events and keeps the rest in their original order", () => {
  const day = [outsideIn("05:00"), inn("09:00"), outsideOut("10:30"), out("17:00"), outsideIn("21:00")];
  assert.deepEqual(countedEvents(day), [inn("09:00"), out("17:00")]);
});

test("countedEvents: only exactly outsideWindow: true is dropped", () => {
  const day = [
    { type: "in", at: "a", outsideWindow: false },
    { type: "out", at: "b", outsideWindow: undefined },
    { type: "in", at: "c", outsideWindow: "true" },
    { type: "out", at: "d", outsideWindow: 1 },
  ];
  assert.deepEqual(countedEvents(day), day);
});

test("countedEvents: keeps other fields and does not change the input", () => {
  const day = Object.freeze([
    Object.freeze({ type: "in", at: "09:00", locationId: "loc1", late: true }),
    Object.freeze({ type: "out", at: "10:00", outsideWindow: true }),
  ]);
  const result = countedEvents(day);
  assert.notEqual(result, day);
  assert.deepEqual(result, [{ type: "in", at: "09:00", locationId: "loc1", late: true }]);
  assert.equal(day.length, 2);
});

test("countedEvents: drops entries that are not events and refuses a non-array", () => {
  assert.deepEqual(countedEvents([null, undefined, 5, "in", inn("09:00")]), [inn("09:00")]);
  assert.throws(() => countedEvents(), TypeError);
  assert.throws(() => countedEvents(null), TypeError);
  assert.throws(() => countedEvents({ type: "in" }), TypeError);
});

// ---------------------------------------------------------------- nextDirection: scenarios
const DIRECTION_TABLE = [
  // [description, events so far today (oldest first), expected next direction]
  ["empty day: first scan is in", [], "in"],
  ["after a normal in: out", [inn("09:00")], "out"],
  ["after a normal in and out: in", [inn("09:00"), out("17:00")], "in"],
  ["Lenient scan before the shift, then the normal scan is still an in", [outsideIn("05:00")], "in"],
  ["Lenient scan before the shift, then a normal in: next is out", [outsideIn("05:00"), inn("09:00")], "out"],
  ["outside scan after the shift ended: next is still in", [inn("09:00"), out("17:00"), outsideIn("21:00")], "in"],
  ["outside scan while checked in does not check the person out", [inn("09:00"), outsideOut("08:00")], "out"],
  ["two outside scans in a row: still in", [outsideIn("05:00"), outsideOut("05:10")], "in"],
  ["two outside scans in a row while checked in: still out", [inn("09:00"), outsideIn("19:00"), outsideOut("19:05")], "out"],
  ["only outside scans on the day: in", [outsideIn("04:00"), outsideOut("04:30"), outsideIn("23:00")], "in"],
  ["outside scan between a normal in and out does not shift the pair", [inn("09:00"), outsideIn("12:00"), out("17:00")], "in"],
];

for (const [name, events, expected] of DIRECTION_TABLE) {
  test(`nextDirection: ${name}`, () => {
    assert.equal(nextDirection(events), expected);
  });
}

test("nextDirection: adding an outside scan never changes the answer", () => {
  const days = [[], [inn("09:00")], [inn("09:00"), out("17:00")], [inn("09:00"), out("12:00"), inn("13:00")]];
  for (const day of days) {
    const before = nextDirection(day);
    assert.equal(nextDirection([...day, outsideIn("x")]), before);
    assert.equal(nextDirection([...day, outsideOut("x")]), before);
    assert.equal(nextDirection([outsideIn("x"), ...day]), before);
  }
});

test("nextDirection: order matters (the last counted event decides)", () => {
  assert.equal(nextDirection([inn("09:00"), out("17:00")]), "in");
  assert.equal(nextDirection([out("17:00"), inn("09:00")]), "out");
});

test("nextDirection: a counted event with an unknown type is skipped", () => {
  assert.equal(nextDirection([inn("09:00"), { type: "break", at: "12:00" }]), "out");
  assert.equal(nextDirection([{ type: "break", at: "12:00" }]), "in");
});

test("nextDirection refuses a non-array", () => {
  assert.throws(() => nextDirection(), TypeError);
  assert.throws(() => nextDirection(null), TypeError);
});

// ---------------------------------------------------------------- first-in, last-out and hours use counted events only
test("only outside scans on a day: the day has no first-in and no last-out", () => {
  const day = [outsideIn("04:00"), outsideOut("04:30")];
  assert.equal(firstIn(day), null);
  assert.equal(lastOut(day), null);
});

test("an outside scan before the shift is not the first-in", () => {
  const day = [outsideIn("05:00"), inn("09:00"), out("17:00")];
  assert.deepEqual(firstIn(day), inn("09:00"));
});

test("an outside scan after the shift is not the last-out", () => {
  const day = [inn("09:00"), out("17:00"), outsideOut("21:00")];
  assert.deepEqual(lastOut(day), out("17:00"));
});

test("counted events of a mixed day form the same in/out pairs as the day without outside scans", () => {
  const clean = [inn("09:00"), out("12:00"), inn("13:00"), out("17:00")];
  const mixed = [outsideIn("06:00"), inn("09:00"), outsideOut("11:00"), out("12:00"), inn("13:00"), out("17:00"), outsideIn("20:00")];
  assert.deepEqual(countedEvents(mixed), clean);
});