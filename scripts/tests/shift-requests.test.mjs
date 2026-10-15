import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  ASSIGNMENT_READ_CAP,
  DEFAULT_SHIFT_SETTINGS,
  MAX_ACTIVE_SHIFTS,
  MAX_PEOPLE_PER_REQUEST,
  MAX_WRITES_PER_REQUEST,
  canAssignTo,
  canEditShift,
  canManageShifts,
  parseAssignRequest,
  parseClearRequest,
  parseSettingsInput,
  readShiftSettings,
  snapshotFromShiftDoc,
} from "../../src/lib/shift-requests.ts";

const TODAY = "2026-10-13";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------- constants
test("shift-requests exports the expected limits and defaults", () => {
  assert.equal(MAX_PEOPLE_PER_REQUEST, 50);
  assert.equal(MAX_WRITES_PER_REQUEST, 500);
  assert.equal(MAX_ACTIVE_SHIFTS, 100);
  assert.equal(ASSIGNMENT_READ_CAP, 4000);
  assert.deepEqual(DEFAULT_SHIFT_SETTINGS, {
    shiftsEnabled: false,
    shiftScanMode: "strict",
    shiftWindowMinutes: 120,
  });
});

// ---------------------------------------------------------------- readShiftSettings
test("readShiftSettings falls back to defaults when org data is missing or not an object", () => {
  assert.deepEqual(readShiftSettings(undefined), DEFAULT_SHIFT_SETTINGS);
  assert.deepEqual(readShiftSettings(null), DEFAULT_SHIFT_SETTINGS);
  assert.deepEqual(readShiftSettings("bad"), DEFAULT_SHIFT_SETTINGS);
  assert.deepEqual(readShiftSettings([]), DEFAULT_SHIFT_SETTINGS);
  assert.deepEqual(readShiftSettings({}), DEFAULT_SHIFT_SETTINGS);
});

test("readShiftSettings reads valid stored settings and ignores wrong types field by field", () => {
  assert.deepEqual(
    readShiftSettings({
      shiftsEnabled: true,
      shiftScanMode: "lenient",
      shiftWindowMinutes: 60,
    }),
    {
      shiftsEnabled: true,
      shiftScanMode: "lenient",
      shiftWindowMinutes: 60,
    },
  );

  // Wrong shiftsEnabled falls back to false while valid fields are kept
  assert.deepEqual(
    readShiftSettings({
      shiftsEnabled: "yes",
      shiftScanMode: "lenient",
      shiftWindowMinutes: 90,
    }),
    {
      shiftsEnabled: false,
      shiftScanMode: "lenient",
      shiftWindowMinutes: 90,
    },
  );

  // Wrong shiftScanMode falls back to "strict" while valid fields are kept
  assert.deepEqual(
    readShiftSettings({
      shiftsEnabled: true,
      shiftScanMode: "loose",
      shiftWindowMinutes: 45,
    }),
    {
      shiftsEnabled: true,
      shiftScanMode: "strict",
      shiftWindowMinutes: 45,
    },
  );
});

test("readShiftSettings resets shiftWindowMinutes outside 30..240 or non-integer to default 120", () => {
  assert.equal(readShiftSettings({ shiftWindowMinutes: 30 }).shiftWindowMinutes, 30);
  assert.equal(readShiftSettings({ shiftWindowMinutes: 240 }).shiftWindowMinutes, 240);
  assert.equal(readShiftSettings({ shiftWindowMinutes: 29 }).shiftWindowMinutes, 120);
  assert.equal(readShiftSettings({ shiftWindowMinutes: 241 }).shiftWindowMinutes, 120);
  assert.equal(readShiftSettings({ shiftWindowMinutes: 120.5 }).shiftWindowMinutes, 120);
  assert.equal(readShiftSettings({ shiftWindowMinutes: "60" }).shiftWindowMinutes, 120);
});

// ---------------------------------------------------------------- parseSettingsInput
test("parseSettingsInput accepts valid individual or combined fields and ignores unknown fields", () => {
  assert.deepEqual(parseSettingsInput({ shiftsEnabled: true }), {
    ok: true,
    value: { shiftsEnabled: true },
  });
  assert.deepEqual(parseSettingsInput({ shiftScanMode: "lenient" }), {
    ok: true,
    value: { shiftScanMode: "lenient" },
  });
  assert.deepEqual(parseSettingsInput({ shiftWindowMinutes: 30 }), {
    ok: true,
    value: { shiftWindowMinutes: 30 },
  });
  assert.deepEqual(
    parseSettingsInput({
      shiftsEnabled: false,
      shiftScanMode: "strict",
      shiftWindowMinutes: 240,
      extraField: "ignored",
      orgId: "ignored-org",
    }),
    {
      ok: true,
      value: {
        shiftsEnabled: false,
        shiftScanMode: "strict",
        shiftWindowMinutes: 240,
      },
    },
  );
});

test("parseSettingsInput rejects invalid values and empty payloads", () => {
  assert.equal(parseSettingsInput(null).ok, false);
  assert.equal(parseSettingsInput({}).ok, false);
  assert.equal(parseSettingsInput({ unknownOnly: 123 }).ok, false);
  assert.equal(parseSettingsInput({ shiftsEnabled: "true" }).ok, false);
  assert.equal(parseSettingsInput({ shiftsEnabled: 1 }).ok, false);
  assert.equal(parseSettingsInput({ shiftScanMode: "loose" }).ok, false);
  assert.equal(parseSettingsInput({ shiftWindowMinutes: 29 }).ok, false);
  assert.equal(parseSettingsInput({ shiftWindowMinutes: 241 }).ok, false);
  assert.equal(parseSettingsInput({ shiftWindowMinutes: 120.5 }).ok, false);
  assert.equal(parseSettingsInput({ shiftWindowMinutes: "5" }).ok, false);
});

// ---------------------------------------------------------------- canManageShifts
test("canManageShifts allows org_admin and managers with shiftAdmin, and refuses everyone else", () => {
  assert.equal(canManageShifts({ uid: "a1", role: "org_admin", shiftAdmin: false }), true);
  assert.equal(canManageShifts({ uid: "a1", role: "org_admin", shiftAdmin: true }), true);
  assert.equal(canManageShifts({ uid: "m1", role: "manager", shiftAdmin: true }), true);
  assert.equal(canManageShifts({ uid: "m1", role: "manager", shiftAdmin: false }), false);
  assert.equal(canManageShifts({ uid: "e1", role: "employee", shiftAdmin: true }), false);
  assert.equal(canManageShifts({ uid: "e1", role: "employee", shiftAdmin: false }), false);
  assert.equal(canManageShifts({ uid: "u1", role: null, shiftAdmin: true }), false);
  assert.equal(canManageShifts({ uid: "", role: "org_admin", shiftAdmin: true }), false);
});

// ---------------------------------------------------------------- canEditShift
test("canEditShift allows admin any shift, manager with switch only their own, and nobody else", () => {
  const admin = { uid: "a1", role: "org_admin", shiftAdmin: false };
  const mgrOn = { uid: "m1", role: "manager", shiftAdmin: true };
  const mgrOff = { uid: "m1", role: "manager", shiftAdmin: false };
  const emp = { uid: "e1", role: "employee", shiftAdmin: true };

  assert.equal(canEditShift(admin, "m1"), true);
  assert.equal(canEditShift(admin, "a1"), true);
  assert.equal(canEditShift(admin, null), true);

  assert.equal(canEditShift(mgrOn, "m1"), true);
  assert.equal(canEditShift(mgrOn, "m2"), false);
  assert.equal(canEditShift(mgrOn, "a1"), false);
  assert.equal(canEditShift(mgrOn, null), false);

  assert.equal(canEditShift(mgrOff, "m1"), false);
  assert.equal(canEditShift(emp, "e1"), false);
});

// ---------------------------------------------------------------- canAssignTo
test("canAssignTo scopes org_admin to employees/managers and manager with switch to their own team", () => {
  const admin = { uid: "a1", role: "org_admin", shiftAdmin: false };
  const mgrOn = { uid: "m1", role: "manager", shiftAdmin: true };
  const mgrOff = { uid: "m1", role: "manager", shiftAdmin: false };
  const emp = { uid: "e1", role: "employee", shiftAdmin: true };

  const teamEmployee = { uid: "e1", role: "employee", managerId: "m1" };
  const otherEmployee = { uid: "e2", role: "employee", managerId: "m2" };
  const selfManager = { uid: "m1", role: "manager", managerId: "m1" };
  const otherManager = { uid: "m2", role: "manager", managerId: "m2" };
  const targetAdmin = { uid: "a2", role: "org_admin", managerId: null };

  // Org admin: employee yes, manager yes, org_admin no
  assert.equal(canAssignTo(admin, teamEmployee), true);
  assert.equal(canAssignTo(admin, otherEmployee), true);
  assert.equal(canAssignTo(admin, selfManager), true);
  assert.equal(canAssignTo(admin, otherManager), true);
  assert.equal(canAssignTo(admin, targetAdmin), false);

  // Manager with switch: own team yes, themself yes, someone else's team no, org_admin no
  assert.equal(canAssignTo(mgrOn, teamEmployee), true);
  assert.equal(canAssignTo(mgrOn, selfManager), true);
  assert.equal(canAssignTo(mgrOn, otherEmployee), false);
  assert.equal(canAssignTo(mgrOn, otherManager), false);
  assert.equal(canAssignTo(mgrOn, targetAdmin), false);

  // Manager without switch: no
  assert.equal(canAssignTo(mgrOff, teamEmployee), false);
  assert.equal(canAssignTo(mgrOff, selfManager), false);

  // Employee: no
  assert.equal(canAssignTo(emp, teamEmployee), false);
});

// ---------------------------------------------------------------- parseAssignRequest
test("parseAssignRequest validates valid requests, deduplicates people, and allows today", () => {
  const res = parseAssignRequest(
    {
      shiftId: "shift_1",
      employeeIds: ["e1", "e2", "e1"],
      fromDay: TODAY,
      toDay: "2026-10-15",
      weekdays: ALL_DAYS,
    },
    TODAY,
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.shiftId, "shift_1");
    assert.deepEqual(res.value.employeeIds, ["e1", "e2"]);
    assert.deepEqual(res.value.days, ["2026-10-13", "2026-10-14", "2026-10-15"]);
  }
});

test("parseAssignRequest rejects missing shiftId, zero people, and over 50 people", () => {
  assert.equal(
    parseAssignRequest(
      {
        shiftId: "",
        employeeIds: ["e1"],
        fromDay: TODAY,
        toDay: TODAY,
        weekdays: ALL_DAYS,
      },
      TODAY,
    ).ok,
    false,
  );

  assert.equal(
    parseAssignRequest(
      {
        shiftId: "s1",
        employeeIds: [],
        fromDay: TODAY,
        toDay: TODAY,
        weekdays: ALL_DAYS,
      },
      TODAY,
    ).ok,
    false,
  );

  const fiftyOne = Array.from({ length: 51 }, (_, i) => `u${i}`);
  assert.equal(
    parseAssignRequest(
      {
        shiftId: "s1",
        employeeIds: fiftyOne,
        fromDay: TODAY,
        toDay: TODAY,
        weekdays: ALL_DAYS,
      },
      TODAY,
    ).ok,
    false,
  );
});

test("parseAssignRequest rejects a day before today and a range starting before today", () => {
  // Single day before today
  const before = parseAssignRequest(
    {
      shiftId: "s1",
      employeeIds: ["e1"],
      fromDay: "2026-10-12",
      toDay: "2026-10-12",
      weekdays: ALL_DAYS,
    },
    TODAY,
  );
  assert.deepEqual(before, {
    ok: false,
    error: "Shifts can only be assigned from today onwards.",
  });

  // Range starting before today even if toDay is after today
  const rangeBefore = parseAssignRequest(
    {
      shiftId: "s1",
      employeeIds: ["e1"],
      fromDay: "2026-10-10",
      toDay: "2026-10-15",
      weekdays: ALL_DAYS,
    },
    TODAY,
  );
  assert.deepEqual(rangeBefore, {
    ok: false,
    error: "Shifts can only be assigned from today onwards.",
  });
});

test("parseAssignRequest allows exactly 500 writes (10 people x 50 days) and refuses 506 (11 x 46)", () => {
  // 2026-10-13 + 49 days = 2026-12-01 (50 days inclusive)
  const tenPeople = Array.from({ length: 10 }, (_, i) => `e${i}`);
  const ok500 = parseAssignRequest(
    {
      shiftId: "s1",
      employeeIds: tenPeople,
      fromDay: "2026-10-13",
      toDay: "2026-12-01",
      weekdays: ALL_DAYS,
    },
    TODAY,
  );
  assert.equal(ok500.ok, true);
  if (ok500.ok) {
    assert.equal(ok500.value.employeeIds.length * ok500.value.days.length, 500);
  }

  // 2026-10-13 + 45 days = 2026-11-27 (46 days inclusive); 11 * 46 = 506 writes
  const elevenPeople = Array.from({ length: 11 }, (_, i) => `e${i}`);
  const over500 = parseAssignRequest(
    {
      shiftId: "s1",
      employeeIds: elevenPeople,
      fromDay: "2026-10-13",
      toDay: "2026-11-27",
      weekdays: ALL_DAYS,
    },
    TODAY,
  );
  assert.equal(over500.ok, false);
});

test("parseAssignRequest rejects ranges over 62 days, empty weekdays, and invalid dates", () => {
  // 2026-10-13 to 2026-12-14 is 63 days
  const over62 = parseAssignRequest(
    {
      shiftId: "s1",
      employeeIds: ["e1"],
      fromDay: "2026-10-13",
      toDay: "2026-12-14",
      weekdays: ALL_DAYS,
    },
    TODAY,
  );
  assert.equal(over62.ok, false);

  const noWeekdays = parseAssignRequest(
    {
      shiftId: "s1",
      employeeIds: ["e1"],
      fromDay: TODAY,
      toDay: TODAY,
      weekdays: [],
    },
    TODAY,
  );
  assert.equal(noWeekdays.ok, false);

  const badDates = parseAssignRequest(
    {
      shiftId: "s1",
      employeeIds: ["e1"],
      fromDay: "2026-02-30",
      toDay: "2026-10-20",
      weekdays: ALL_DAYS,
    },
    TODAY,
  );
  assert.equal(badDates.ok, false);
});

// ---------------------------------------------------------------- parseClearRequest
test("parseClearRequest validates all 7 weekdays, enforces limits and the today-onwards rule", () => {
  const valid = parseClearRequest(
    {
      employeeIds: ["e1", "e1", "e2"],
      fromDay: TODAY,
      toDay: "2026-10-15",
    },
    TODAY,
  );
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.deepEqual(valid.value.employeeIds, ["e1", "e2"]);
    assert.deepEqual(valid.value.days, ["2026-10-13", "2026-10-14", "2026-10-15"]);
  }

  // Before today refused
  const before = parseClearRequest(
    {
      employeeIds: ["e1"],
      fromDay: "2026-10-12",
      toDay: "2026-10-14",
    },
    TODAY,
  );
  assert.deepEqual(before, {
    ok: false,
    error: "Shifts can only be assigned from today onwards.",
  });

  // Over 500 writes refused (11 people x 46 days = 506)
  const elevenPeople = Array.from({ length: 11 }, (_, i) => `e${i}`);
  assert.equal(
    parseClearRequest(
      {
        employeeIds: elevenPeople,
        fromDay: "2026-10-13",
        toDay: "2026-11-27",
      },
      TODAY,
    ).ok,
    false,
  );

  // Over 50 people refused
  const fiftyOne = Array.from({ length: 51 }, (_, i) => `u${i}`);
  assert.equal(
    parseClearRequest(
      {
        employeeIds: fiftyOne,
        fromDay: TODAY,
        toDay: TODAY,
      },
      TODAY,
    ).ok,
    false,
  );
});

// ---------------------------------------------------------------- snapshotFromShiftDoc
test("snapshotFromShiftDoc turns valid shift and flex documents into snapshots and returns null on damaged docs", () => {
  const goodDay = snapshotFromShiftDoc("sh_1", {
    orgId: "org1",
    name: "Morning Shift",
    type: "early",
    start: "06:00",
    end: "14:00",
    graceMinutes: 10,
    expectedMinutes: null,
  });
  assert.deepEqual(goodDay, {
    shiftId: "sh_1",
    name: "Morning Shift",
    type: "early",
    start: "06:00",
    end: "14:00",
    graceMinutes: 10,
    expectedMinutes: null,
  });

  const goodFlex = snapshotFromShiftDoc("sh_flex", {
    orgId: "org1",
    name: "Flex 8h",
    type: "flex",
    start: null,
    end: null,
    graceMinutes: 0,
    expectedMinutes: 480,
  });
  assert.deepEqual(goodFlex, {
    shiftId: "sh_flex",
    name: "Flex 8h",
    type: "flex",
    start: null,
    end: null,
    graceMinutes: 0,
    expectedMinutes: 480,
  });

  // Damaged docs -> null
  assert.equal(snapshotFromShiftDoc("sh_1", { type: "day", start: "09:00", end: "17:00" }), null); // missing name
  assert.equal(
    snapshotFromShiftDoc("sh_1", { name: "Bad Time", type: "day", start: "25:00", end: "17:00" }),
    null,
  );
  assert.equal(
    snapshotFromShiftDoc("sh_1", {
      name: "Unknown Type",
      type: "weekend",
      start: "09:00",
      end: "17:00",
    }),
    null,
  );
  assert.equal(snapshotFromShiftDoc("", { name: "Morning", type: "day", start: "09:00", end: "17:00" }), null);
});

// ---------------------------------------------------------------- guards on the real code
test("firestore.rules contains both new shift blocks and each forbids client writes", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const shiftsBlock = rules.match(/match\s+\/shifts\/\{shiftId\}\s*\{([\s\S]*?)\}/);
  const assignBlock = rules.match(
    /match\s+\/shift_assignments\/\{assignmentId\}\s*\{([\s\S]*?)\}/,
  );
  assert.ok(shiftsBlock, "shifts rule block must exist in firestore.rules");
  assert.ok(assignBlock, "shift_assignments rule block must exist in firestore.rules");
  assert.match(shiftsBlock[1], /allow\s+create,\s*update,\s*delete:\s*if\s+false;/);
  assert.match(assignBlock[1], /allow\s+create,\s*update,\s*delete:\s*if\s+false;/);
});

test("firestore.indexes.json contains the three shift_assignments composite indexes", () => {
  const indexes = JSON.parse(readFileSync("firestore.indexes.json", "utf8")).indexes;
  const shiftIndexes = indexes
    .filter((i) => i.collectionGroup === "shift_assignments" && i.queryScope === "COLLECTION")
    .map((i) => i.fields.map((f) => `${f.fieldPath}:${f.order}`).join(","));

  assert.ok(shiftIndexes.includes("orgId:ASCENDING,dayKey:ASCENDING"));
  assert.ok(shiftIndexes.includes("orgId:ASCENDING,managerId:ASCENDING,dayKey:ASCENDING"));
  assert.ok(shiftIndexes.includes("orgId:ASCENDING,employeeId:ASCENDING,dayKey:ASCENDING"));
});

test("every route under src/routes/api/shifts verifies the token, rate-limits writes, logs events, and never reads identity from body", () => {
  const dir = "src/routes/api/shifts";
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  assert.deepEqual(
    files.sort(),
    ["access.ts", "assignments.ts", "index.ts", "refused-scans.ts", "settings.ts"],
  );

  const forbidden = [
    "body?.orgId",
    "body?.role",
    "body?.managerId",
    "body.orgId",
    "body.role",
    "body.managerId",
  ];

  for (const file of files) {
    const src = readFileSync(`${dir}/${file}`, "utf8");
    assert.ok(src.includes("verifyCallerToken"), `${file} must call verifyCallerToken`);
    // Rate limiting and a log line are for routes that CHANGE something. A route that only reads (the
    // refused-scans list) has no write handler, so it has nothing to limit or log.
    const hasWriteHandler = /\b(POST|PUT|DELETE|PATCH):\s*async/.test(src);
    if (hasWriteHandler) {
      assert.ok(src.includes("checkRateLimit"), `${file} must call checkRateLimit on writes`);
      assert.ok(src.includes("logEvent"), `${file} must call logEvent on writes`);
    }
    for (const bad of forbidden) {
      assert.equal(src.includes(bad), false, `${file} must never contain ${bad}`);
    }
  }
});

test("shift-access.server.ts merges shiftAdmin without calling setStaffRoleClaims", () => {
  const src = readFileSync("src/lib/shift-access.server.ts", "utf8");
  assert.equal(src.includes("setStaffRoleClaims"), false);
  assert.ok(src.includes("setShiftAdminClaim"));
});
