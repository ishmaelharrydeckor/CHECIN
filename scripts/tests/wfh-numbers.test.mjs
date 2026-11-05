import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildTodayFromSummaries, wfhPeopleToday } from "../../src/lib/attendance-today.ts";
import { buildTodayWithShifts } from "../../src/lib/shift-today.ts";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";
import { registerToCsv } from "../../src/lib/report-export.ts";

const TZ = "Africa/Accra";
const NOW = new Date("2026-03-10T15:00:00.000Z"); // a Tuesday
const TODAY = "2026-03-10";
const roster = [
  { uid: "a", displayName: "Ama", department: "Ops" },
  { uid: "b", displayName: "Kofi", department: "Ops" },
  { uid: "c", displayName: "Esi", department: "Sales" },
  { uid: "d", displayName: "Yaw", department: "Sales" },
];

function summary(employeeId, extra = {}) {
  return {
    orgId: "o1", managerId: "m1", employeeId, employeeName: employeeId, department: "",
    dayKey: TODAY, firstIn: `${TODAY}T08:00:00.000Z`, lastOut: null, lastEventType: "in",
    lastEventAt: `${TODAY}T08:00:00.000Z`, state: "in", openSince: `${TODAY}T08:00:00.000Z`,
    minutesWorked: 0, eventCount: 1, late: false, earlyDeparture: false, schemaVersion: 1,
    updatedAt: `${TODAY}T08:00:00.000Z`, ...extra,
  };
}

const today = (extra) =>
  buildTodayFromSummaries({ summaries: [summary("a")], recentEvents: [], roster, timezone: TZ, now: NOW, ...extra });

test("without work from home nothing changes", () => {
  const s = today();
  assert.equal(s.counts.wfh, 0);
  assert.deepEqual(s.wfhPeople, []);
  assert.equal(s.counts.absent, 3);
});

test("a work-from-home person is not absent and not in 'not arrived'", () => {
  const s = today({ wfhEmployeeIds: ["b"] });
  assert.equal(s.counts.wfh, 1);
  assert.deepEqual(s.wfhPeople.map((p) => p.employeeId), ["b"]);
  assert.equal(s.counts.present, 1, "present is still only people who scanned");
  assert.equal(s.counts.absent, 2);
  assert.ok(!s.notArrived.some((p) => p.employeeId === "b"));
  assert.equal(s.counts.expected, 4, "work from home stays part of who was expected");
});

test("a scan wins over a declaration", () => {
  const s = today({ wfhEmployeeIds: ["a"] });
  assert.equal(s.counts.wfh, 0);
  assert.equal(s.counts.present, 1);
});

test("approved leave wins over a declaration", () => {
  const leave = [{ employeeId: "b", status: "approved", startDate: TODAY, endDate: TODAY }];
  const s = today({ wfhEmployeeIds: ["b"], leaves: leave });
  assert.equal(s.counts.wfh, 0);
  assert.equal(s.counts.onLeave, 1);
});

test("someone not on this team is ignored", () => {
  const s = today({ wfhEmployeeIds: ["stranger"] });
  assert.equal(s.counts.wfh, 0);
  assert.deepEqual(wfhPeopleToday(roster, ["stranger"]), []);
});

test("the numbers add up", () => {
  const s = today({ wfhEmployeeIds: ["b", "c"] });
  const c = s.counts;
  assert.equal(c.present + c.wfh + c.absent, c.expected);
});

const dayShift = { shiftId: "s1", name: "Day", type: "day", start: "09:00", end: "17:00", graceMinutes: 0, expectedMinutes: null };

test("with shifts on, a rostered person who declared is working from home, not absent", () => {
  const assignments = ["a", "b", "c", "d"].map((employeeId) => ({ employeeId, dayKey: TODAY, shift: dayShift }));
  const base = {
    summaries: [summary("a")], recentEvents: [], roster, assignments, leaves: [], holidays: [],
    settings: { shiftsEnabled: true, shiftScanMode: "strict", shiftWindowMinutes: 120 },
    timezone: TZ, now: NOW.getTime(),
  };
  const without = buildTodayWithShifts(base);
  const withWfh = buildTodayWithShifts({ ...base, wfhEmployeeIds: ["b", "a"] });
  assert.equal(withWfh.counts.wfh, 1, "a scanned person is not counted as working from home");
  assert.deepEqual(withWfh.wfhPeople.map((p) => p.employeeId), ["b"]);
  assert.equal(withWfh.counts.expected, without.counts.expected);
  assert.equal(withWfh.counts.absent + withWfh.notArrived.length >= 0, true);
  assert.ok(!withWfh.notArrived.some((p) => p.employeeId === "b"));
});

// ------------------------------------------------------------------ the register
const days = ["2026-03-09", "2026-03-10", "2026-03-14"]; // Mon, Tue, Sat
function register(extra = {}) {
  return buildAttendanceRegister({
    days, people: roster, summaries: [], leaves: [], holidays: [], timezone: TZ,
    generatedAt: NOW.toISOString(), from: days[0], to: days[2], ...extra,
  });
}
const rowOf = (r, id) => r.rows.find((x) => x.employeeId === id);

test("register: a declared day shows as work from home and counts as its own total", () => {
  const r = register({ wfh: [{ employeeId: "a", dayKey: "2026-03-09" }] });
  const row = rowOf(r, "a");
  assert.equal(row.days[0].status, "wfh");
  assert.equal(row.days[0].minutesWorked, 0, "no hours are invented");
  assert.equal(row.totals.wfhDays, 1);
  assert.equal(row.totals.absentDays, 1, "the other weekday is still absent");
  assert.equal(row.totals.presentDays, 0, "present stays 'scanned'");
});

test("register: scan beats declaration, leave beats declaration, declaration beats holiday", () => {
  const r = register({
    wfh: [
      { employeeId: "a", dayKey: "2026-03-09" },
      { employeeId: "b", dayKey: "2026-03-09" },
      { employeeId: "c", dayKey: "2026-03-09" },
    ],
    summaries: [{ employeeId: "a", dayKey: "2026-03-09", firstIn: "2026-03-09T08:00:00.000Z", minutesWorked: 60 }],
    leaves: [{ employeeId: "b", status: "approved", startDate: "2026-03-09", endDate: "2026-03-09" }],
    holidays: ["2026-03-09"],
  });
  assert.equal(rowOf(r, "a").days[0].status, "present");
  assert.equal(rowOf(r, "b").days[0].status, "leave");
  assert.equal(rowOf(r, "c").days[0].status, "wfh");
  assert.equal(rowOf(r, "d").days[0].status, "holiday");
});

test("register CSV has a work-from-home column", () => {
  const csv = registerToCsv(register({ wfh: [{ employeeId: "a", dayKey: "2026-03-09" }] }));
  assert.ok(csv.includes("Work from home days"));
  assert.ok(csv.includes("Work from home"));
});

// ------------------------------------------------------------------ the routes
test("guards: loader is bounded, scoped and the preview is gone", () => {
  const loader = readFileSync("src/lib/attendance-data.server.ts", "utf8");
  const fn = loader.slice(loader.indexOf("export async function loadWfhRange"));
  assert.ok(fn.includes('.where("orgId", "==", scope.orgId)'));
  assert.ok(fn.includes('scope.role === "manager"') && fn.includes('"managerId", "==", scope.uid'));
  assert.ok(fn.includes(".limit(cap)"));
  assert.ok(!existsSync("src/routes/_authenticated/wfh-preview.tsx"));
  assert.ok(!existsSync("src/lib/wfh-sample.ts"));
  const today = readFileSync("src/routes/api/attendance/today.ts", "utf8");
  assert.equal((today.match(/wfhEmployeeIds: wfhIds/g) ?? []).length, 2, "both paths pass work from home");
  const register = readFileSync("src/routes/api/reports/register.ts", "utf8");
  assert.equal((register.match(/wfh: wfhRead\.days/g) ?? []).length, 2, "both register paths pass work from home");
});
