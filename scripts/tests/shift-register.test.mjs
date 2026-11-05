import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";
import { STATUS_LABEL, STATUS_CODE, STATUS_FILL } from "../../src/lib/report-export.ts";

const TZ = "Africa/Accra";
// Tuesday 13 October 2026 at 09:30 UTC
const NOW = Date.UTC(2026, 9, 13, 9, 30);

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

const people = [
  { uid: "emp-1", displayName: "Ama Mensah", department: "Engineering" },
  { uid: "emp-2", displayName: "Kofi Boateng", department: "Operations" },
];

const daysRange = [
  "2026-10-10", // Saturday (past)
  "2026-10-11", // Sunday (past)
  "2026-10-12", // Monday (past)
  "2026-10-13", // Tuesday (today)
  "2026-10-14", // Wednesday (future)
];

function makeSummary(employeeId, day, extra = {}) {
  return {
    employeeId,
    employeeName: employeeId,
    department: "Engineering",
    dayKey: day,
    firstIn: "08:50",
    lastOut: "17:05",
    minutesWorked: 495,
    late: false,
    earlyDeparture: false,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Shifts-off equivalence
// ---------------------------------------------------------------------------
test("buildAttendanceRegister with no shifts gives exactly existing output for fixed input", () => {
  const summaries = [makeSummary("emp-1", "2026-10-12")];
  const leaves = [{ employeeId: "emp-2", startDate: "2026-10-12", endDate: "2026-10-13", status: "approved" }];
  const holidays = ["2026-10-14"];

  const reg = buildAttendanceRegister({
    days: daysRange,
    people,
    summaries,
    leaves,
    holidays,
    timezone: TZ,
    generatedAt: "2026-10-13T09:30:00.000Z",
    from: "2026-10-10",
    to: "2026-10-14",
  });

  const ama = reg.rows.find((r) => r.employeeId === "emp-1");
  assert.ok(ama);
  // Saturday & Sunday -> off
  assert.equal(ama.days[0].status, "off");
  assert.equal(ama.days[1].status, "off");
  // Monday -> present
  assert.equal(ama.days[2].status, "present");
  // Tuesday -> absent
  assert.equal(ama.days[3].status, "absent");
  // Wednesday -> holiday
  assert.equal(ama.days[4].status, "holiday");
  assert.equal(ama.totals.presentDays, 1);
  assert.equal(ama.totals.absentDays, 1);

  const kofi = reg.rows.find((r) => r.employeeId === "emp-2");
  assert.ok(kofi);
  assert.equal(kofi.days[2].status, "leave");
  assert.equal(kofi.days[3].status, "leave");
});

// ---------------------------------------------------------------------------
// Shifts-on behavior
// ---------------------------------------------------------------------------
test("With shifts: unassigned weekday and unassigned weekend both become 'off'", () => {
  const reg = buildAttendanceRegister({
    days: ["2026-10-11", "2026-10-12"], // Sunday and Monday
    people: [people[0]],
    summaries: [],
    leaves: [],
    holidays: [],
    timezone: TZ,
    generatedAt: "2026-10-13T09:30:00.000Z",
    from: "2026-10-11",
    to: "2026-10-12",
    shifts: {
      assignments: [], // no assignments
      nowMs: NOW,
    },
  });

  const row = reg.rows[0];
  assert.equal(row.days[0].status, "off", "unassigned Sunday is off");
  assert.equal(row.days[1].status, "off", "unassigned Monday weekday is off");
  assert.equal(row.totals.absentDays, 0);
});

test("With shifts: assigned Saturday with no scan in the past becomes 'absent'", () => {
  const reg = buildAttendanceRegister({
    days: ["2026-10-10"], // Saturday in the past (< 2026-10-13)
    people: [people[0]],
    summaries: [],
    leaves: [],
    holidays: [],
    timezone: TZ,
    generatedAt: "2026-10-13T09:30:00.000Z",
    from: "2026-10-10",
    to: "2026-10-10",
    shifts: {
      assignments: [{ employeeId: "emp-1", dayKey: "2026-10-10", shift: dayShift }],
      nowMs: NOW,
    },
  });

  const row = reg.rows[0];
  assert.equal(row.days[0].status, "absent", "assigned past Saturday without scan is absent");
  assert.equal(row.totals.absentDays, 1);
});

test("With shifts: assigned and scanned becomes 'present'", () => {
  const summaries = [makeSummary("emp-1", "2026-10-12")];
  const reg = buildAttendanceRegister({
    days: ["2026-10-12"],
    people: [people[0]],
    summaries,
    leaves: [],
    holidays: [],
    timezone: TZ,
    generatedAt: "2026-10-13T09:30:00.000Z",
    from: "2026-10-12",
    to: "2026-10-12",
    shifts: {
      assignments: [{ employeeId: "emp-1", dayKey: "2026-10-12", shift: dayShift }],
      nowMs: NOW,
    },
  });

  const row = reg.rows[0];
  assert.equal(row.days[0].status, "present");
  assert.equal(row.totals.presentDays, 1);
});

test("With shifts: leave beats assignment", () => {
  const leaves = [{ employeeId: "emp-1", startDate: "2026-10-12", endDate: "2026-10-12", status: "approved" }];
  const reg = buildAttendanceRegister({
    days: ["2026-10-12"],
    people: [people[0]],
    summaries: [],
    leaves,
    holidays: [],
    timezone: TZ,
    generatedAt: "2026-10-13T09:30:00.000Z",
    from: "2026-10-12",
    to: "2026-10-12",
    shifts: {
      assignments: [{ employeeId: "emp-1", dayKey: "2026-10-12", shift: dayShift }],
      nowMs: NOW,
    },
  });

  const row = reg.rows[0];
  assert.equal(row.days[0].status, "leave");
  assert.equal(row.totals.leaveDays, 1);
  assert.equal(row.totals.absentDays, 0);
});

test("With shifts: holiday beats assignment", () => {
  const reg = buildAttendanceRegister({
    days: ["2026-10-12"],
    people: [people[0]],
    summaries: [],
    leaves: [],
    holidays: ["2026-10-12"],
    timezone: TZ,
    generatedAt: "2026-10-13T09:30:00.000Z",
    from: "2026-10-12",
    to: "2026-10-12",
    shifts: {
      assignments: [{ employeeId: "emp-1", dayKey: "2026-10-12", shift: dayShift }],
      nowMs: NOW,
    },
  });

  const row = reg.rows[0];
  assert.equal(row.days[0].status, "holiday");
  assert.equal(row.totals.absentDays, 0);
});

test("With shifts: today before start + 60 becomes 'expected'", () => {
  // NOW is Tuesday 2026-10-13 at 09:30 UTC
  // dayShift starts at 09:00 -> start + 60 min is 10:00
  // At 09:30, it is before 10:00 -> status is expected
  const reg = buildAttendanceRegister({
    days: ["2026-10-13"],
    people: [people[0]],
    summaries: [],
    leaves: [],
    holidays: [],
    timezone: TZ,
    generatedAt: "2026-10-13T09:30:00.000Z",
    from: "2026-10-13",
    to: "2026-10-13",
    shifts: {
      assignments: [{ employeeId: "emp-1", dayKey: "2026-10-13", shift: dayShift }],
      nowMs: NOW,
    },
  });

  const row = reg.rows[0];
  assert.equal(row.days[0].status, "expected");
  assert.equal(row.totals.absentDays, 0);
});

test("With shifts: today after start + 60 becomes 'absent'", () => {
  // NOW at 10:30 UTC (after 09:00 + 60 min)
  const lateNow = Date.UTC(2026, 9, 13, 10, 30);
  const reg = buildAttendanceRegister({
    days: ["2026-10-13"],
    people: [people[0]],
    summaries: [],
    leaves: [],
    holidays: [],
    timezone: TZ,
    generatedAt: "2026-10-13T10:30:00.000Z",
    from: "2026-10-13",
    to: "2026-10-13",
    shifts: {
      assignments: [{ employeeId: "emp-1", dayKey: "2026-10-13", shift: dayShift }],
      nowMs: lateNow,
    },
  });

  const row = reg.rows[0];
  assert.equal(row.days[0].status, "absent");
  assert.equal(row.totals.absentDays, 1);
});

test("With shifts: a future assigned day becomes 'expected'", () => {
  const reg = buildAttendanceRegister({
    days: ["2026-10-14"], // tomorrow
    people: [people[0]],
    summaries: [],
    leaves: [],
    holidays: [],
    timezone: TZ,
    generatedAt: "2026-10-13T09:30:00.000Z",
    from: "2026-10-14",
    to: "2026-10-14",
    shifts: {
      assignments: [{ employeeId: "emp-1", dayKey: "2026-10-14", shift: dayShift }],
      nowMs: NOW,
    },
  });

  const row = reg.rows[0];
  assert.equal(row.days[0].status, "expected");
  assert.equal(row.totals.absentDays, 0);
});

test("With shifts: a night shift scanned yesterday shows 'present' on its start day", () => {
  // Night shift started on Monday 2026-10-12
  const summaries = [
    makeSummary("emp-1", "2026-10-12", {
      firstIn: "22:05",
      lastOut: "06:02",
      minutesWorked: 477,
    }),
  ];

  const reg = buildAttendanceRegister({
    days: ["2026-10-12", "2026-10-13"],
    people: [people[0]],
    summaries,
    leaves: [],
    holidays: [],
    timezone: TZ,
    generatedAt: "2026-10-13T09:30:00.000Z",
    from: "2026-10-12",
    to: "2026-10-13",
    shifts: {
      assignments: [{ employeeId: "emp-1", dayKey: "2026-10-12", shift: nightShift }],
      nowMs: NOW,
    },
  });

  const row = reg.rows[0];
  assert.equal(row.days[0].status, "present", "Monday shows present on its start day");
  assert.equal(row.totals.presentDays, 1);
});

test("With shifts: totals ignore 'expected' and 'off'", () => {
  const reg = buildAttendanceRegister({
    days: [
      "2026-10-10", // past Saturday with shift -> absent
      "2026-10-11", // past Sunday unassigned -> off
      "2026-10-12", // past Monday with shift and scan -> present
      "2026-10-13", // today Tuesday before start+60 -> expected
      "2026-10-14", // future Wednesday with shift -> expected
    ],
    people: [people[0]],
    summaries: [makeSummary("emp-1", "2026-10-12")],
    leaves: [],
    holidays: [],
    timezone: TZ,
    generatedAt: "2026-10-13T09:30:00.000Z",
    from: "2026-10-10",
    to: "2026-10-14",
    shifts: {
      assignments: [
        { employeeId: "emp-1", dayKey: "2026-10-10", shift: dayShift },
        { employeeId: "emp-1", dayKey: "2026-10-12", shift: dayShift },
        { employeeId: "emp-1", dayKey: "2026-10-13", shift: dayShift },
        { employeeId: "emp-1", dayKey: "2026-10-14", shift: dayShift },
      ],
      nowMs: NOW,
    },
  });

  const row = reg.rows[0];
  assert.equal(row.totals.presentDays, 1);
  assert.equal(row.totals.absentDays, 1); // only 2026-10-10 counts as absent; 2026-10-11 (off), 10-13 (expected), 10-14 (expected) are ignored
  assert.equal(row.totals.leaveDays, 0);
});

// ---------------------------------------------------------------------------
// Status maps check
// ---------------------------------------------------------------------------
test("The new status 'expected' exists in the status maps across export and UI component", () => {
  // Check report-export.ts status maps
  assert.ok("expected" in STATUS_LABEL, "STATUS_LABEL has expected");
  assert.equal(STATUS_LABEL.expected, "Not yet due");

  assert.ok("expected" in STATUS_CODE, "STATUS_CODE has expected");
  assert.equal(STATUS_CODE.expected, "E");

  assert.ok("expected" in STATUS_FILL, "STATUS_FILL has expected");
  assert.deepEqual(STATUS_FILL.expected, [248, 250, 252]);

  // Read AttendanceRegisterReport.tsx file to verify STATUS_META has expected
  const uiCode = readFileSync("src/components/reports/AttendanceRegisterReport.tsx", "utf8");
  assert.ok(uiCode.includes("expected: {"), "STATUS_META in UI component has expected");
  assert.ok(uiCode.includes('label: "Not yet due"'), "UI label is Not yet due");
  assert.ok(uiCode.includes('code: "E"'), "UI code is E");
  assert.ok(uiCode.includes("bg-slate-50 text-slate-500"), "UI cell style matches specification");
});
