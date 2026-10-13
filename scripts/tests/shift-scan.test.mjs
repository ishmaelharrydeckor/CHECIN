import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assignmentFromDoc,
  candidateShiftDays,
  planShiftScan,
  planShiftStatus,
  refusedScanId,
} from "../../src/lib/shift-scan.ts";
import { applyEventToSummary, summaryDocId } from "../../src/lib/daily-summary.ts";
import { DEFAULT_SHIFT_SETTINGS } from "../../src/lib/shift-requests.ts";

const ACCRA = "Africa/Accra";
const LONDON = "Europe/London";

const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";
const SUNDAY = "2026-10-11";

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

const enabledSettings = {
  ...DEFAULT_SHIFT_SETTINGS,
  shiftsEnabled: true,
  shiftScanMode: "strict",
  shiftWindowMinutes: 120,
};

function makeSummary(dayKey, lastEventType, extra = {}) {
  return {
    orgId: "org_1",
    managerId: "mgr_1",
    employeeId: "emp_1",
    employeeName: "Ama Mensah",
    department: "Ops",
    dayKey,
    firstIn: `${dayKey}T08:55:00.000Z`,
    lastOut: lastEventType === "out" ? `${dayKey}T17:02:00.000Z` : null,
    lastEventType,
    lastEventAt:
      lastEventType === "out" ? `${dayKey}T17:02:00.000Z` : `${dayKey}T08:55:00.000Z`,
    state: lastEventType,
    openSince: lastEventType === "in" ? `${dayKey}T08:55:00.000Z` : null,
    minutesWorked: lastEventType === "out" ? 487 : 0,
    eventCount: lastEventType === "out" ? 2 : 1,
    late: false,
    earlyDeparture: false,
    schemaVersion: 1,
    updatedAt: `${dayKey}T17:02:00.000Z`,
    ...extra,
  };
}

// ---------------------------------------------------------------- candidateShiftDays
test("candidateShiftDays returns [yesterday, today, tomorrow] in order, across month ends and DST transitions", () => {
  // Normal day in Africa/Accra (Monday 2026-10-12)
  assert.deepEqual(
    candidateShiftDays(Date.parse("2026-10-12T12:00:00Z"), ACCRA),
    ["2026-10-11", "2026-10-12", "2026-10-13"],
  );

  // Month end (2026-10-31 and 2026-11-01)
  assert.deepEqual(
    candidateShiftDays(Date.parse("2026-10-31T23:30:00Z"), ACCRA),
    ["2026-10-30", "2026-10-31", "2026-11-01"],
  );
  assert.deepEqual(
    candidateShiftDays(Date.parse("2026-11-01T00:05:00Z"), ACCRA),
    ["2026-10-31", "2026-11-01", "2026-11-02"],
  );

  // Europe/London spring-forward day (clocks jump to BST on 2026-03-29):
  // At 2026-03-29T23:30:00Z it is already 2026-03-30 00:30 BST in London
  assert.deepEqual(
    candidateShiftDays(Date.parse("2026-03-29T12:00:00Z"), LONDON),
    ["2026-03-28", "2026-03-29", "2026-03-30"],
  );
  assert.deepEqual(
    candidateShiftDays(Date.parse("2026-03-29T23:30:00Z"), LONDON),
    ["2026-03-29", "2026-03-30", "2026-03-31"],
  );

  // Europe/London fall-back day (clocks go back to GMT on 2026-10-25)
  assert.deepEqual(
    candidateShiftDays(Date.parse("2026-10-25T01:30:00Z"), LONDON),
    ["2026-10-24", "2026-10-25", "2026-10-26"],
  );

  // Invalid timestamp returns empty array
  assert.deepEqual(candidateShiftDays(NaN, ACCRA), []);
});

// ---------------------------------------------------------------- Legacy conditions
test("planShiftScan returns legacy when disabled, shiftsEnabled is false, no assignments, or only future/unrelated assignments exist", () => {
  const mondayMorning = Date.parse("2026-10-12T08:55:00Z");
  const mondayAssign = [{ dayKey: MONDAY, shift: dayShift }];

  // 1. SHIFTS_DISABLED switch is on
  assert.deepEqual(
    planShiftScan({
      settings: enabledSettings,
      disabled: true,
      nowMs: mondayMorning,
      timezone: ACCRA,
      assignments: mondayAssign,
      summaries: {},
    }),
    { kind: "legacy" },
  );

  // 2. Organization has shiftsEnabled: false
  assert.deepEqual(
    planShiftScan({
      settings: { ...enabledSettings, shiftsEnabled: false },
      disabled: false,
      nowMs: mondayMorning,
      timezone: ACCRA,
      assignments: mondayAssign,
      summaries: {},
    }),
    { kind: "legacy" },
  );

  // 3. No assignments (or only damaged/invalid assignments)
  assert.deepEqual(
    planShiftScan({
      settings: enabledSettings,
      disabled: false,
      nowMs: mondayMorning,
      timezone: ACCRA,
      assignments: [],
      summaries: {},
    }),
    { kind: "legacy" },
  );
  assert.deepEqual(
    planShiftScan({
      settings: enabledSettings,
      disabled: false,
      nowMs: mondayMorning,
      timezone: ACCRA,
      assignments: [{ dayKey: "bad-day", shift: null }],
      summaries: {},
    }),
    { kind: "legacy" },
  );

  // 4. Only assignments whose window does not contain the scan and none for today or yesterday
  // Scanning Monday 15:00 when the employee is only assigned to Tuesday's day shift (09:00-17:00)
  assert.deepEqual(
    planShiftScan({
      settings: enabledSettings,
      disabled: false,
      nowMs: Date.parse("2026-10-12T15:00:00Z"),
      timezone: ACCRA,
      assignments: [{ dayKey: TUESDAY, shift: dayShift }],
      summaries: {},
    }),
    { kind: "legacy" },
  );
});

// ---------------------------------------------------------------- Day shift
test("planShiftScan handles day shift: on-time check-in, late check-in, on-time check-out, and early check-out", () => {
  const assignments = [{ dayKey: MONDAY, shift: dayShift }];

  // First scan at 08:55 -> in, not late, shiftDay Monday, prev null
  const inOnTime = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T08:55:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(inOnTime.kind, "shift");
  assert.equal(inOnTime.shiftDay, MONDAY);
  assert.equal(inOnTime.direction, "in");
  assert.equal(inOnTime.late, false);
  assert.equal(inOnTime.earlyDeparture, false);
  assert.equal(inOnTime.prev, null);
  assert.deepEqual(inOnTime.shift, dayShift);

  // Same person at 09:05 with no summary -> late
  const inLate = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T09:05:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(inLate.kind, "shift");
  assert.equal(inLate.shiftDay, MONDAY);
  assert.equal(inLate.direction, "in");
  assert.equal(inLate.late, true);
  assert.equal(inLate.earlyDeparture, false);
  assert.equal(inLate.prev, null);

  // Second scan at 17:02 with summary lastEventType "in" -> out, not early
  const mondayInSummary = makeSummary(MONDAY, "in");
  const outOnTime = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T17:02:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: { [MONDAY]: mondayInSummary },
  });
  assert.equal(outOnTime.kind, "shift");
  assert.equal(outOnTime.shiftDay, MONDAY);
  assert.equal(outOnTime.direction, "out");
  assert.equal(outOnTime.late, false);
  assert.equal(outOnTime.earlyDeparture, false);
  assert.equal(outOnTime.prev, mondayInSummary);

  // Second scan at 16:30 with summary lastEventType "in" -> out, early
  const outEarly = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T16:30:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: { [MONDAY]: mondayInSummary },
  });
  assert.equal(outEarly.kind, "shift");
  assert.equal(outEarly.shiftDay, MONDAY);
  assert.equal(outEarly.direction, "out");
  assert.equal(outEarly.late, false);
  assert.equal(outEarly.earlyDeparture, true);
  assert.equal(outEarly.prev, mondayInSummary);
});

// ---------------------------------------------------------------- Night shift
test("planShiftScan keeps a night shift's Tuesday morning check-out on Monday's shiftDay and summary", () => {
  const assignments = [{ dayKey: MONDAY, shift: nightShift }];

  // Monday 21:55 -> in, shiftDay Monday
  const nightIn = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T21:55:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(nightIn.kind, "shift");
  assert.equal(nightIn.shiftDay, MONDAY);
  assert.equal(nightIn.direction, "in");
  assert.equal(nightIn.late, false);
  assert.equal(nightIn.earlyDeparture, false);
  assert.equal(nightIn.prev, null);

  // Tuesday 06:05 with Monday's summary "in" and no Tuesday summary -> out, shiftDay Monday, prev is Monday's summary
  const mondayNightSummary = makeSummary(MONDAY, "in", {
    firstIn: "2026-10-12T21:55:00.000Z",
    lastEventAt: "2026-10-12T21:55:00.000Z",
  });
  const nightOut = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-13T06:05:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: { [SUNDAY]: null, [MONDAY]: mondayNightSummary, [TUESDAY]: null },
  });
  assert.equal(nightOut.kind, "shift");
  assert.equal(nightOut.shiftDay, MONDAY);
  assert.equal(nightOut.direction, "out");
  assert.equal(nightOut.late, false);
  assert.equal(nightOut.earlyDeparture, false);
  assert.equal(nightOut.prev, mondayNightSummary);
});

// ---------------------------------------------------------------- Overlap
test("planShiftScan resolves overlap between Monday night shift and Tuesday day shift at Tuesday 07:30", () => {
  const assignments = [
    { dayKey: MONDAY, shift: nightShift },
    { dayKey: TUESDAY, shift: dayShift },
  ];
  const tuesday0730 = Date.parse("2026-10-13T07:30:00Z");

  // With Monday summary "in" -> Monday check-out
  const mondayIn = makeSummary(MONDAY, "in");
  const closeMonday = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: tuesday0730,
    timezone: ACCRA,
    assignments,
    summaries: { [MONDAY]: mondayIn, [TUESDAY]: null },
  });
  assert.equal(closeMonday.kind, "shift");
  assert.equal(closeMonday.shiftDay, MONDAY);
  assert.equal(closeMonday.direction, "out");
  assert.equal(closeMonday.prev, mondayIn);

  // With Monday summary "out" -> Tuesday check-in
  const mondayOut = makeSummary(MONDAY, "out");
  const openTuesday = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: tuesday0730,
    timezone: ACCRA,
    assignments,
    summaries: { [MONDAY]: mondayOut, [TUESDAY]: null },
  });
  assert.equal(openTuesday.kind, "shift");
  assert.equal(openTuesday.shiftDay, TUESDAY);
  assert.equal(openTuesday.direction, "in");
  assert.equal(openTuesday.prev, null);
});

// ---------------------------------------------------------------- Refusal
test("planShiftScan refuses scans too early or too late with the exact employee message", () => {
  const assignments = [{ dayKey: MONDAY, shift: nightShift }];

  // Monday 15:00 with only Monday night shift -> refuse, too_early
  const early = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T15:00:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(early.kind, "refuse");
  assert.equal(early.reason, "too_early");
  assert.equal(early.shiftDay, MONDAY);
  assert.equal(early.message, "Your shift starts at 22:00. Scanning opens at 20:00.");

  // Tuesday 10:00 with only Monday night shift -> refuse, too_late
  const late = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-13T10:00:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(late.kind, "refuse");
  assert.equal(late.reason, "too_late");
  assert.equal(late.shiftDay, MONDAY);
  assert.equal(
    late.message,
    "Your shift ended at 06:00 and scanning closed at 08:00. Please speak to your manager.",
  );
});

// ---------------------------------------------------------------- Lenient mode & window length
test("planShiftScan refuses even when shiftScanMode is lenient (phase 3 decision 2) and honours shiftWindowMinutes (30 and 240)", () => {
  const assignments = [{ dayKey: MONDAY, shift: dayShift }];

  // Lenient setting still refuses in phase 3
  const lenientRefused = planShiftScan({
    settings: { ...enabledSettings, shiftScanMode: "lenient" },
    disabled: false,
    nowMs: Date.parse("2026-10-12T06:00:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(lenientRefused.kind, "refuse");
  assert.equal(lenientRefused.reason, "too_early");
  assert.equal(lenientRefused.message, "Your shift starts at 09:00. Scanning opens at 07:00.");

  // Window length 30 minutes: 08:00 is refused (opens at 08:30), 08:35 is matched
  const win30Settings = { ...enabledSettings, shiftWindowMinutes: 30 };
  const earlyFor30 = planShiftScan({
    settings: win30Settings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T08:00:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(earlyFor30.kind, "refuse");
  assert.equal(earlyFor30.reason, "too_early");
  assert.equal(earlyFor30.message, "Your shift starts at 09:00. Scanning opens at 08:30.");

  const inside30 = planShiftScan({
    settings: win30Settings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T08:35:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(inside30.kind, "shift");
  assert.equal(inside30.direction, "in");

  // Window length 240 minutes: 05:30 is matched (opens at 05:00), 04:30 is refused
  const win240Settings = { ...enabledSettings, shiftWindowMinutes: 240 };
  const inside240 = planShiftScan({
    settings: win240Settings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T05:30:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(inside240.kind, "shift");
  assert.equal(inside240.direction, "in");

  const earlyFor240 = planShiftScan({
    settings: win240Settings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T04:30:00Z"),
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(earlyFor240.kind, "refuse");
  assert.equal(earlyFor240.reason, "too_early");
  assert.equal(earlyFor240.message, "Your shift starts at 09:00. Scanning opens at 05:00.");
});

// ---------------------------------------------------------------- Unassigned summary ignored
test("a summary for a day with no assignment does not affect which shift is chosen", () => {
  // Only Tuesday has a day shift assignment; Monday has an open "in" summary from an unassigned scan yesterday
  const orphanMondaySummary = makeSummary(MONDAY, "in");
  const plan = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-13T08:55:00Z"),
    timezone: ACCRA,
    assignments: [{ dayKey: TUESDAY, shift: dayShift }],
    summaries: { [MONDAY]: orphanMondaySummary, [TUESDAY]: null },
  });
  assert.equal(plan.kind, "shift");
  assert.equal(plan.shiftDay, TUESDAY);
  assert.equal(plan.direction, "in");
  assert.equal(plan.prev, null);
});

// ---------------------------------------------------------------- planShiftStatus
test("planShiftStatus picks Monday's summary for a night worker at 06:30, today's for a day worker mid-shift, and legacy outside the window", () => {
  const mondayNightSummary = makeSummary(MONDAY, "in", {
    firstIn: "2026-10-12T21:58:00.000Z",
    lastEventAt: "2026-10-12T21:58:00.000Z",
  });

  // Night worker at Tuesday 06:30 -> Monday's summary
  const nightStatus = planShiftStatus({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-13T06:30:00Z"),
    timezone: ACCRA,
    assignments: [{ dayKey: MONDAY, shift: nightShift }],
    summaries: { [SUNDAY]: null, [MONDAY]: mondayNightSummary, [TUESDAY]: null },
  });
  assert.deepEqual(nightStatus, {
    kind: "shift",
    shiftDay: MONDAY,
    summary: mondayNightSummary,
  });

  // Day worker mid-shift (Monday 12:30) -> today's summary
  const mondayDaySummary = makeSummary(MONDAY, "in");
  const dayStatus = planShiftStatus({
    settings: enabledSettings,
    disabled: false,
    nowMs: Date.parse("2026-10-12T12:30:00Z"),
    timezone: ACCRA,
    assignments: [{ dayKey: MONDAY, shift: dayShift }],
    summaries: { [SUNDAY]: null, [MONDAY]: mondayDaySummary, [TUESDAY]: null },
  });
  assert.deepEqual(dayStatus, {
    kind: "shift",
    shiftDay: MONDAY,
    summary: mondayDaySummary,
  });

  // Outside the window (Monday 15:00 before night shift, or Tuesday 10:00 after night shift) -> legacy
  assert.deepEqual(
    planShiftStatus({
      settings: enabledSettings,
      disabled: false,
      nowMs: Date.parse("2026-10-12T15:00:00Z"),
      timezone: ACCRA,
      assignments: [{ dayKey: MONDAY, shift: nightShift }],
      summaries: { [MONDAY]: null },
    }),
    { kind: "legacy" },
  );
  assert.deepEqual(
    planShiftStatus({
      settings: enabledSettings,
      disabled: false,
      nowMs: Date.parse("2026-10-13T10:00:00Z"),
      timezone: ACCRA,
      assignments: [{ dayKey: MONDAY, shift: nightShift }],
      summaries: { [MONDAY]: mondayNightSummary },
    }),
    { kind: "legacy" },
  );
});

// ---------------------------------------------------------------- refusedScanId
test("refusedScanId is stable inside one 10-minute period and differs across periods, reasons, days and people", () => {
  const bucketStart = Math.floor(Date.parse("2026-10-12T15:00:00Z") / 600_000) * 600_000;
  const idStart = refusedScanId("emp_1", MONDAY, "too_early", bucketStart);
  const idNineMin = refusedScanId("emp_1", MONDAY, "too_early", bucketStart + 9 * 60_000 + 59_999);
  assert.equal(idStart, idNineMin);
  assert.equal(idStart, `emp_1_2026-10-12_too_early_${Math.floor(bucketStart / 600_000)}`);

  // Next 10-minute bucket
  const idNextBucket = refusedScanId("emp_1", MONDAY, "too_early", bucketStart + 600_000);
  assert.notEqual(idStart, idNextBucket);

  // Different reason, day, and employee
  assert.notEqual(idStart, refusedScanId("emp_1", MONDAY, "too_late", bucketStart));
  assert.notEqual(idStart, refusedScanId("emp_1", TUESDAY, "too_early", bucketStart));
  assert.notEqual(idStart, refusedScanId("emp_2", MONDAY, "too_early", bucketStart));
});

// ---------------------------------------------------------------- assignmentFromDoc
test("assignmentFromDoc keeps only valid assignments for the caller's organization and ignores damaged documents", () => {
  const validDoc = {
    orgId: "org_1",
    dayKey: MONDAY,
    shift: dayShift,
  };
  assert.deepEqual(assignmentFromDoc(validDoc, "org_1", MONDAY), {
    dayKey: MONDAY,
    shift: dayShift,
  });

  // Flex shift snapshot is also accepted
  assert.deepEqual(
    assignmentFromDoc({ orgId: "org_1", dayKey: MONDAY, shift: flexShift }, "org_1", MONDAY),
    { dayKey: MONDAY, shift: flexShift },
  );

  // Wrong org is rejected
  assert.equal(assignmentFromDoc(validDoc, "org_other", MONDAY), null);

  // Damaged documents are ignored
  assert.equal(assignmentFromDoc(null, "org_1", MONDAY), null);
  assert.equal(assignmentFromDoc({ orgId: "org_1", dayKey: MONDAY, shift: null }, "org_1", MONDAY), null);
  assert.equal(
    assignmentFromDoc(
      { orgId: "org_1", dayKey: MONDAY, shift: { ...dayShift, start: "bad" } },
      "org_1",
      MONDAY,
    ),
    null,
  );
});

// ---------------------------------------------------------------- Undo compatibility for shift scans
test("undo.ts remains untouched and finds the shift day's summary via summaryDocId(employeeId, event.dayKey)", () => {
  const employeeId = "emp_night_1";
  const assignments = [{ dayKey: MONDAY, shift: nightShift }];

  // 1. Monday 21:55 check-in on Monday night shift
  const inTime = Date.parse("2026-10-12T21:55:00Z");
  const inIso = new Date(inTime).toISOString();
  const inPlan = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: inTime,
    timezone: ACCRA,
    assignments,
    summaries: {},
  });
  assert.equal(inPlan.kind, "shift");

  const identity = {
    orgId: "org_1",
    managerId: "mgr_1",
    employeeId,
    employeeName: "Kwame",
    department: "Security",
    dayKey: inPlan.shiftDay,
    shiftId: inPlan.shift.shiftId,
    shiftName: inPlan.shift.name,
    shiftStart: inPlan.shift.start,
    shiftEnd: inPlan.shift.end,
  };
  const summaryAfterIn = applyEventToSummary(
    inPlan.prev,
    { type: inPlan.direction, timestamp: inIso, late: inPlan.late, earlyDeparture: inPlan.earlyDeparture },
    identity,
    inIso,
  );

  // 2. Tuesday 06:05 check-out on the same Monday night shift (calendar day is Tuesday, shiftDay is Monday)
  const outTime = Date.parse("2026-10-13T06:05:00Z");
  const outIso = new Date(outTime).toISOString();
  const outPlan = planShiftScan({
    settings: enabledSettings,
    disabled: false,
    nowMs: outTime,
    timezone: ACCRA,
    assignments,
    summaries: { [MONDAY]: summaryAfterIn, [TUESDAY]: null },
  });
  assert.equal(outPlan.kind, "shift");
  assert.equal(outPlan.shiftDay, MONDAY);
  assert.equal(outPlan.direction, "out");

  // Stored event shape written by scan.ts uses activeDay = outPlan.shiftDay ("2026-10-12")
  const storedOutEvent = {
    eventId: `${employeeId}_scan_out_1`,
    orgId: "org_1",
    managerId: "mgr_1",
    employeeId,
    type: outPlan.direction,
    late: outPlan.late,
    earlyDeparture: outPlan.earlyDeparture,
    timestamp: outIso,
    dayKey: outPlan.shiftDay,
    shiftId: outPlan.shift.shiftId,
    summaryBefore: outPlan.prev,
  };
  const summaryAfterOut = applyEventToSummary(
    outPlan.prev,
    { type: outPlan.direction, timestamp: outIso, late: outPlan.late, earlyDeparture: outPlan.earlyDeparture },
    identity,
    outIso,
  );

  // Scan route writes the summary to summaryDocId(employeeId, outPlan.shiftDay)
  const writtenSummaryId = summaryDocId(employeeId, outPlan.shiftDay);
  // Undo route looks up summaryDocId(caller.uid, e.dayKey)
  const undoLookupId = summaryDocId(employeeId, storedOutEvent.dayKey);
  assert.equal(undoLookupId, writtenSummaryId);
  assert.equal(undoLookupId, `${employeeId}_2026-10-12`);
  assert.equal(summaryAfterOut.lastEventAt, storedOutEvent.timestamp);
  // Restoring summaryBefore puts Monday's summary back to "in" with its shift fields intact
  assert.deepEqual(storedOutEvent.summaryBefore, summaryAfterIn);
  assert.equal(storedOutEvent.summaryBefore.state, "in");
  assert.equal(storedOutEvent.summaryBefore.shiftId, "shift_night");

  // Verify undo.ts actually uses summaryDocId(caller.uid, e.dayKey)
  const undoSrc = readFileSync("src/routes/api/check-in/undo.ts", "utf8");
  assert.ok(
    undoSrc.includes("summaryDocId(caller.uid, e.dayKey)"),
    "undo.ts must look up the summary by the event's dayKey",
  );
});

// ---------------------------------------------------------------- Guards on the real code
test("real route, rule and index files satisfy all phase 3 security and fallback guards", () => {
  const scanSrc = readFileSync("src/routes/api/check-in/scan.ts", "utf8");
  const statusSrc = readFileSync("src/routes/api/check-in/status.ts", "utf8");
  const rulesSrc = readFileSync("firestore.rules", "utf8").split("\r\n").join("\n");
  const indexesJson = JSON.parse(readFileSync("firestore.indexes.json", "utf8"));

  // Legacy path survives in scan.ts
  assert.ok(scanSrc.includes("computeScanFlags"), "scan.ts must keep computeScanFlags for legacy scans");
  assert.ok(scanSrc.includes("nextTypeFromSummary"), "scan.ts must keep nextTypeFromSummary for legacy scans");

  // Emergency switch, planner calls, and try/catch around assignment read in both scan.ts and status.ts
  assert.ok(scanSrc.includes("SHIFTS_DISABLED"), "scan.ts must check SHIFTS_DISABLED");
  assert.ok(statusSrc.includes("SHIFTS_DISABLED"), "status.ts must check SHIFTS_DISABLED");
  assert.ok(scanSrc.includes("planShiftScan"), "scan.ts must call planShiftScan");
  assert.ok(statusSrc.includes("planShiftStatus"), "status.ts must call planShiftStatus");
  assert.match(
    scanSrc,
    /try\s*\{[\s\S]*?shift_assignments[\s\S]*?\}\s*catch/,
    "scan.ts must wrap the shift_assignments read in try/catch",
  );
  assert.match(
    statusSrc,
    /try\s*\{[\s\S]*?shift_assignments[\s\S]*?\}\s*catch/,
    "status.ts must wrap the shift_assignments read in try/catch",
  );

  // Never read shift or org data from the client request body in scan.ts
  assert.doesNotMatch(scanSrc, /body\?\.\s*(?:shift|shiftId|shiftDay|orgId|role|managerId|employeeId)/);
  assert.doesNotMatch(scanSrc, /body\.\s*(?:shift|shiftId|shiftDay|orgId|role|managerId|employeeId)/);

  // firestore.rules has refused_scans block with allow create, update, delete: if false
  const refusedRuleMatch = rulesSrc.match(
    /match \/refused_scans\/\{noteId\}\s*\{([\s\S]*?)\n    \}/,
  );
  assert.ok(refusedRuleMatch, "firestore.rules must have match /refused_scans/{noteId}");
  assert.match(refusedRuleMatch[1], /allow read: if inOrg\(resource\.data\)/);
  assert.match(refusedRuleMatch[1], /allow create, update, delete: if false;/);

  // Both refused_scans composite indexes exist in firestore.indexes.json
  const refusedIndexes = (indexesJson.indexes ?? []).filter(
    (idx) => idx.collectionGroup === "refused_scans",
  );
  assert.equal(refusedIndexes.length, 2, "must have 2 composite indexes on refused_scans");
  const signatures = refusedIndexes
    .map((idx) => idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join(","))
    .sort();
  assert.deepEqual(signatures, [
    "orgId:ASCENDING,at:DESCENDING",
    "orgId:ASCENDING,managerId:ASCENDING,at:DESCENDING",
  ]);
});
