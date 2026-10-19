import test from "node:test";
import assert from "node:assert/strict";
import {
  BREAK_MINUTES_ERROR,
  DEDUCT_AFTER_ERROR,
  DEFAULT_DEDUCT_AFTER_MINUTES,
  DEFAULT_UNPAID_BREAK_MINUTES,
  MAX_DEDUCT_AFTER_MINUTES,
  MAX_UNPAID_BREAK_MINUTES,
  MIN_DEDUCT_AFTER_MINUTES,
  MIN_UNPAID_BREAK_MINUTES,
  WORKED_MINUTES_ERROR,
  computePaidTime,
  parseBreakSettings,
} from "../../src/lib/shift-breaks.ts";

const SIX_HOURS = 6 * 60;

// ---------------------------------------------------------------- constants
test("break limits match the task brief", () => {
  assert.equal(MIN_UNPAID_BREAK_MINUTES, 0);
  assert.equal(MAX_UNPAID_BREAK_MINUTES, 240);
  assert.equal(MIN_DEDUCT_AFTER_MINUTES, 0);
  assert.equal(MAX_DEDUCT_AFTER_MINUTES, 720);
  assert.equal(DEFAULT_UNPAID_BREAK_MINUTES, 0);
  assert.equal(DEFAULT_DEDUCT_AFTER_MINUTES, SIX_HOURS);
});

// ---------------------------------------------------------------- computePaidTime: table
const cases = [
  // [description, workedMinutes, unpaidBreakMinutes, deductAfterMinutes, expectedBreak, expectedPaid]
  ["no break set, long day", 600, 0, SIX_HOURS, 0, 600],
  ["no break set, short day", 120, 0, SIX_HOURS, 0, 120],
  ["worked exactly at the limit: no deduction", SIX_HOURS, 30, SIX_HOURS, 0, SIX_HOURS],
  ["one minute over the limit: deduction", SIX_HOURS + 1, 30, SIX_HOURS, 30, SIX_HOURS - 29],
  ["one minute under the limit: no deduction", SIX_HOURS - 1, 30, SIX_HOURS, 0, SIX_HOURS - 1],
  ["normal 8-hour day with a 60-minute break", 480, 60, SIX_HOURS, 60, 420],
  ["worked less than the break, over a limit of 0: break capped at time worked", 20, 45, 0, 20, 0],
  ["worked less than the break, under the limit: no deduction", 20, 45, SIX_HOURS, 0, 20],
  ["worked exactly the break, over a limit of 0: paid is 0", 45, 45, 0, 45, 0],
  ["zero minutes worked, limit 0: not MORE than 0, no deduction", 0, 30, 0, 0, 0],
  ["zero minutes worked, default limit", 0, 30, SIX_HOURS, 0, 0],
  ["one minute worked, limit 0: break capped at 1", 1, 30, 0, 1, 0],
  ["maximum break and maximum limit, just over", 721, 240, 720, 240, 481],
  ["maximum limit, exactly at it: no deduction", 720, 240, 720, 0, 720],
  ["night shift 22:00 to 06:00 is just 480 minutes", 480, 30, SIX_HOURS, 30, 450],
  ["long night shift 20:00 to 08:00 (720 minutes)", 720, 60, SIX_HOURS, 60, 660],
  ["huge number of minutes (a year)", 525_600, 60, SIX_HOURS, 60, 525_540],
  [
    "largest safe whole number",
    Number.MAX_SAFE_INTEGER,
    240,
    720,
    240,
    Number.MAX_SAFE_INTEGER - 240,
  ],
];

for (const [name, worked, brk, after, expectedBreak, expectedPaid] of cases) {
  test(`computePaidTime: ${name}`, () => {
    const result = computePaidTime({
      workedMinutes: worked,
      unpaidBreakMinutes: brk,
      deductAfterMinutes: after,
    });
    assert.deepEqual(result, {
      workedMinutes: worked,
      breakMinutes: expectedBreak,
      paidMinutes: expectedPaid,
    });
  });
}

test("computePaidTime: the three figures always add up and are whole and never negative", () => {
  for (const worked of [0, 1, 29, 30, 31, 359, 360, 361, 480, 1440, 10_000]) {
    for (const brk of [0, 1, 30, 60, 240]) {
      for (const after of [0, 1, 360, 720]) {
        const r = computePaidTime({
          workedMinutes: worked,
          unpaidBreakMinutes: brk,
          deductAfterMinutes: after,
        });
        assert.equal(r.workedMinutes, worked, "time at work is never changed");
        assert.equal(r.breakMinutes + r.paidMinutes, worked);
        assert.ok(r.breakMinutes >= 0 && r.paidMinutes >= 0);
        assert.ok(Number.isInteger(r.breakMinutes) && Number.isInteger(r.paidMinutes));
        assert.ok(r.breakMinutes <= brk && r.breakMinutes <= worked);
        if (worked <= after) assert.equal(r.breakMinutes, 0);
      }
    }
  }
});

test("computePaidTime does not change the object it was given", () => {
  const input = Object.freeze({ workedMinutes: 480, unpaidBreakMinutes: 60, deductAfterMinutes: 360 });
  const result = computePaidTime(input);
  assert.notEqual(result, input);
  assert.deepEqual(input, { workedMinutes: 480, unpaidBreakMinutes: 60, deductAfterMinutes: 360 });
});

// ---------------------------------------------------------------- computePaidTime: refused input
const BAD_NUMBERS = [
  ["a negative", -1],
  ["a fraction", 30.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["a numeric string", "30"],
  ["null", null],
  ["undefined", undefined],
  ["a boolean", true],
  ["an object", {}],
];

for (const [label, bad] of BAD_NUMBERS) {
  test(`computePaidTime refuses ${label} as time at work`, () => {
    assert.throws(
      () => computePaidTime({ workedMinutes: bad, unpaidBreakMinutes: 30, deductAfterMinutes: 360 }),
      { name: "RangeError", message: WORKED_MINUTES_ERROR },
    );
  });
  test(`computePaidTime refuses ${label} as the break`, () => {
    assert.throws(
      () => computePaidTime({ workedMinutes: 480, unpaidBreakMinutes: bad, deductAfterMinutes: 360 }),
      { name: "RangeError", message: BREAK_MINUTES_ERROR },
    );
  });
  test(`computePaidTime refuses ${label} as the deduct-after limit`, () => {
    assert.throws(
      () => computePaidTime({ workedMinutes: 480, unpaidBreakMinutes: 30, deductAfterMinutes: bad }),
      { name: "RangeError", message: DEDUCT_AFTER_ERROR },
    );
  });
}

test("computePaidTime refuses settings out of range and numbers beyond safe whole numbers", () => {
  assert.throws(
    () => computePaidTime({ workedMinutes: 480, unpaidBreakMinutes: 241, deductAfterMinutes: 360 }),
    { message: BREAK_MINUTES_ERROR },
  );
  assert.throws(
    () => computePaidTime({ workedMinutes: 480, unpaidBreakMinutes: 30, deductAfterMinutes: 721 }),
    { message: DEDUCT_AFTER_ERROR },
  );
  assert.throws(
    () =>
      computePaidTime({
        workedMinutes: Number.MAX_SAFE_INTEGER + 1,
        unpaidBreakMinutes: 30,
        deductAfterMinutes: 360,
      }),
    { message: WORKED_MINUTES_ERROR },
  );
});

test("computePaidTime refuses a missing or non-object input", () => {
  assert.throws(() => computePaidTime(), RangeError);
  assert.throws(() => computePaidTime(null), RangeError);
  assert.throws(() => computePaidTime(480), RangeError);
  assert.throws(() => computePaidTime({}), { message: WORKED_MINUTES_ERROR });
});

// ---------------------------------------------------------------- parseBreakSettings
test("parseBreakSettings accepts the edges of both ranges", () => {
  for (const [brk, after] of [
    [0, 0],
    [240, 720],
    [0, 720],
    [240, 0],
    [30, 360],
  ]) {
    assert.deepEqual(parseBreakSettings({ unpaidBreakMinutes: brk, deductAfterMinutes: after }), {
      ok: true,
      value: { unpaidBreakMinutes: brk, deductAfterMinutes: after },
    });
  }
});

test("parseBreakSettings fills in defaults for missing settings (no break; 6-hour limit)", () => {
  assert.deepEqual(parseBreakSettings({}), {
    ok: true,
    value: { unpaidBreakMinutes: 0, deductAfterMinutes: SIX_HOURS },
  });
  assert.deepEqual(parseBreakSettings({ unpaidBreakMinutes: 45 }), {
    ok: true,
    value: { unpaidBreakMinutes: 45, deductAfterMinutes: SIX_HOURS },
  });
  assert.deepEqual(parseBreakSettings({ deductAfterMinutes: 300 }), {
    ok: true,
    value: { unpaidBreakMinutes: 0, deductAfterMinutes: 300 },
  });
});

test("parseBreakSettings drops unknown fields", () => {
  const result = parseBreakSettings({ unpaidBreakMinutes: 30, deductAfterMinutes: 360, orgId: "x" });
  assert.deepEqual(result, { ok: true, value: { unpaidBreakMinutes: 30, deductAfterMinutes: 360 } });
});

const BAD_SETTING_VALUES = [
  ["a negative", -1],
  ["a fraction", 15.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["a numeric string", "30"],
  ["null", null],
  ["a boolean", false],
  ["an array", [30]],
];

for (const [label, bad] of BAD_SETTING_VALUES) {
  test(`parseBreakSettings refuses ${label} with a plain sentence`, () => {
    assert.deepEqual(parseBreakSettings({ unpaidBreakMinutes: bad, deductAfterMinutes: 360 }), {
      ok: false,
      error: BREAK_MINUTES_ERROR,
    });
    assert.deepEqual(parseBreakSettings({ unpaidBreakMinutes: 30, deductAfterMinutes: bad }), {
      ok: false,
      error: DEDUCT_AFTER_ERROR,
    });
  });
}

test("parseBreakSettings refuses values just outside the ranges", () => {
  assert.deepEqual(parseBreakSettings({ unpaidBreakMinutes: 241, deductAfterMinutes: 360 }), {
    ok: false,
    error: BREAK_MINUTES_ERROR,
  });
  assert.deepEqual(parseBreakSettings({ unpaidBreakMinutes: 30, deductAfterMinutes: 721 }), {
    ok: false,
    error: DEDUCT_AFTER_ERROR,
  });
});

test("parseBreakSettings refuses input that is not an object", () => {
  for (const bad of [undefined, null, 30, "30", [], true]) {
    const result = parseBreakSettings(bad);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, "string");
  }
});

test("error messages are plain sentences that say the allowed range", () => {
  assert.match(BREAK_MINUTES_ERROR, /^The unpaid break .*from 0 to 240\.$/);
  assert.match(DEDUCT_AFTER_ERROR, /^The time before a break is deducted .*from 0 to 720\.$/);
  assert.match(WORKED_MINUTES_ERROR, /\.$/);
});

test("output of parseBreakSettings feeds straight into computePaidTime", () => {
  const settings = parseBreakSettings({ unpaidBreakMinutes: 30 });
  assert.equal(settings.ok, true);
  assert.deepEqual(computePaidTime({ workedMinutes: 361, ...settings.value }), {
    workedMinutes: 361,
    breakMinutes: 30,
    paidMinutes: 331,
  });
});