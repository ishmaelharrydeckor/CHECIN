import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ABSENT_AFTER_MINUTES,
  DEFAULT_WINDOW_MINUTES,
  MAX_ASSIGNMENT_RANGE_DAYS,
  MAX_SHIFT_MINUTES,
  MAX_WINDOW_MINUTES,
  MIN_WINDOW_MINUTES,
  SHIFT_TYPES,
  assignmentId,
  classifyScan,
  crossesMidnight,
  describeOutside,
  expandAssignmentRange,
  parseShiftInput,
  shiftDayStatus,
  shiftMinutes,
  shiftWindow,
  zonedTimeToMs,
} from "../../src/lib/shift-engine.ts";

const ACCRA = "Africa/Accra";
const LONDON = "Europe/London";
const NEW_YORK = "America/New_York";

const dayShift = {
  shiftId: "shift_day",
  name: "Day Shift",
  type: "day",
  start: "09:00",
  end: "17:00",
  graceMinutes: 0,
  expectedMinutes: null,
};

const nightShift = {
  shiftId: "shift_night",
  name: "Night Shift",
  type: "night",
  start: "22:00",
  end: "06:00",
  graceMinutes: 10,
  expectedMinutes: null,
};

const flexShift = {
  shiftId: "shift_flex",
  name: "Flex Shift",
  type: "flex",
  start: null,
  end: null,
  graceMinutes: 0,
  expectedMinutes: 480,
};

// ---------------------------------------------------------------- constants & helpers
test("exported constants and basic time helpers match the design specification", () => {
  assert.deepEqual(SHIFT_TYPES, ["day", "early", "late", "night", "flex"]);
  assert.equal(DEFAULT_WINDOW_MINUTES, 120);
  assert.equal(MIN_WINDOW_MINUTES, 30);
  assert.equal(MAX_WINDOW_MINUTES, 240);
  assert.equal(DEFAULT_ABSENT_AFTER_MINUTES, 60);
  assert.equal(MAX_ASSIGNMENT_RANGE_DAYS, 62);
  assert.equal(MAX_SHIFT_MINUTES, 16 * 60);

  assert.equal(crossesMidnight("09:00", "17:00"), false);
  assert.equal(crossesMidnight("22:00", "06:00"), true);
  assert.equal(crossesMidnight("23:59", "00:00"), true);

  assert.equal(shiftMinutes("09:00", "17:00"), 480);
  assert.equal(shiftMinutes("22:00", "06:00"), 480);
  assert.equal(shiftMinutes("06:00", "22:00"), 960);
});

// ---------------------------------------------------------------- zonedTimeToMs
test("zonedTimeToMs converts wall-clock times including DST gaps, repeats, and invalid timezones", () => {
  assert.equal(
    zonedTimeToMs("2026-10-12", "22:00", ACCRA),
    Date.UTC(2026, 9, 12, 22, 0),
  );
  // Spring-forward gap in London (clocks jump 01:00 -> 02:00 BST): 01:30 becomes 02:30 BST = 01:30 UTC
  assert.equal(
    zonedTimeToMs("2026-03-29", "01:30", LONDON),
    Date.UTC(2026, 2, 29, 1, 30),
  );
  // Fall-back repeat in London (01:30 happens in BST then GMT): picks the first (BST = UTC+1)
  assert.equal(
    zonedTimeToMs("2026-10-25", "01:30", LONDON),
    Date.UTC(2026, 9, 25, 0, 30),
  );
  // Spring-forward gap in New York (clocks jump 02:00 -> 03:00 EDT): 02:30 becomes 03:30 EDT = 07:30 UTC
  assert.equal(
    zonedTimeToMs("2026-03-08", "02:30", NEW_YORK),
    Date.UTC(2026, 2, 8, 7, 30),
  );
  // Fall-back repeat in New York (01:30 happens in EDT then EST): picks the first (EDT = UTC-4)
  assert.equal(
    zonedTimeToMs("2026-11-01", "01:30", NEW_YORK),
    Date.UTC(2026, 10, 1, 5, 30),
  );
  // Invalid timezone behaves as UTC
  assert.equal(
    zonedTimeToMs("2026-10-12", "14:15", "Not/AZone"),
    Date.UTC(2026, 9, 12, 14, 15),
  );
});

// ---------------------------------------------------------------- shiftWindow
test("shiftWindow computes instants for day, night, DST changeovers, flex, and window clamping", () => {
  const dayWin = shiftWindow({ dayKey: "2026-10-12", shift: dayShift }, ACCRA);
  assert.deepEqual(dayWin, {
    startMs: Date.UTC(2026, 9, 12, 9, 0),
    endMs: Date.UTC(2026, 9, 12, 17, 0),
    opensMs: Date.UTC(2026, 9, 12, 7, 0),
    closesMs: Date.UTC(2026, 9, 12, 19, 0),
  });

  const nightWin = shiftWindow({ dayKey: "2026-10-12", shift: nightShift }, ACCRA);
  assert.equal(nightWin.startMs, Date.UTC(2026, 9, 12, 22, 0));
  assert.equal(nightWin.endMs, Date.UTC(2026, 9, 13, 6, 0));
  assert.equal(nightWin.endMs - nightWin.startMs, 8 * 3600_000);

  // Clocks go back during Saturday 2026-10-24 night shift in Europe/London -> 9 hours of real time
  const fallBackNight = shiftWindow({ dayKey: "2026-10-24", shift: nightShift }, LONDON);
  assert.equal(fallBackNight.endMs - fallBackNight.startMs, 9 * 3600_000);

  // Clocks go forward during Saturday 2026-03-28 night shift in Europe/London -> 7 hours of real time
  const springForwardNight = shiftWindow({ dayKey: "2026-03-28", shift: nightShift }, LONDON);
  assert.equal(springForwardNight.endMs - springForwardNight.startMs, 7 * 3600_000);

  // Flex shift window
  const flexWin = shiftWindow({ dayKey: "2026-10-12", shift: flexShift }, ACCRA);
  assert.equal(flexWin.startMs, null);
  assert.equal(flexWin.endMs, null);
  assert.equal(flexWin.opensMs, Date.UTC(2026, 9, 12, 0, 0));
  assert.equal(flexWin.closesMs, Date.UTC(2026, 9, 13, 2, 0));

  // Window length outside 30..240 or NaN falls back to 120 minutes
  for (const badWindow of [20, 500, Number.NaN]) {
    const w = shiftWindow({ dayKey: "2026-10-12", shift: dayShift }, ACCRA, badWindow);
    assert.equal(w.opensMs, Date.UTC(2026, 9, 12, 7, 0));
    assert.equal(w.closesMs, Date.UTC(2026, 9, 12, 19, 0));
  }
  const customWin = shiftWindow({ dayKey: "2026-10-12", shift: dayShift }, ACCRA, 60);
  assert.equal(customWin.opensMs, Date.UTC(2026, 9, 12, 8, 0));
  assert.equal(customWin.closesMs, Date.UTC(2026, 9, 12, 18, 0));
});

// ---------------------------------------------------------------- classifyScan
test("classifyScan enforces exact inclusive window boundaries", () => {
  const assignments = [{ dayKey: "2026-10-12", shift: dayShift }];
  const opensMs = Date.UTC(2026, 9, 12, 7, 0);
  const closesMs = Date.UTC(2026, 9, 12, 19, 0);

  const atOpen = classifyScan({ nowMs: opensMs, timezone: ACCRA, assignments, states: {} });
  assert.equal(atOpen.kind, "matched");

  const beforeOpen = classifyScan({ nowMs: opensMs - 1, timezone: ACCRA, assignments, states: {} });
  assert.equal(beforeOpen.kind, "outside");
  if (beforeOpen.kind === "outside") assert.equal(beforeOpen.reason, "too_early");

  const atClose = classifyScan({ nowMs: closesMs, timezone: ACCRA, assignments, states: {} });
  assert.equal(atClose.kind, "matched");

  const afterClose = classifyScan({ nowMs: closesMs + 1, timezone: ACCRA, assignments, states: {} });
  assert.equal(afterClose.kind, "outside");
  if (afterClose.kind === "outside") assert.equal(afterClose.reason, "too_late");
});

test("classifyScan computes late and earlyDeparture flags by whole minute and only on first check-in", () => {
  const dayAssign = [{ dayKey: "2026-10-12", shift: dayShift }];
  const nightAssign = [{ dayKey: "2026-10-12", shift: nightShift }];

  // Day shift grace 0: 09:00:59 not late; 09:01:00 late
  const at090059 = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 9, 0, 59),
    timezone: ACCRA,
    assignments: dayAssign,
    states: {},
  });
  assert.equal(at090059.kind, "matched");
  if (at090059.kind === "matched") assert.equal(at090059.late, false);

  const at090100 = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 9, 1, 0),
    timezone: ACCRA,
    assignments: dayAssign,
    states: {},
  });
  assert.equal(at090100.kind, "matched");
  if (at090100.kind === "matched") assert.equal(at090100.late, true);

  // Night shift grace 10: 22:10:59 not late; 22:11:00 late
  const at221059 = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 22, 10, 59),
    timezone: ACCRA,
    assignments: nightAssign,
    states: {},
  });
  assert.equal(at221059.kind, "matched");
  if (at221059.kind === "matched") assert.equal(at221059.late, false);

  const at221100 = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 22, 11, 0),
    timezone: ACCRA,
    assignments: nightAssign,
    states: {},
  });
  assert.equal(at221100.kind, "matched");
  if (at221100.kind === "matched") assert.equal(at221100.late, true);

  // Re-entry after checking out on the same shift day is direction "in" and late: false
  const reEntry = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 9, 30, 0),
    timezone: ACCRA,
    assignments: dayAssign,
    states: { "2026-10-12": { lastType: "out" } },
  });
  assert.equal(reEntry.kind, "matched");
  if (reEntry.kind === "matched") {
    assert.equal(reEntry.direction, "in");
    assert.equal(reEntry.late, false);
  }

  // Early departure: out at 16:59 is early; out at 17:00 is not
  const out1659 = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 16, 59, 59),
    timezone: ACCRA,
    assignments: dayAssign,
    states: { "2026-10-12": { lastType: "in" } },
  });
  assert.equal(out1659.kind, "matched");
  if (out1659.kind === "matched") {
    assert.equal(out1659.direction, "out");
    assert.equal(out1659.earlyDeparture, true);
  }

  const out1700 = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 17, 0, 0),
    timezone: ACCRA,
    assignments: dayAssign,
    states: { "2026-10-12": { lastType: "in" } },
  });
  assert.equal(out1700.kind, "matched");
  if (out1700.kind === "matched") {
    assert.equal(out1700.direction, "out");
    assert.equal(out1700.earlyDeparture, false);
  }
});

test("classifyScan keeps a night shift across midnight attached to the start day", () => {
  const assignments = [{ dayKey: "2026-10-12", shift: nightShift }];

  const monIn = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 21, 55, 0),
    timezone: ACCRA,
    assignments,
    states: {},
  });
  assert.equal(monIn.kind, "matched");
  if (monIn.kind === "matched") {
    assert.equal(monIn.shiftDay, "2026-10-12");
    assert.equal(monIn.direction, "in");
    assert.equal(monIn.late, false);
    assert.equal(monIn.earlyDeparture, false);
  }

  const tueOut = classifyScan({
    nowMs: Date.UTC(2026, 9, 13, 6, 5, 0),
    timezone: ACCRA,
    assignments,
    states: { "2026-10-12": { lastType: "in" } },
  });
  assert.equal(tueOut.kind, "matched");
  if (tueOut.kind === "matched") {
    assert.equal(tueOut.shiftDay, "2026-10-12");
    assert.equal(tueOut.direction, "out");
    assert.equal(tueOut.late, false);
    assert.equal(tueOut.earlyDeparture, false);
  }
});

test("classifyScan resolves overlapping shift windows using shift state and re-entry rules", () => {
  const monNight = { dayKey: "2026-10-12", shift: nightShift }; // closes Tue 08:00
  const tueDay = { dayKey: "2026-10-13", shift: dayShift }; // opens Tue 07:00
  const tue0730 = Date.UTC(2026, 9, 13, 7, 30, 0);

  // Still checked in on Monday night -> Tuesday 07:30 checks out of Monday
  const stillIn = classifyScan({
    nowMs: tue0730,
    timezone: ACCRA,
    assignments: [monNight, tueDay],
    states: { "2026-10-12": { lastType: "in" } },
  });
  assert.equal(stillIn.kind, "matched");
  if (stillIn.kind === "matched") {
    assert.equal(stillIn.shiftDay, "2026-10-12");
    assert.equal(stillIn.direction, "out");
  }

  // Already checked out of Monday night at 06:00 -> Tuesday 07:30 checks into Tuesday day shift
  const alreadyOut = classifyScan({
    nowMs: tue0730,
    timezone: ACCRA,
    assignments: [monNight, tueDay],
    states: { "2026-10-12": { lastType: "out" } },
  });
  assert.equal(alreadyOut.kind, "matched");
  if (alreadyOut.kind === "matched") {
    assert.equal(alreadyOut.shiftDay, "2026-10-13");
    assert.equal(alreadyOut.direction, "in");
  }

  // Only Monday night shift is assigned, state "out", scan at Tuesday 07:00 -> re-entry on Monday
  const reEntryOnlyNight = classifyScan({
    nowMs: Date.UTC(2026, 9, 13, 7, 0, 0),
    timezone: ACCRA,
    assignments: [monNight],
    states: { "2026-10-12": { lastType: "out" } },
  });
  assert.equal(reEntryOnlyNight.kind, "matched");
  if (reEntryOnlyNight.kind === "matched") {
    assert.equal(reEntryOnlyNight.shiftDay, "2026-10-12");
    assert.equal(reEntryOnlyNight.direction, "in");
  }
});

test("classifyScan never marks flex shifts as late or early departure", () => {
  const assignments = [{ dayKey: "2026-10-12", shift: flexShift }];
  const inAt2359 = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 23, 59, 0),
    timezone: ACCRA,
    assignments,
    states: {},
  });
  assert.equal(inAt2359.kind, "matched");
  if (inAt2359.kind === "matched") {
    assert.equal(inAt2359.direction, "in");
    assert.equal(inAt2359.late, false);
    assert.equal(inAt2359.earlyDeparture, false);
  }

  const outEarly = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 10, 0, 0),
    timezone: ACCRA,
    assignments,
    states: { "2026-10-12": { lastType: "in" } },
  });
  assert.equal(outEarly.kind, "matched");
  if (outEarly.kind === "matched") {
    assert.equal(outEarly.direction, "out");
    assert.equal(outEarly.late, false);
    assert.equal(outEarly.earlyDeparture, false);
  }
});

test("classifyScan and describeOutside handle outside-window scans and unassigned cases", () => {
  const monNight = { dayKey: "2026-10-12", shift: nightShift };

  // Outside, too early: Monday 15:00 with Monday night shift only
  const tooEarly = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 15, 0, 0),
    timezone: ACCRA,
    assignments: [monNight],
    states: {},
  });
  assert.equal(tooEarly.kind, "outside");
  if (tooEarly.kind === "outside") {
    assert.equal(tooEarly.reason, "too_early");
    assert.equal(tooEarly.shiftDay, "2026-10-12");
    assert.equal(
      describeOutside(tooEarly, ACCRA),
      "Your shift starts at 22:00. Scanning opens at 20:00.",
    );
  }

  // Outside, too late: Tuesday 10:00 with only Monday night shift
  const tooLate = classifyScan({
    nowMs: Date.UTC(2026, 9, 13, 10, 0, 0),
    timezone: ACCRA,
    assignments: [monNight],
    states: {},
  });
  assert.equal(tooLate.kind, "outside");
  if (tooLate.kind === "outside") {
    assert.equal(tooLate.reason, "too_late");
    assert.equal(tooLate.shiftDay, "2026-10-12");
    assert.equal(
      describeOutside(tooLate, ACCRA),
      "Your shift ended at 06:00 and scanning closed at 08:00. Please speak to your manager.",
    );
  }

  // Flex outside message
  const flexTooLate = classifyScan({
    nowMs: Date.UTC(2026, 9, 13, 4, 0, 0),
    timezone: ACCRA,
    assignments: [{ dayKey: "2026-10-12", shift: flexShift }],
    states: {},
  });
  assert.equal(flexTooLate.kind, "outside");
  if (flexTooLate.kind === "outside") {
    assert.equal(
      describeOutside(flexTooLate, ACCRA),
      "Your flexible shift for 2026-10-12 has closed. Please speak to your manager.",
    );
  }

  // Closed yesterday shift + upcoming today shift -> too_early about today's shift
  const tueNight = { dayKey: "2026-10-13", shift: nightShift };
  const both = classifyScan({
    nowMs: Date.UTC(2026, 9, 13, 12, 0, 0),
    timezone: ACCRA,
    assignments: [monNight, tueNight],
    states: {},
  });
  assert.equal(both.kind, "outside");
  if (both.kind === "outside") {
    assert.equal(both.reason, "too_early");
    assert.equal(both.shiftDay, "2026-10-13");
  }

  // Unassigned: empty, only tomorrow's unopened shift, or other days
  assert.deepEqual(
    classifyScan({
      nowMs: Date.UTC(2026, 9, 12, 12, 0, 0),
      timezone: ACCRA,
      assignments: [],
      states: {},
    }),
    { kind: "unassigned" },
  );
  assert.deepEqual(
    classifyScan({
      nowMs: Date.UTC(2026, 9, 12, 12, 0, 0),
      timezone: ACCRA,
      assignments: [{ dayKey: "2026-10-13", shift: dayShift }],
      states: {},
    }),
    { kind: "unassigned" },
  );
  assert.deepEqual(
    classifyScan({
      nowMs: Date.UTC(2026, 9, 12, 12, 0, 0),
      timezone: ACCRA,
      assignments: [{ dayKey: "2026-10-10", shift: dayShift }],
      states: {},
    }),
    { kind: "unassigned" },
  );
});

test("classifyScan ignores malformed assignments, respects timezone, and never mutates input", () => {
  const inputAssignments = [
    { dayKey: "not-a-date", shift: dayShift },
    { dayKey: "2026-02-30", shift: dayShift },
    { dayKey: "2026-10-12", shift: null },
    { dayKey: "2026-10-12", shift: { ...dayShift, start: "bad" } },
    { dayKey: "2026-10-12", shift: dayShift },
  ];
  const snapshotCopy = JSON.stringify(inputAssignments);

  const resAccra = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 9, 0, 0),
    timezone: ACCRA,
    assignments: inputAssignments,
    states: {},
  });
  assert.equal(resAccra.kind, "matched");
  assert.equal(JSON.stringify(inputAssignments), snapshotCopy);

  // Same assignment in America/New_York (UTC-4 on 2026-10-12) has startMs = 13:00 UTC instead of 09:00 UTC
  const resNy = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 13, 0, 0),
    timezone: NEW_YORK,
    assignments: [{ dayKey: "2026-10-12", shift: dayShift }],
    states: {},
  });
  assert.equal(resNy.kind, "matched");
  if (resAccra.kind === "matched" && resNy.kind === "matched") {
    assert.notEqual(resAccra.window.startMs, resNy.window.startMs);
    assert.equal(resNy.window.startMs - resAccra.window.startMs, 4 * 3600_000);
  }
});

// ---------------------------------------------------------------- shiftDayStatus
test("shiftDayStatus covers every priority branch, custom cutoff, flex, and overnight shifts", () => {
  const monDay = { dayKey: "2026-10-12", shift: dayShift }; // starts 09:00 UTC
  const monFlex = { dayKey: "2026-10-12", shift: flexShift };
  const sunNight = { dayKey: "2026-10-11", shift: nightShift }; // starts Sun 22:00 UTC

  const cases = [
    // Scan beats leave, holiday, and rostered
    {
      name: "scan beats leave and holiday",
      input: {
        assignment: monDay,
        hasScan: true,
        onLeave: true,
        isHoliday: true,
        nowMs: Date.UTC(2026, 9, 12, 12, 0),
        timezone: ACCRA,
      },
      expected: "present",
    },
    // Leave beats holiday and rostered
    {
      name: "leave beats holiday",
      input: {
        assignment: monDay,
        hasScan: false,
        onLeave: true,
        isHoliday: true,
        nowMs: Date.UTC(2026, 9, 12, 12, 0),
        timezone: ACCRA,
      },
      expected: "on_leave",
    },
    // Holiday beats rostered
    {
      name: "holiday beats rostered",
      input: {
        assignment: monDay,
        hasScan: false,
        onLeave: false,
        isHoliday: true,
        nowMs: Date.UTC(2026, 9, 12, 12, 0),
        timezone: ACCRA,
      },
      expected: "holiday",
    },
    // Not rostered when assignment is null
    {
      name: "not rostered",
      input: {
        assignment: null,
        hasScan: false,
        onLeave: false,
        isHoliday: false,
        nowMs: Date.UTC(2026, 9, 12, 12, 0),
        timezone: ACCRA,
      },
      expected: "not_rostered",
    },
    // Expected one minute before start + 60 (09:59)
    {
      name: "expected at 09:59 (1m before start + 60)",
      input: {
        assignment: monDay,
        hasScan: false,
        onLeave: false,
        isHoliday: false,
        nowMs: Date.UTC(2026, 9, 12, 9, 59),
        timezone: ACCRA,
      },
      expected: "expected",
    },
    // Absent at exactly start + 60 (10:00)
    {
      name: "absent at 10:00 (exactly start + 60)",
      input: {
        assignment: monDay,
        hasScan: false,
        onLeave: false,
        isHoliday: false,
        nowMs: Date.UTC(2026, 9, 12, 10, 0),
        timezone: ACCRA,
      },
      expected: "absent",
    },
    // Custom absentAfterMinutes (30m -> absent at 09:30)
    {
      name: "custom absentAfterMinutes = 30",
      input: {
        assignment: monDay,
        hasScan: false,
        onLeave: false,
        isHoliday: false,
        nowMs: Date.UTC(2026, 9, 12, 9, 30),
        timezone: ACCRA,
        absentAfterMinutes: 30,
      },
      expected: "absent",
    },
    // Flex expected until end of day, then absent at start of next day
    {
      name: "flex expected at 23:59",
      input: {
        assignment: monFlex,
        hasScan: false,
        onLeave: false,
        isHoliday: false,
        nowMs: Date.UTC(2026, 9, 12, 23, 59, 59),
        timezone: ACCRA,
      },
      expected: "expected",
    },
    {
      name: "flex absent at 00:00 next day",
      input: {
        assignment: monFlex,
        hasScan: false,
        onLeave: false,
        isHoliday: false,
        nowMs: Date.UTC(2026, 9, 13, 0, 0, 0),
        timezone: ACCRA,
      },
      expected: "absent",
    },
    // Night shift that started yesterday at 22:00: at 01:00 today is present with scan, absent without
    {
      name: "yesterday night shift at 01:00 today with scan is present",
      input: {
        assignment: sunNight,
        hasScan: true,
        onLeave: false,
        isHoliday: false,
        nowMs: Date.UTC(2026, 9, 12, 1, 0, 0),
        timezone: ACCRA,
      },
      expected: "present",
    },
    {
      name: "yesterday night shift at 01:00 today without scan is absent",
      input: {
        assignment: sunNight,
        hasScan: false,
        onLeave: false,
        isHoliday: false,
        nowMs: Date.UTC(2026, 9, 12, 1, 0, 0),
        timezone: ACCRA,
      },
      expected: "absent",
    },
  ];

  for (const c of cases) {
    assert.equal(shiftDayStatus(c.input), c.expected, c.name);
  }
});

// ---------------------------------------------------------------- parseShiftInput
test("parseShiftInput accepts valid day, night, and flex shifts and cleans names", () => {
  const validDay = parseShiftInput({
    name: "  Morning\u0000   Shift \u0007 ",
    type: "day",
    start: "09:00",
    end: "17:00",
    expectedMinutes: 300, // ignored for non-flex
  });
  assert.deepEqual(validDay, {
    ok: true,
    value: {
      name: "Morning Shift",
      type: "day",
      start: "09:00",
      end: "17:00",
      graceMinutes: 0,
      expectedMinutes: null,
    },
  });

  const validNight = parseShiftInput({
    name: "Night Shift",
    type: "night",
    start: "22:00",
    end: "06:00",
    graceMinutes: 15,
  });
  assert.deepEqual(validNight, {
    ok: true,
    value: {
      name: "Night Shift",
      type: "night",
      start: "22:00",
      end: "06:00",
      graceMinutes: 15,
      expectedMinutes: null,
    },
  });

  const validFlex = parseShiftInput({
    name: "Flexible Hours",
    type: "flex",
    start: "09:00", // ignored for flex
    end: "17:00",
    graceMinutes: 10,
    expectedMinutes: 480,
  });
  assert.deepEqual(validFlex, {
    ok: true,
    value: {
      name: "Flexible Hours",
      type: "flex",
      start: null,
      end: null,
      graceMinutes: 10,
      expectedMinutes: 480,
    },
  });
});

test("parseShiftInput rejects every invalid input with a plain sentence", () => {
  const invalidCases = [
    { name: "", type: "day", start: "09:00", end: "17:00" },
    { name: "   \u0000 ", type: "day", start: "09:00", end: "17:00" },
    { name: "A".repeat(41), type: "day", start: "09:00", end: "17:00" },
    { name: "Day", type: "weekend", start: "09:00", end: "17:00" },
    { name: "Day", type: "day", start: "9:00", end: "17:00" },
    { name: "Day", type: "day", start: "24:00", end: "17:00" },
    { name: "Day", type: "day", start: "09:60", end: "17:00" },
    { name: "Day", type: "day", start: "09:00", end: "9:00" },
    { name: "Day", type: "day", start: "09:00", end: "09:00" },
    { name: "Too Long", type: "day", start: "06:00", end: "22:01" }, // 16h 1m > 16h
    { name: "Day", type: "day", start: "09:00", end: "17:00", graceMinutes: 121 },
    { name: "Day", type: "day", start: "09:00", end: "17:00", graceMinutes: -1 },
    { name: "Day", type: "day", start: "09:00", end: "17:00", graceMinutes: 1.5 },
    { name: "Day", type: "day", start: "09:00", end: "17:00", graceMinutes: "5" },
    { name: "Flex", type: "flex" },
    { name: "Flex", type: "flex", expectedMinutes: 59 },
    { name: "Flex", type: "flex", expectedMinutes: 1441 },
    { name: "Flex", type: "flex", expectedMinutes: 120.5 },
  ];

  for (const input of invalidCases) {
    const res = parseShiftInput(input);
    assert.equal(res.ok, false, `Expected failure for ${JSON.stringify(input)}`);
    if (!res.ok) {
      assert.ok(res.error.length > 5 && res.error.endsWith("."));
    }
  }
});

// ---------------------------------------------------------------- expandAssignmentRange
test("expandAssignmentRange lists matching weekdays and rejects invalid ranges", () => {
  const monToFri = expandAssignmentRange({
    fromDay: "2026-10-12",
    toDay: "2026-10-18",
    weekdays: [0, 1, 2, 3, 4],
  });
  assert.deepEqual(monToFri, {
    ok: true,
    days: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
  });

  // Duplicate weekdays do not duplicate days
  const deduped = expandAssignmentRange({
    fromDay: "2026-10-12",
    toDay: "2026-10-18",
    weekdays: [0, 0, 4, 4],
  });
  assert.deepEqual(deduped, {
    ok: true,
    days: ["2026-10-12", "2026-10-16"],
  });

  // Span of exactly 62 days (2026-10-12..2026-12-12) is allowed
  const span62 = expandAssignmentRange({
    fromDay: "2026-10-12",
    toDay: "2026-12-12",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  assert.equal(span62.ok, true);
  if (span62.ok) assert.equal(span62.days.length, 62);

  // Span of 63 days (2026-10-12..2026-12-13) is refused
  const span63 = expandAssignmentRange({
    fromDay: "2026-10-12",
    toDay: "2026-12-13",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  assert.equal(span63.ok, false);

  // Error cases: fromDay after toDay, no weekday, weekday 7, no matching day, invalid date
  const badRanges = [
    { fromDay: "2026-10-15", toDay: "2026-10-12", weekdays: [0] },
    { fromDay: "2026-10-12", toDay: "2026-10-15", weekdays: [] },
    { fromDay: "2026-10-12", toDay: "2026-10-15", weekdays: [7] },
    { fromDay: "2026-10-12", toDay: "2026-10-13", weekdays: [6] }, // Mon-Tue has no Sunday
    { fromDay: "2026-02-29", toDay: "2026-03-01", weekdays: [0, 6] }, // 2026 is not a leap year
  ];
  for (const b of badRanges) {
    const r = expandAssignmentRange(b);
    assert.equal(r.ok, false, `Expected failure for ${JSON.stringify(b)}`);
    if (!r.ok) assert.ok(r.error.length > 5);
  }
});

// ---------------------------------------------------------------- assignmentId
test("assignmentId builds deterministic IDs and throws on empty parts or slashes", () => {
  assert.equal(assignmentId("emp123", "2026-10-12"), "emp123_2026-10-12");
  assert.throws(() => assignmentId("", "2026-10-12"));
  assert.throws(() => assignmentId("emp123", ""));
  assert.throws(() => assignmentId("   ", "2026-10-12"));
  assert.throws(() => assignmentId("emp/123", "2026-10-12"));
  assert.throws(() => assignmentId("emp123", "2026/10/12"));
});

// ---------------------------------------------------------------- extra edge cases
test("classifyScan tie-breaking: latest started startMs, earliest opensMs when unstarted, and shiftId tie-break", () => {
  const early = {
    shiftId: "s_early",
    name: "Early",
    type: "early",
    start: "06:00",
    end: "14:00",
    graceMinutes: 0,
    expectedMinutes: null,
  };
  const day = {
    shiftId: "s_day",
    name: "Day",
    type: "day",
    start: "09:00",
    end: "17:00",
    graceMinutes: 0,
    expectedMinutes: null,
  };

  // At 09:30 both have started -> latest startMs (09:00) wins
  const bothStarted = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 9, 30),
    timezone: ACCRA,
    assignments: [
      { dayKey: "2026-10-12", shift: early },
      { dayKey: "2026-10-12", shift: day },
    ],
    states: {},
  });
  assert.equal(bothStarted.kind, "matched");
  if (bothStarted.kind === "matched") assert.equal(bothStarted.shift.shiftId, "s_day");

  // Neither has started (06:00 opens at 04:00, 07:00 opens at 05:00; scan at 05:15) -> earliest opensMs (04:00) wins
  const early7 = { ...early, shiftId: "s_early7", start: "07:00", end: "15:00" };
  const neitherStarted = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 5, 15),
    timezone: ACCRA,
    assignments: [
      { dayKey: "2026-10-12", shift: early7 },
      { dayKey: "2026-10-12", shift: early },
    ],
    states: {},
  });
  assert.equal(neitherStarted.kind, "matched");
  if (neitherStarted.kind === "matched") assert.equal(neitherStarted.shift.shiftId, "s_early");

  // Identical dayKey and times -> tie broken by shiftId
  const twinA = { ...day, shiftId: "a_shift" };
  const twinB = { ...day, shiftId: "b_shift" };
  const tied = classifyScan({
    nowMs: Date.UTC(2026, 9, 12, 9, 0),
    timezone: ACCRA,
    assignments: [
      { dayKey: "2026-10-12", shift: twinB },
      { dayKey: "2026-10-12", shift: twinA },
    ],
    states: {},
  });
  assert.equal(tied.kind, "matched");
  if (tied.kind === "matched") assert.equal(tied.shift.shiftId, "a_shift");
});

test("shiftDayStatus clamps out-of-range or non-finite absentAfterMinutes to the 60-minute default", () => {
  const monDay = { dayKey: "2026-10-12", shift: dayShift }; // starts 09:00 UTC
  for (const invalidAfter of [-10, 721, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      shiftDayStatus({
        assignment: monDay,
        hasScan: false,
        onLeave: false,
        isHoliday: false,
        nowMs: Date.UTC(2026, 9, 12, 9, 59),
        timezone: ACCRA,
        absentAfterMinutes: invalidAfter,
      }),
      "expected",
    );
    assert.equal(
      shiftDayStatus({
        assignment: monDay,
        hasScan: false,
        onLeave: false,
        isHoliday: false,
        nowMs: Date.UTC(2026, 9, 12, 10, 0),
        timezone: ACCRA,
        absentAfterMinutes: invalidAfter,
      }),
      "absent",
    );
  }
});

