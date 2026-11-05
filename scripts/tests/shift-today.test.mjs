import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTodayWithShifts } from "../../src/lib/shift-today.ts";
import {
  buildTodayFromSummaries,
  buildWeekTrendFromSummaries,
} from "../../src/lib/attendance-today.ts";

const TZ = "Africa/Accra";
const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";

const dayShift = {
  shiftId: "shift-day",
  name: "Day shift",
  type: "day",
  start: "09:00",
  end: "17:00",
  graceMinutes: 0,
  expectedMinutes: null,
};

const nightShift = {
  shiftId: "shift-night",
  name: "Night shift",
  type: "night",
  start: "22:00",
  end: "06:00",
  graceMinutes: 0,
  expectedMinutes: null,
};

const settings = {
  shiftsEnabled: true,
  shiftScanMode: "strict",
  shiftWindowMinutes: 120,
};

const roster = [
  { uid: "emp-1", displayName: "Ama Day" },
  { uid: "emp-2", displayName: "Kofi Night" },
  { uid: "emp-3", displayName: "Akua Unassigned" },
  { uid: "emp-4", displayName: "Yaw Flex" },
];

function makeSummary(employeeId, day, extra = {}) {
  return {
    orgId: "org-1",
    managerId: "mgr-1",
    employeeId,
    employeeName: employeeId,
    department: "Engineering",
    dayKey: day,
    firstIn: `${day}T08:55:00.000Z`,
    lastOut: null,
    lastEventType: "in",
    lastEventAt: `${day}T08:55:00.000Z`,
    state: "in",
    openSince: `${day}T08:55:00.000Z`,
    minutesWorked: 0,
    eventCount: 1,
    late: false,
    earlyDeparture: false,
    schemaVersion: 1,
    updatedAt: `${day}T08:55:00.000Z`,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Day worker tests
// ---------------------------------------------------------------------------
test("Day worker: scan at 08:55 -> present, not late", () => {
  const now = Date.UTC(2026, 9, 12, 8, 55);
  const assignments = [{ employeeId: "emp-1", dayKey: MONDAY, shift: dayShift }];
  const summaries = [makeSummary("emp-1", MONDAY, { firstIn: "2026-10-12T08:55:00.000Z", late: false })];

  const res = buildTodayWithShifts({
    summaries,
    recentEvents: [],
    roster: [roster[0]],
    assignments,
    leaves: [],
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.present, 1);
  assert.equal(res.counts.onSite, 1);
  assert.equal(res.counts.late, 0);
  assert.equal(res.counts.absent, 0);
  assert.equal(res.counts.expected, 1);
  assert.equal(res.notArrived.length, 0);
});

test("Day worker: at 09:30 with no scan -> still expected (not absent yet)", () => {
  const now = Date.UTC(2026, 9, 12, 9, 30);
  const assignments = [{ employeeId: "emp-1", dayKey: MONDAY, shift: dayShift }];

  const res = buildTodayWithShifts({
    summaries: [],
    recentEvents: [],
    roster: [roster[0]],
    assignments,
    leaves: [],
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.present, 0);
  assert.equal(res.counts.absent, 0);
  assert.equal(res.counts.expected, 1); // 0 present + 1 expected + 0 absent
  assert.equal(res.notArrived.length, 1);
  assert.equal(res.notArrived[0].employeeId, "emp-1");
});

test("Day worker: at 10:00 with no scan -> absent (absentAfter 60)", () => {
  const now = Date.UTC(2026, 9, 12, 10, 0);
  const assignments = [{ employeeId: "emp-1", dayKey: MONDAY, shift: dayShift }];

  const res = buildTodayWithShifts({
    summaries: [],
    recentEvents: [],
    roster: [roster[0]],
    assignments,
    leaves: [],
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.present, 0);
  assert.equal(res.counts.absent, 1);
  assert.equal(res.counts.expected, 1);
  assert.equal(res.notArrived.length, 1);
  assert.equal(res.notArrived[0].employeeId, "emp-1");
});

test("Day worker: with onLeave -> on_leave and not expected", () => {
  const now = Date.UTC(2026, 9, 12, 10, 0);
  const assignments = [{ employeeId: "emp-1", dayKey: MONDAY, shift: dayShift }];
  const leaves = [{ employeeId: "emp-1", startDate: MONDAY, endDate: MONDAY, status: "approved" }];

  const res = buildTodayWithShifts({
    summaries: [],
    recentEvents: [],
    roster: [roster[0]],
    assignments,
    leaves,
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.onLeave, 1);
  assert.equal(res.counts.expected, 0);
  assert.equal(res.counts.absent, 0);
  assert.equal(res.counts.present, 0);
  assert.equal(res.notArrived.length, 0);
});

// ---------------------------------------------------------------------------
// Night worker tests
// ---------------------------------------------------------------------------
test("Night worker at Tuesday 01:00 with Monday summary state 'in' -> present and onSite, not in notArrived", () => {
  const now = Date.UTC(2026, 9, 13, 1, 0); // Tuesday 01:00
  const assignments = [{ employeeId: "emp-2", dayKey: MONDAY, shift: nightShift }];
  const summaries = [
    makeSummary("emp-2", MONDAY, {
      firstIn: "2026-10-12T22:05:00.000Z",
      state: "in",
      late: false,
    }),
  ];

  const res = buildTodayWithShifts({
    summaries,
    recentEvents: [],
    roster: [roster[1]],
    assignments,
    leaves: [],
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.present, 1);
  assert.equal(res.counts.onSite, 1);
  assert.equal(res.counts.absent, 0);
  assert.equal(res.counts.expected, 1);
  assert.equal(res.notArrived.length, 0);
});

test("Night worker at Tuesday 06:30 with Monday summary 'out' and shift ended -> no longer relevant (not_rostered)", () => {
  const now = Date.UTC(2026, 9, 13, 6, 30); // Tuesday 06:30
  const assignments = [{ employeeId: "emp-2", dayKey: MONDAY, shift: nightShift }];
  const summaries = [
    makeSummary("emp-2", MONDAY, {
      firstIn: "2026-10-12T21:55:00.000Z",
      lastOut: "2026-10-13T06:05:00.000Z",
      state: "out",
    }),
  ];

  const res = buildTodayWithShifts({
    summaries,
    recentEvents: [],
    roster: [roster[1]],
    assignments,
    leaves: [],
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  // Monday's shift is over and closed. No Tuesday assignment -> not_rostered
  assert.equal(res.counts.present, 0);
  assert.equal(res.counts.onSite, 0);
  assert.equal(res.counts.expected, 0);
  assert.equal(res.counts.absent, 0);
  assert.equal(res.counts.notRostered, 1);
  assert.equal(res.notArrived.length, 0);
});

test("Night worker at Tuesday 07:30 with Monday summary still 'in' -> still present and onSite on Monday's shift", () => {
  const now = Date.UTC(2026, 9, 13, 7, 30); // Tuesday 07:30 (before window closes at 08:00)
  const assignments = [{ employeeId: "emp-2", dayKey: MONDAY, shift: nightShift }];
  const summaries = [
    makeSummary("emp-2", MONDAY, {
      firstIn: "2026-10-12T21:55:00.000Z",
      state: "in",
    }),
  ];

  const res = buildTodayWithShifts({
    summaries,
    recentEvents: [],
    roster: [roster[1]],
    assignments,
    leaves: [],
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.present, 1);
  assert.equal(res.counts.onSite, 1);
  assert.equal(res.counts.expected, 1);
  assert.equal(res.notArrived.length, 0);
});

test("Night worker at Tuesday 09:00 with Monday summary still 'in' (window closed) -> not relevant, not on site, not_rostered", () => {
  const now = Date.UTC(2026, 9, 13, 9, 0); // Tuesday 09:00 (window closed at 08:00)
  const assignments = [{ employeeId: "emp-2", dayKey: MONDAY, shift: nightShift }];
  const summaries = [
    makeSummary("emp-2", MONDAY, {
      firstIn: "2026-10-12T21:55:00.000Z",
      state: "in",
    }),
  ];

  const res = buildTodayWithShifts({
    summaries,
    recentEvents: [],
    roster: [roster[1]],
    assignments,
    leaves: [],
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.present, 0);
  assert.equal(res.counts.onSite, 0);
  assert.equal(res.counts.expected, 0);
  assert.equal(res.counts.absent, 0);
  assert.equal(res.counts.notRostered, 1);
  assert.equal(res.notArrived.length, 0);
});

// ---------------------------------------------------------------------------
// Unassigned person & counts add up
// ---------------------------------------------------------------------------
test("Person with no assignment is not_rostered, not counted as absent/expected, not in notArrived, counts add up", () => {
  const now = Date.UTC(2026, 9, 12, 11, 0);
  // emp-1 has day shift and is present; emp-2 has night shift and is expected; emp-3 has no assignment
  const assignments = [
    { employeeId: "emp-1", dayKey: MONDAY, shift: dayShift },
    { employeeId: "emp-2", dayKey: MONDAY, shift: nightShift },
  ];
  const summaries = [makeSummary("emp-1", MONDAY, { firstIn: "2026-10-12T08:50:00.000Z", late: false })];

  const res = buildTodayWithShifts({
    summaries,
    recentEvents: [],
    roster: [roster[0], roster[1], roster[2]],
    assignments,
    leaves: [],
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.present, 1); // emp-1
  assert.equal(res.counts.absent, 0);
  assert.equal(res.counts.notRostered, 1); // emp-3
  // expected count = present (1) + expected-status (1 from emp-2) + absent (0) = 2
  assert.equal(res.counts.expected, 2);
  assert.equal(res.notArrived.length, 1);
  assert.equal(res.notArrived[0].employeeId, "emp-2");
  assert.ok(!res.notArrived.some((p) => p.employeeId === "emp-3"));
});

// ---------------------------------------------------------------------------
// Holiday today
// ---------------------------------------------------------------------------
test("Holiday today: rostered people with no scan are neither absent nor expected; a scan still shows present", () => {
  const now = Date.UTC(2026, 9, 12, 11, 0);
  const assignments = [
    { employeeId: "emp-1", dayKey: MONDAY, shift: dayShift },
    { employeeId: "emp-2", dayKey: MONDAY, shift: dayShift },
  ];
  // emp-1 scanned despite holiday; emp-2 has no scan
  const summaries = [makeSummary("emp-1", MONDAY, { firstIn: "2026-10-12T08:55:00.000Z" })];

  const res = buildTodayWithShifts({
    summaries,
    recentEvents: [],
    roster: [roster[0], roster[1]],
    assignments,
    leaves: [],
    holidays: [MONDAY],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.present, 1); // emp-1
  assert.equal(res.counts.expected, 1); // emp-1 is present, emp-2 is holiday (not expected)
  assert.equal(res.counts.absent, 0);
  assert.equal(res.notArrived.length, 0); // emp-2 is on holiday, so not in notArrived
});

// ---------------------------------------------------------------------------
// Leave covers yesterday's night shift but not today
// ---------------------------------------------------------------------------
test("Leave covers yesterday's night shift but not today -> relevant-day logic uses shift day", () => {
  const now = Date.UTC(2026, 9, 13, 1, 0); // Tuesday 01:00
  const assignments = [{ employeeId: "emp-2", dayKey: MONDAY, shift: nightShift }];
  // Leave covers Monday only
  const leaves = [{ employeeId: "emp-2", startDate: MONDAY, endDate: MONDAY, status: "approved" }];

  const res = buildTodayWithShifts({
    summaries: [],
    recentEvents: [],
    roster: [roster[1]],
    assignments,
    leaves,
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.onLeave, 1);
  assert.equal(res.counts.expected, 0);
  assert.equal(res.counts.absent, 0);
  assert.equal(res.notArrived.length, 0);
});

// ---------------------------------------------------------------------------
// Summary for non-roster person is ignored; late list and onTimeRate come from relevant, present people
// ---------------------------------------------------------------------------
test("Summary for non-roster person is ignored; late list and onTimeRate come only from relevant present people", () => {
  const now = Date.UTC(2026, 9, 12, 11, 0);
  const assignments = [
    { employeeId: "emp-1", dayKey: MONDAY, shift: dayShift },
    { employeeId: "emp-2", dayKey: MONDAY, shift: dayShift },
    { employeeId: "ghost", dayKey: MONDAY, shift: dayShift },
  ];
  const summaries = [
    makeSummary("emp-1", MONDAY, { firstIn: "2026-10-12T08:50:00.000Z", late: false, minutesWorked: 120 }),
    makeSummary("emp-2", MONDAY, { firstIn: "2026-10-12T09:15:00.000Z", late: true, minutesWorked: 100 }),
    makeSummary("ghost", MONDAY, { firstIn: "2026-10-12T09:30:00.000Z", late: true, minutesWorked: 60 }),
  ];

  const res = buildTodayWithShifts({
    summaries,
    recentEvents: [],
    roster: [roster[0], roster[1]], // ghost is NOT on roster
    assignments,
    leaves: [],
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  assert.equal(res.counts.present, 2);
  assert.equal(res.counts.late, 1); // emp-2 only
  assert.equal(res.late.length, 1);
  assert.equal(res.late[0].employeeId, "emp-2");
  assert.equal(res.onTimeRate.total, 2);
  assert.equal(res.onTimeRate.onTime, 1);
  assert.equal(res.onTimeRate.percent, 50);
  assert.equal(res.avgShift.completed, 2);
  assert.equal(res.avgShift.avgMinutes, 110);
});

// ---------------------------------------------------------------------------
// Shifts-off equivalence & result shape
// ---------------------------------------------------------------------------
test("Shifts-off equivalence: buildTodayFromSummaries is untouched with fixed input", () => {
  const fixedNow = Date.UTC(2026, 9, 12, 11, 0);
  const fixedSummaries = [
    makeSummary("emp-1", MONDAY, { firstIn: "2026-10-12T08:50:00.000Z", late: false }),
  ];
  const fixedRoster = [roster[0], roster[1]];

  const legacyRes = buildTodayFromSummaries({
    summaries: fixedSummaries,
    recentEvents: [],
    roster: fixedRoster,
    timezone: TZ,
    now: fixedNow,
  });

  assert.deepEqual(legacyRes.counts, {
    expected: 2,
    present: 1,
    onSite: 1,
    late: 0,
    onLeave: 0,
    wfh: 0,
    absent: 1,
  });
  assert.equal(legacyRes.dayKey, MONDAY);
  assert.equal(legacyRes.onTimeRate.total, 1);
  assert.equal(legacyRes.notArrived.length, 1);
  assert.equal(legacyRes.notArrived[0].employeeId, "emp-2");
});

test("Result shape: every key of existing TodaySummaryData is present; added optional fields are counts.notRostered and shiftsOn", () => {
  const now = Date.UTC(2026, 9, 12, 11, 0);
  const assignments = [{ employeeId: "emp-1", dayKey: MONDAY, shift: dayShift }];
  const summaries = [makeSummary("emp-1", MONDAY)];

  const res = buildTodayWithShifts({
    summaries,
    recentEvents: [],
    roster: [roster[0]],
    assignments,
    leaves: [],
    holidays: [],
    settings,
    timezone: TZ,
    now,
  });

  const expectedTopKeys = [
    "dayKey",
    "timezone",
    "generatedAt",
    "counts",
    "shiftsOn",
    "onTimeRate",
    "avgShift",
    "events",
    "eventsTotal",
    "late",
    "notArrived",
    "truncated",
  ];
  for (const k of expectedTopKeys) {
    assert.ok(k in res, `missing top key: ${k}`);
  }
  assert.equal(res.shiftsOn, true);
  assert.ok(typeof res.counts.notRostered === "number", "counts.notRostered is present");

  const expectedCountKeys = [
    "expected",
    "present",
    "onSite",
    "late",
    "onLeave",
    "wfh",
    "absent",
    "notRostered",
  ];
  for (const ck of expectedCountKeys) {
    assert.ok(ck in res.counts, `missing count key: ${ck}`);
  }
});

// ---------------------------------------------------------------------------
// Week trend equivalence: night shift summary filed under start day counts on start day
// ---------------------------------------------------------------------------
test("Week trend: shift-day summary counts on its start day with zero changes to week.ts", () => {
  const mondaySummary = makeSummary("emp-2", MONDAY, {
    firstIn: "2026-10-12T22:00:00.000Z",
    late: false,
  });
  const now = Date.UTC(2026, 9, 14, 12, 0); // Wednesday

  const trend = buildWeekTrendFromSummaries({
    summaries: [mondaySummary],
    timezone: TZ,
    now,
  });

  const mon = trend.find((d) => d.dayKey === MONDAY);
  assert.ok(mon);
  assert.equal(mon.present, 1);
  const tue = trend.find((d) => d.dayKey === TUESDAY);
  assert.ok(tue);
  assert.equal(tue.present, 0);
});

// ---------------------------------------------------------------------------
// Guards on the real code
// ---------------------------------------------------------------------------
test("Guards on real code: week.ts has no shift; today.ts and register.ts have SHIFTS_DISABLED and try/catch", () => {
  const weekCode = readFileSync("src/routes/api/attendance/week.ts", "utf8");
  assert.ok(!weekCode.toLowerCase().includes("shift"), "week.ts has no mention of shift");

  const todayCode = readFileSync("src/routes/api/attendance/today.ts", "utf8");
  assert.ok(todayCode.includes("SHIFTS_DISABLED"), "today.ts checks SHIFTS_DISABLED");
  assert.ok(todayCode.includes("try {"), "today.ts has try/catch for shift loading");
  assert.ok(
    todayCode.includes("buildTodayFromSummaries({"),
    "today.ts retains legacy buildTodayFromSummaries call",
  );
  assert.ok(todayCode.includes("attendance.shift_fallback"), "today.ts logs fallback on error");

  const regCode = readFileSync("src/routes/api/reports/register.ts", "utf8");
  assert.ok(regCode.includes("SHIFTS_DISABLED"), "register.ts checks SHIFTS_DISABLED");
  assert.ok(regCode.includes("try {"), "register.ts has try/catch for shift loading");
  assert.ok(regCode.includes("attendance.shift_fallback"), "register.ts logs fallback on error");

  const serverCode = readFileSync("src/lib/attendance-data.server.ts", "utf8");
  assert.ok(
    serverCode.includes('.collection("shift_assignments")'),
    "attendance-data.server.ts references shift_assignments",
  );
  assert.ok(serverCode.includes(".limit("), "attendance-data.server.ts uses bounded limit queries");
});
