import test from "node:test";
import assert from "node:assert/strict";
import {
  describeFillSkips,
  describePatternDates,
  describePatternRule,
  formatDayMonthYear,
} from "../../src/lib/shift-rota.ts";

const NAMES = new Map([
  ["day", "Day"],
  ["night", "Night"],
  ["early", "Early"],
]);
const nameOf = (id) => NAMES.get(id) ?? "a removed shift";

test("formatDayMonthYear writes a day with its year", () => {
  assert.equal(formatDayMonthYear("2026-10-13"), "13 Oct 2026");
  assert.equal(formatDayMonthYear("2027-01-01"), "1 Jan 2027");
});

test("describePatternRule says a weekly pattern in plain words", () => {
  assert.equal(describePatternRule({ kind: "weekly", shiftId: "day", weekdays: [0, 1, 2, 3, 4] }, nameOf), "Day, Monday to Friday");
  assert.equal(describePatternRule({ kind: "weekly", shiftId: "night", weekdays: [5, 6] }, nameOf), "Night, Sat, Sun");
  assert.equal(describePatternRule({ kind: "weekly", shiftId: "gone", weekdays: [0] }, nameOf), "a removed shift, Mon");
});

test("describePatternRule says a rotation step by step", () => {
  assert.equal(
    describePatternRule(
      {
        kind: "rotation",
        weekdays: [0, 1, 2, 3, 4],
        steps: [
          { shiftId: "day", weeks: 2 },
          { shiftId: "night", weeks: 2 },
        ],
      },
      nameOf,
    ),
    "2 weeks Day, then 2 weeks Night, repeating (Monday to Friday)",
  );
  assert.equal(
    describePatternRule(
      {
        kind: "rotation",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        steps: [
          { shiftId: "early", weeks: 1 },
          { shiftId: "day", weeks: 1 },
          { shiftId: "night", weeks: 3 },
        ],
      },
      nameOf,
    ),
    "1 week Early, then 1 week Day, then 3 weeks Night, repeating (every day)",
  );
});

test("describePatternDates covers an open end, an end date and a pattern that has ended", () => {
  assert.equal(describePatternDates("2026-10-13", null), "From 13 Oct 2026, until further notice");
  assert.equal(describePatternDates("2026-10-13", "2027-06-30"), "13 Oct 2026 to 30 Jun 2027");
});

test("describeFillSkips explains only what a manager needs to know", () => {
  assert.equal(describeFillSkips(undefined), null);
  assert.equal(describeFillSkips({}), null);
  assert.equal(describeFillSkips({ already_filled: 40 }), null);
  assert.equal(describeFillSkips({ manual: 1 }), "1 day kept the shift assigned by hand.");
  assert.equal(
    describeFillSkips({ manual: 3, shift_archived: 2, attendance_recorded: 1, other_pattern: 1, shift_missing: 1 }),
    "3 days kept the shift assigned by hand. 1 day is covered by another pattern. " +
      "1 day was skipped because attendance is already recorded. " +
      "3 days were skipped because a shift in the pattern was archived or removed.",
  );
  // Rubbish from the server is ignored, not shown.
  assert.equal(describeFillSkips({ manual: -1, nonsense: 4 }), null);
});
