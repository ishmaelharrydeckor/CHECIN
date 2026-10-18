import test from "node:test";
import assert from "node:assert/strict";
import {
  FILL_AHEAD_DAYS,
  FILL_RUN_MAX_DAYS,
  MAX_PATTERN_PEOPLE_PER_REQUEST,
  MAX_ROTATION_STEPS,
  MAX_STEP_WEEKS,
  NO_MORE_FILL,
  fillTarget,
  needsFill,
  nextFillDay,
  nextFillWindow,
  parsePatternCreate,
  parsePatternEdit,
  parsePatternRule,
  patternDocId,
  patternShiftIds,
  patternsOverlap,
  planEdit,
  planFill,
  planTrim,
  shiftIdForDay,
} from "../../src/lib/shift-patterns.ts";
import { MAX_ASSIGNMENT_RANGE_DAYS, MAX_WRITES_PER_REQUEST } from "../../src/lib/shift-requests.ts";

// 2026-10-12 is a Monday.
const TODAY = "2026-10-13"; // Tuesday
const MON_FRI = [0, 1, 2, 3, 4];
const WEEKLY_DAY = { kind: "weekly", shiftId: "day", weekdays: MON_FRI };
const ROT_DAY_NIGHT = {
  kind: "rotation",
  weekdays: MON_FRI,
  steps: [
    { shiftId: "day", weeks: 2 },
    { shiftId: "night", weeks: 2 },
  ],
};
const LIVE_SHIFTS = new Map([
  ["day", { archived: false }],
  ["night", { archived: false }],
]);
const NONE = new Map();
const REQ = "0b7c9d3e-1f2a-4b5c-8d6e-7f8091a2b3c4";

function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function fill(pattern, opts = {}) {
  return planFill({
    patternId: "p1",
    pattern,
    today: opts.today ?? TODAY,
    existing: opts.existing ?? NONE,
    recordedToday: opts.recordedToday ?? false,
    shifts: opts.shifts ?? LIVE_SHIFTS,
  });
}

// ---------------------------------------------------------------- constants
test("shift-patterns keeps the existing 62-day and batch limits", () => {
  assert.equal(FILL_AHEAD_DAYS, 62);
  assert.equal(FILL_RUN_MAX_DAYS, MAX_ASSIGNMENT_RANGE_DAYS);
  assert.equal(MAX_ROTATION_STEPS, 8);
  assert.equal(MAX_STEP_WEEKS, 8);
  // One create request fills at most this many people x one run, inside one Firestore batch.
  // Worst case: every person gets a pattern document plus a full fill run (a seven-day pattern).
  assert.ok(MAX_PATTERN_PEOPLE_PER_REQUEST * (FILL_RUN_MAX_DAYS + 1) <= MAX_WRITES_PER_REQUEST);
});

// ---------------------------------------------------------------- parsePatternRule
test("parsePatternRule accepts a weekly rule and a rotation, and cleans them", () => {
  assert.deepEqual(parsePatternRule({ kind: "weekly", shiftId: " day ", weekdays: [4, 0, 0, 2] }), {
    ok: true,
    value: { kind: "weekly", shiftId: "day", weekdays: [0, 2, 4] },
  });
  assert.deepEqual(parsePatternRule(ROT_DAY_NIGHT), {
    ok: true,
    value: {
      kind: "rotation",
      weekdays: MON_FRI,
      steps: [
        { shiftId: "day", weeks: 2 },
        { shiftId: "night", weeks: 2 },
      ],
    },
  });
});

test("parsePatternRule refuses broken rules with a plain sentence", () => {
  const bad = [
    undefined,
    null,
    "weekly",
    [],
    {},
    { kind: "monthly", shiftId: "day", weekdays: MON_FRI },
    { kind: "weekly", shiftId: "", weekdays: MON_FRI },
    { kind: "weekly", shiftId: "a/b", weekdays: MON_FRI },
    { kind: "weekly", shiftId: 7, weekdays: MON_FRI },
    { kind: "weekly", shiftId: "day", weekdays: [] },
    { kind: "weekly", shiftId: "day", weekdays: [7] },
    { kind: "weekly", shiftId: "day", weekdays: [-1] },
    { kind: "weekly", shiftId: "day", weekdays: [1.5] },
    { kind: "weekly", shiftId: "day", weekdays: "0,1" },
    { kind: "rotation", weekdays: MON_FRI, steps: [] },
    { kind: "rotation", weekdays: MON_FRI, steps: [{ shiftId: "day", weeks: 2 }] }, // one step is just weekly
    { kind: "rotation", weekdays: MON_FRI, steps: [{ shiftId: "day", weeks: 0 }, { shiftId: "night", weeks: 1 }] },
    { kind: "rotation", weekdays: MON_FRI, steps: [{ shiftId: "day", weeks: 9 }, { shiftId: "night", weeks: 1 }] },
    { kind: "rotation", weekdays: MON_FRI, steps: [{ shiftId: "day", weeks: 1.5 }, { shiftId: "night", weeks: 1 }] },
    { kind: "rotation", weekdays: MON_FRI, steps: [{ shiftId: "", weeks: 1 }, { shiftId: "night", weeks: 1 }] },
    { kind: "rotation", weekdays: MON_FRI, steps: "day,night" },
    { kind: "rotation", weekdays: [], steps: ROT_DAY_NIGHT.steps },
    {
      kind: "rotation",
      weekdays: MON_FRI,
      steps: Array.from({ length: 9 }, (_, i) => ({ shiftId: `s${i}`, weeks: 1 })),
    },
  ];
  for (const raw of bad) {
    const r = parsePatternRule(raw);
    assert.equal(r.ok, false, `expected refusal for ${JSON.stringify(raw)}`);
    assert.equal(typeof r.error, "string");
    assert.ok(r.error.length > 0);
  }
});

test("patternShiftIds lists each shift once", () => {
  assert.deepEqual(patternShiftIds(WEEKLY_DAY), ["day"]);
  assert.deepEqual(
    patternShiftIds({
      kind: "rotation",
      weekdays: MON_FRI,
      steps: [
        { shiftId: "day", weeks: 1 },
        { shiftId: "night", weeks: 1 },
        { shiftId: "day", weeks: 1 },
      ],
    }),
    ["day", "night"],
  );
});

// ---------------------------------------------------------------- parsePatternCreate / Edit
test("parsePatternCreate accepts people, a rule, a start and an optional end", () => {
  const r = parsePatternCreate(
    { employeeIds: ["a", " b ", "a"], rule: WEEKLY_DAY, startDay: TODAY, endDay: null, requestId: REQ },
    TODAY,
  );
  assert.deepEqual(r, {
    ok: true,
    value: { employeeIds: ["a", "b"], rule: WEEKLY_DAY, startDay: TODAY, endDay: null, requestId: REQ },
  });
  const withEnd = parsePatternCreate(
    { employeeIds: ["a"], rule: WEEKLY_DAY, startDay: "2026-10-20", endDay: "2027-06-30", requestId: REQ },
    TODAY,
  );
  assert.equal(withEnd.ok, true);
  assert.equal(withEnd.value.endDay, "2027-06-30");
  // A missing end means "until further notice".
  const noEnd = parsePatternCreate({ employeeIds: ["a"], rule: WEEKLY_DAY, startDay: TODAY, requestId: REQ }, TODAY);
  assert.equal(noEnd.ok, true);
  assert.equal(noEnd.value.endDay, null);
});

test("parsePatternCreate refuses past starts, ends before starts, bad people and bad request ids", () => {
  const base = { employeeIds: ["a"], rule: WEEKLY_DAY, startDay: TODAY, endDay: null, requestId: REQ };
  const cases = [
    [{ ...base, startDay: "2026-10-12" }, "past start"],
    [{ ...base, startDay: "2026-02-30" }, "not a real day"],
    [{ ...base, startDay: "13-10-2026" }, "wrong format"],
    [{ ...base, endDay: "2026-10-12" }, "end before start"],
    [{ ...base, endDay: "2026-13-01" }, "end not a real day"],
    [{ ...base, employeeIds: [] }, "nobody"],
    [{ ...base, employeeIds: ["a/b"] }, "slash in id"],
    [{ ...base, employeeIds: Array.from({ length: MAX_PATTERN_PEOPLE_PER_REQUEST + 1 }, (_, i) => `p${i}`) }, "too many"],
    [{ ...base, rule: { kind: "weekly" } }, "bad rule"],
    [{ ...base, requestId: "" }, "no request id"],
    [{ ...base, requestId: "x".repeat(65) }, "request id too long"],
    [{ ...base, requestId: "has/slash" }, "request id slash"],
    [null, "no body"],
  ];
  for (const [raw, label] of cases) {
    const r = parsePatternCreate(raw, TODAY);
    assert.equal(r.ok, false, label);
    assert.ok(r.error.length > 0, label);
  }
  assert.equal(parsePatternCreate(base, "bad").ok, false);
});

test("parsePatternEdit accepts a new rule and/or end, never a past end", () => {
  assert.deepEqual(parsePatternEdit({ rule: WEEKLY_DAY }, TODAY), { ok: true, value: { rule: WEEKLY_DAY } });
  assert.deepEqual(parsePatternEdit({ endDay: TODAY }, TODAY), { ok: true, value: { endDay: TODAY } });
  assert.deepEqual(parsePatternEdit({ endDay: null }, TODAY), { ok: true, value: { endDay: null } });
  assert.equal(parsePatternEdit({ endDay: "2026-10-12" }, TODAY).ok, false);
  assert.equal(parsePatternEdit({}, TODAY).ok, false);
  assert.equal(parsePatternEdit({ rule: { kind: "weekly" } }, TODAY).ok, false);
  assert.equal(parsePatternEdit(null, TODAY).ok, false);
  // A start day cannot be moved by an edit: the server ignores nothing silently.
  assert.equal(parsePatternEdit({ startDay: "2026-10-20" }, TODAY).ok, false);
});

test("patternDocId is deterministic, so a retried create writes the same document", () => {
  assert.equal(patternDocId("emp1", REQ), patternDocId("emp1", REQ));
  assert.notEqual(patternDocId("emp1", REQ), patternDocId("emp2", REQ));
  assert.ok(!patternDocId("emp1", REQ).includes("/"));
  assert.throws(() => patternDocId("a/b", REQ));
  assert.throws(() => patternDocId("emp1", ""));
});

// ---------------------------------------------------------------- shiftIdForDay
test("shiftIdForDay: weekly picks only chosen weekdays and never before the start", () => {
  const start = "2026-10-12"; // Monday
  assert.equal(shiftIdForDay(WEEKLY_DAY, start, "2026-10-12"), "day");
  assert.equal(shiftIdForDay(WEEKLY_DAY, start, "2026-10-16"), "day"); // Friday
  assert.equal(shiftIdForDay(WEEKLY_DAY, start, "2026-10-17"), null); // Saturday
  assert.equal(shiftIdForDay(WEEKLY_DAY, start, "2026-10-18"), null); // Sunday
  assert.equal(shiftIdForDay(WEEKLY_DAY, start, "2026-10-09"), null); // before start
});

test("shiftIdForDay: a rotation switches on Monday week boundaries counted from the start week", () => {
  const start = "2026-10-12"; // Monday
  const expect = [
    ["2026-10-12", "day"], // week 1
    ["2026-10-23", "day"], // week 2, Friday
    ["2026-10-24", null], // week 2, Saturday (not a chosen weekday)
    ["2026-10-26", "night"], // week 3, Monday
    ["2026-11-06", "night"], // week 4, Friday
    ["2026-11-09", "day"], // week 5 starts the cycle again
    ["2026-11-23", "night"], // week 7
  ];
  for (const [day, shift] of expect) {
    assert.equal(shiftIdForDay(ROT_DAY_NIGHT, start, day), shift, day);
  }
});

test("shiftIdForDay: a rotation starting mid-week counts that partial week as week 1", () => {
  const start = "2026-10-14"; // Wednesday
  assert.equal(shiftIdForDay(ROT_DAY_NIGHT, start, "2026-10-13"), null); // before start
  assert.equal(shiftIdForDay(ROT_DAY_NIGHT, start, "2026-10-14"), "day");
  assert.equal(shiftIdForDay(ROT_DAY_NIGHT, start, "2026-10-19"), "day"); // week 2 Monday
  assert.equal(shiftIdForDay(ROT_DAY_NIGHT, start, "2026-10-26"), "night"); // week 3 Monday
});

test("shiftIdForDay: uneven rotations and three steps", () => {
  const rule = {
    kind: "rotation",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    steps: [
      { shiftId: "early", weeks: 1 },
      { shiftId: "late", weeks: 3 },
      { shiftId: "night", weeks: 1 },
    ],
  };
  const start = "2026-10-12";
  const byWeek = [];
  for (let w = 0; w < 10; w++) byWeek.push(shiftIdForDay(rule, start, addDays(start, w * 7 + 6)));
  assert.deepEqual(byWeek, ["early", "late", "late", "late", "night", "early", "late", "late", "late", "night"]);
});

test("shiftIdForDay: month ends, a leap day and the year end are ordinary days", () => {
  const every = { kind: "weekly", shiftId: "day", weekdays: [0, 1, 2, 3, 4, 5, 6] };
  for (const d of ["2026-10-31", "2026-11-01", "2026-12-31", "2027-01-01", "2028-02-29", "2028-03-01"]) {
    assert.equal(shiftIdForDay(every, "2026-10-12", d), "day", d);
  }
  // Rotation weeks keep counting across the new year without drift: 2026-12-28 is week 12 (index 11).
  assert.equal(shiftIdForDay(ROT_DAY_NIGHT, "2026-10-12", "2026-12-28"), "night");
  assert.equal(shiftIdForDay(ROT_DAY_NIGHT, "2026-10-12", "2027-01-04"), "day");
});

// ---------------------------------------------------------------- fill window
test("fillTarget is 62 days after today", () => {
  assert.equal(fillTarget(TODAY), addDays(TODAY, 62));
});

test("nextFillWindow starts at the later of start, today and the day after filledThrough; at most 62 days", () => {
  const p = { rule: WEEKLY_DAY, startDay: TODAY, endDay: null, filledThrough: null };
  assert.deepEqual(nextFillWindow(p, TODAY), { from: TODAY, to: addDays(TODAY, 61) });
  // Second run tops up the last day to reach the target.
  assert.deepEqual(nextFillWindow({ ...p, filledThrough: addDays(TODAY, 61) }, TODAY), {
    from: addDays(TODAY, 62),
    to: addDays(TODAY, 62),
  });
  // Already filled to the target: nothing to do.
  assert.equal(nextFillWindow({ ...p, filledThrough: addDays(TODAY, 62) }, TODAY), null);
  // Nightly run, one day later, adds one day.
  assert.deepEqual(nextFillWindow({ ...p, filledThrough: addDays(TODAY, 62) }, addDays(TODAY, 1)), {
    from: addDays(TODAY, 63),
    to: addDays(TODAY, 63),
  });
  // A stale pattern nobody touched for months never fills the past.
  assert.deepEqual(nextFillWindow({ ...p, filledThrough: "2026-01-01" }, TODAY), {
    from: TODAY,
    to: addDays(TODAY, 61),
  });
  // A future start: the window starts at the start day.
  assert.deepEqual(nextFillWindow({ ...p, startDay: "2026-11-02" }, TODAY), {
    from: "2026-11-02",
    to: addDays(TODAY, 62),
  });
  // A start beyond the target: nothing yet.
  assert.equal(nextFillWindow({ ...p, startDay: addDays(TODAY, 63) }, TODAY), null);
  // An end day caps the window; an ended pattern has nothing left.
  assert.deepEqual(nextFillWindow({ ...p, endDay: "2026-10-31" }, TODAY), { from: TODAY, to: "2026-10-31" });
  assert.equal(nextFillWindow({ ...p, endDay: "2026-10-31", filledThrough: "2026-10-31" }, TODAY), null);
  assert.equal(nextFillWindow({ ...p, startDay: "2026-09-01", endDay: "2026-10-12" }, TODAY), null);
});

test("needsFill is false only when filled to the target or ended", () => {
  const p = { rule: WEEKLY_DAY, startDay: TODAY, endDay: null, filledThrough: null };
  assert.equal(needsFill(p, TODAY), true);
  assert.equal(needsFill({ ...p, filledThrough: addDays(TODAY, 62) }, TODAY), false);
  assert.equal(needsFill({ ...p, endDay: "2026-10-20", filledThrough: "2026-10-20" }, TODAY), false);
});

// ---------------------------------------------------------------- planFill
test("planFill writes the pattern's days inside one 62-day window and moves filledThrough", () => {
  const p = { rule: WEEKLY_DAY, startDay: TODAY, endDay: null, filledThrough: null };
  const r = fill(p);
  assert.equal(r.filledThrough, addDays(TODAY, 61));
  assert.ok(r.writes.length > 0);
  assert.ok(r.writes.length <= FILL_RUN_MAX_DAYS);
  for (const w of r.writes) {
    assert.ok(w.dayKey >= TODAY && w.dayKey <= addDays(TODAY, 61));
    assert.equal(w.shiftId, "day");
  }
  // Weekends are not written and are not "skipped" either: they are simply not part of the pattern.
  assert.ok(!r.writes.some((w) => w.dayKey === "2026-10-17"));
  assert.ok(!r.skipped.some((s) => s.dayKey === "2026-10-17"));
  // 62 days from Tue 13 Oct: 9 full weeks minus... count exactly the weekdays.
  let expected = 0;
  for (let i = 0; i < 62; i++) {
    const d = addDays(TODAY, i);
    const wd = (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;
    if (wd <= 4) expected++;
  }
  assert.equal(r.writes.length, expected);
});

test("planFill is idempotent: running it again with what it wrote changes nothing", () => {
  const p = { rule: WEEKLY_DAY, startDay: TODAY, endDay: null, filledThrough: null };
  const first = fill(p);
  const existing = new Map(first.writes.map((w) => [w.dayKey, { patternId: "p1", shiftId: w.shiftId }]));
  // A retry of the same run (filledThrough not saved yet) writes nothing new.
  const retry = fill(p, { existing });
  assert.deepEqual(retry.writes, []);
  assert.ok(retry.skipped.every((s) => s.reason === "already_filled"));
  assert.equal(retry.filledThrough, first.filledThrough);
});

test("planFill never overwrites a manual assignment or another pattern's day", () => {
  const p = { rule: WEEKLY_DAY, startDay: TODAY, endDay: null, filledThrough: null };
  const existing = new Map([
    ["2026-10-14", { patternId: null, shiftId: "night" }],
    ["2026-10-15", { patternId: "other", shiftId: "night" }],
  ]);
  const r = fill(p, { existing });
  assert.ok(!r.writes.some((w) => w.dayKey === "2026-10-14" || w.dayKey === "2026-10-15"));
  assert.deepEqual(
    r.skipped.filter((s) => s.dayKey === "2026-10-14" || s.dayKey === "2026-10-15"),
    [
      { dayKey: "2026-10-14", reason: "manual" },
      { dayKey: "2026-10-15", reason: "other_pattern" },
    ],
  );
});

test("planFill leaves today alone when attendance is already recorded, but fills later days", () => {
  const p = { rule: WEEKLY_DAY, startDay: TODAY, endDay: null, filledThrough: null };
  const r = fill(p, { recordedToday: true });
  assert.ok(!r.writes.some((w) => w.dayKey === TODAY));
  assert.deepEqual(r.skipped[0], { dayKey: TODAY, reason: "attendance_recorded" });
  assert.ok(r.writes.some((w) => w.dayKey === "2026-10-14"));
});

test("planFill skips an archived or deleted shift and still moves on", () => {
  const p = { rule: ROT_DAY_NIGHT, startDay: "2026-10-12", endDay: null, filledThrough: null };
  const shifts = new Map([
    ["day", { archived: false }],
    ["night", { archived: true }],
  ]);
  const r = fill(p, { shifts });
  assert.ok(r.writes.every((w) => w.shiftId === "day"));
  assert.ok(r.skipped.some((s) => s.dayKey === "2026-10-26" && s.reason === "shift_archived"));
  assert.equal(r.filledThrough, addDays(TODAY, 61));

  const missing = fill(p, { shifts: new Map([["day", { archived: false }]]) });
  assert.ok(missing.skipped.some((s) => s.dayKey === "2026-10-26" && s.reason === "shift_missing"));
});

test("planFill: leave and holidays do not stop the fill (the Today panel and register already let them win)", () => {
  // planFill takes no leave or holiday input on purpose: if the leave is cancelled, the shift is already there.
  const today = "2026-12-01";
  const p = { rule: WEEKLY_DAY, startDay: today, endDay: null, filledThrough: null };
  const r = fill(p, { today });
  assert.ok(r.writes.some((w) => w.dayKey === "2026-12-25")); // a Friday and a common public holiday
});

test("planFill: daylight-saving changeover days are filled exactly once", () => {
  const every = { kind: "weekly", shiftId: "night", weekdays: [0, 1, 2, 3, 4, 5, 6] };
  // Europe 2027-03-28, US 2026-11-01, Europe 2026-10-25.
  for (const [today, dstDay] of [
    ["2026-10-20", "2026-10-25"],
    ["2026-10-20", "2026-11-01"],
    ["2027-03-01", "2027-03-28"],
  ]) {
    const r = fill({ rule: every, startDay: today, endDay: null, filledThrough: null }, { today });
    assert.equal(r.writes.filter((w) => w.dayKey === dstDay).length, 1, dstDay);
    assert.equal(new Set(r.writes.map((w) => w.dayKey)).size, r.writes.length);
    assert.equal(r.writes.length, 62);
  }
});

test("planFill respects the end day and returns nothing for an ended pattern", () => {
  const ended = fill({ rule: WEEKLY_DAY, startDay: "2026-09-01", endDay: "2026-10-12", filledThrough: null });
  assert.deepEqual(ended.writes, []);
  assert.equal(ended.filledThrough, null);
  const short = fill({ rule: WEEKLY_DAY, startDay: TODAY, endDay: "2026-10-16", filledThrough: null });
  assert.deepEqual(
    short.writes.map((w) => w.dayKey),
    ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
  );
  assert.equal(short.filledThrough, "2026-10-16");
});

test("planFill rewrites its own future day when the rule changed, never a past or today's day", () => {
  const p = { rule: WEEKLY_DAY, startDay: TODAY, endDay: null, filledThrough: null };
  const existing = new Map([
    [TODAY, { patternId: "p1", shiftId: "night" }],
    ["2026-10-14", { patternId: "p1", shiftId: "night" }],
  ]);
  const r = fill(p, { existing });
  assert.ok(!r.writes.some((w) => w.dayKey === TODAY));
  assert.ok(r.writes.some((w) => w.dayKey === "2026-10-14" && w.shiftId === "day"));
});

test("planFill refuses bad input instead of guessing", () => {
  assert.throws(() => planFill({ patternId: "p1", pattern: null, today: TODAY, existing: NONE, recordedToday: false, shifts: LIVE_SHIFTS }));
  assert.throws(() =>
    planFill({
      patternId: "",
      pattern: { rule: WEEKLY_DAY, startDay: TODAY, endDay: null, filledThrough: null },
      today: TODAY,
      existing: NONE,
      recordedToday: false,
      shifts: LIVE_SHIFTS,
    }),
  );
  assert.throws(() => fill({ rule: WEEKLY_DAY, startDay: TODAY, endDay: null, filledThrough: null }, { today: "13/10/2026" }));
});

// ---------------------------------------------------------------- planTrim (edit and end)
test("planTrim removes only this pattern's days after the keep day, never today or the past", () => {
  const existing = [
    { dayKey: "2026-10-12", patternId: "p1" }, // past
    { dayKey: TODAY, patternId: "p1" }, // today
    { dayKey: "2026-10-14", patternId: "p1" },
    { dayKey: "2026-10-15", patternId: null }, // manual
    { dayKey: "2026-10-16", patternId: "other" },
    { dayKey: "2026-10-19", patternId: "p1" },
  ];
  // Editing: keep through today.
  assert.deepEqual(planTrim({ patternId: "p1", keepThrough: TODAY, today: TODAY, existing }), ["2026-10-14", "2026-10-19"]);
  // Ending on the 16th: keep through the 16th.
  assert.deepEqual(planTrim({ patternId: "p1", keepThrough: "2026-10-16", today: TODAY, existing }), ["2026-10-19"]);
  // A keep day in the past is treated as today: the past and today are never removed.
  assert.deepEqual(planTrim({ patternId: "p1", keepThrough: "2026-10-01", today: TODAY, existing }), ["2026-10-14", "2026-10-19"]);
});

test("edit flow: trim, then refill from tomorrow with the new rule; today keeps the old shift", () => {
  const oldRule = WEEKLY_DAY;
  const created = fill({ rule: oldRule, startDay: TODAY, endDay: null, filledThrough: null });
  const stored = created.writes.map((w) => ({ dayKey: w.dayKey, patternId: "p1" }));
  const removed = new Set(planTrim({ patternId: "p1", keepThrough: TODAY, today: TODAY, existing: stored }));
  assert.ok(!removed.has(TODAY));

  const left = new Map(
    created.writes.filter((w) => !removed.has(w.dayKey)).map((w) => [w.dayKey, { patternId: "p1", shiftId: w.shiftId }]),
  );
  const newRule = { kind: "weekly", shiftId: "night", weekdays: MON_FRI };
  const refill = fill({ rule: newRule, startDay: TODAY, endDay: null, filledThrough: TODAY }, { existing: left });
  assert.ok(!refill.writes.some((w) => w.dayKey <= TODAY));
  assert.ok(refill.writes.every((w) => w.shiftId === "night"));
  assert.equal(refill.writes[0].dayKey, "2026-10-14");
});

test("a manual clear of a pattern day stays cleared on the next top-up", () => {
  // After the first run filledThrough is saved, so the next run starts after it and never revisits a cleared day.
  const p = { rule: WEEKLY_DAY, startDay: TODAY, endDay: null, filledThrough: null };
  const first = fill(p);
  const next = fill({ ...p, filledThrough: first.filledThrough });
  assert.ok(next.writes.every((w) => w.dayKey > first.filledThrough));
});

// ---------------------------------------------------------------- step 2 helpers

test("nextFillDay: the start for a new pattern, the day after filledThrough, or done", () => {
  const p = { startDay: "2026-10-20", endDay: null, filledThrough: null };
  assert.equal(nextFillDay(p), "2026-10-20");
  assert.equal(nextFillDay({ ...p, filledThrough: "2026-12-01" }), "2026-12-02");
  // filledThrough saved before the start (a run that had nothing to do) still points at the start.
  assert.equal(nextFillDay({ ...p, filledThrough: "2026-10-01" }), "2026-10-20");
  assert.equal(nextFillDay({ ...p, endDay: "2026-11-30", filledThrough: "2026-11-30" }), NO_MORE_FILL);
  assert.equal(nextFillDay({ ...p, endDay: "2026-11-30", filledThrough: "2026-11-29" }), "2026-11-30");
  assert.ok(NO_MORE_FILL > "2999-12-31");
});

test("patternsOverlap: dates must meet and a weekday must be shared", () => {
  const monFri = { rule: WEEKLY_DAY, startDay: "2026-10-13", endDay: null };
  const weekend = { rule: { kind: "weekly", shiftId: "day", weekdays: [5, 6] }, startDay: "2026-10-13", endDay: null };
  const later = { rule: WEEKLY_DAY, startDay: "2027-01-01", endDay: null };
  const ended = { rule: WEEKLY_DAY, startDay: "2026-10-13", endDay: "2026-12-31" };
  assert.equal(patternsOverlap(monFri, weekend), false);
  assert.equal(patternsOverlap(monFri, later), true);
  assert.equal(patternsOverlap(ended, later), false);
  assert.equal(patternsOverlap(ended, { ...later, startDay: "2026-12-31" }), true);
  assert.equal(patternsOverlap(monFri, { rule: ROT_DAY_NIGHT, startDay: "2026-11-02", endDay: null }), true);
});

test("planEdit: a new rule keeps today and before, and refills from tomorrow", () => {
  const p = { rule: WEEKLY_DAY, startDay: "2026-10-01", endDay: null, filledThrough: "2026-12-14" };
  const r = planEdit(p, { rule: ROT_DAY_NIGHT }, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.value.keepThrough, TODAY);
  assert.deepEqual(r.value.next, { rule: ROT_DAY_NIGHT, startDay: "2026-10-01", endDay: null, filledThrough: TODAY });
});

test("planEdit: an earlier end trims after it; a later or removed end trims nothing and fills on", () => {
  const p = { rule: WEEKLY_DAY, startDay: "2026-10-01", endDay: null, filledThrough: "2026-12-14" };
  const earlier = planEdit(p, { endDay: "2026-11-15" }, TODAY);
  assert.equal(earlier.value.keepThrough, "2026-11-15");
  assert.equal(earlier.value.next.filledThrough, "2026-11-15");
  assert.equal(earlier.value.next.endDay, "2026-11-15");

  const ending = { ...p, endDay: "2026-11-15", filledThrough: "2026-11-15" };
  const later = planEdit(ending, { endDay: "2027-03-01" }, TODAY);
  assert.equal(later.value.next.filledThrough, "2026-11-15"); // nothing to trim, fill continues from the 16th
  assert.equal(nextFillDay(later.value.next), "2026-11-16");
  const open = planEdit(ending, { endDay: null }, TODAY);
  assert.equal(open.value.keepThrough, null);
  assert.equal(open.value.next.endDay, null);
});

test("planEdit: ending today keeps today's shift; an end before a future start is refused", () => {
  const p = { rule: WEEKLY_DAY, startDay: "2026-10-01", endDay: null, filledThrough: "2026-12-14" };
  const r = planEdit(p, { endDay: TODAY }, TODAY);
  assert.equal(r.value.keepThrough, TODAY);
  assert.equal(r.value.next.filledThrough, TODAY);
  const future = { ...p, startDay: "2026-11-01", filledThrough: null };
  assert.equal(planEdit(future, { endDay: "2026-10-20" }, TODAY).ok, false);
  // A pattern that was never filled stays unfilled after an edit.
  assert.equal(planEdit(future, { rule: ROT_DAY_NIGHT }, TODAY).value.next.filledThrough, null);
});
