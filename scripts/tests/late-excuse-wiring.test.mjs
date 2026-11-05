import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTodayFromSummaries, buildWeekTrendFromSummaries } from "../../src/lib/attendance-today.ts";
import { buildTodayWithShifts } from "../../src/lib/shift-today.ts";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";
import { registerToCsv, dayCellText } from "../../src/lib/report-export.ts";
import { buildAnalytics, analyticsRange } from "../../src/lib/analytics.ts";
import { buildMyDays } from "../../src/lib/my-days.ts";

const TZ = "Africa/Accra";
const DAY = "2026-10-16"; // a Friday
const NOW = new Date("2026-10-16T15:00:00.000Z");
const roster = [
  { uid: "a", displayName: "Ama" },
  { uid: "b", displayName: "Kofi" },
  { uid: "c", displayName: "Esi" },
];

function summary(employeeId, extra = {}) {
  return {
    orgId: "o1", managerId: "m1", employeeId, employeeName: employeeId, department: "", dayKey: DAY,
    firstIn: `${DAY}T08:41:00.000Z`, lastOut: null, lastEventType: "in", lastEventAt: `${DAY}T08:41:00.000Z`,
    state: "in", openSince: `${DAY}T08:41:00.000Z`, minutesWorked: 0, eventCount: 1, late: true,
    earlyDeparture: false, schemaVersion: 1, updatedAt: `${DAY}T08:41:00.000Z`, ...extra,
  };
}
const ev = (employeeId, late) => ({
  id: `e-${employeeId}`, employeeId, type: "in", timestamp: `${DAY}T08:41:00.000Z`, late,
});

const today = (summaries, recentEvents = []) =>
  buildTodayFromSummaries({ summaries, recentEvents, roster, timezone: TZ, now: NOW });

test("Today: an excused late mark is not late, is counted as excused, and the person is still present", () => {
  const s = today([summary("a"), summary("b", { lateExcused: true }), summary("c", { late: false })]);
  assert.equal(s.counts.late, 1, "only Ama is still late");
  assert.equal(s.counts.lateExcused, 1);
  assert.equal(s.counts.present, 3);
  assert.deepEqual(s.late.map((p) => p.employeeId), ["a"]);
  assert.equal(s.onTimeRate.total, 3);
  assert.equal(s.onTimeRate.onTime, 2, "the excused one counts as on time");
});

test("Today: nothing excused means the answer is exactly what it was (no new key)", () => {
  const s = today([summary("a"), summary("c", { late: false })]);
  assert.equal("lateExcused" in s.counts, false);
  assert.equal(s.counts.late, 1);
});

test("Today: the activity row of an excused person says so instead of 'late'", () => {
  const s = today([summary("a", { lateExcused: true })], [ev("a", true)]);
  assert.equal(s.events[0].late, false);
  assert.equal(s.events[0].lateExcused, true);
  const other = today([summary("a")], [ev("a", true)]);
  assert.equal(other.events[0].late, true);
  assert.equal(other.events[0].lateExcused, undefined);
});

test("the stored late flag is never modified by reading it", () => {
  const stored = Object.freeze(summary("a", { lateExcused: true }));
  today([stored]);
  assert.equal(stored.late, true);
});

test("week trend: excused late marks drop out of the late bars", () => {
  const trend = buildWeekTrendFromSummaries({
    summaries: [summary("a"), summary("b", { lateExcused: true })], timezone: TZ, now: NOW,
  });
  const fri = trend.find((d) => d.dayKey === DAY);
  assert.equal(fri.present, 2);
  assert.equal(fri.late, 1);
});

const dayShift = { shiftId: "s1", name: "Day", type: "day", start: "08:00", end: "17:00", graceMinutes: 0, expectedMinutes: null };
test("Today with shifts on follows the same rule", () => {
  const assignments = roster.map((r) => ({ employeeId: r.uid, dayKey: DAY, shift: dayShift }));
  const s = buildTodayWithShifts({
    summaries: [summary("a"), summary("b", { lateExcused: true })], recentEvents: [ev("b", true)], roster, assignments,
    leaves: [], holidays: [], settings: { shiftsEnabled: true, shiftScanMode: "strict", shiftWindowMinutes: 120 },
    timezone: TZ, now: NOW.getTime(),
  });
  assert.equal(s.counts.late, 1);
  assert.equal(s.counts.lateExcused, 1);
  assert.deepEqual(s.late.map((p) => p.employeeId), ["a"]);
  assert.equal(s.events[0].lateExcused, true);
});

const reg = (summaries) =>
  buildAttendanceRegister({
    days: [DAY], people: roster, summaries, leaves: [], holidays: [], timezone: TZ,
    generatedAt: NOW.toISOString(), from: DAY, to: DAY,
  });

test("register: an excused day is present, not late, flagged excused, and the totals follow", () => {
  const r = reg([summary("a"), summary("b", { lateExcused: true })]);
  const a = r.rows.find((x) => x.employeeId === "a");
  const b = r.rows.find((x) => x.employeeId === "b");
  assert.equal(a.days[0].late, true);
  assert.equal(b.days[0].late, false);
  assert.equal(b.days[0].lateExcused, true);
  assert.equal(b.days[0].status, "present");
  assert.equal(a.totals.lateDays, 1);
  assert.equal(b.totals.lateDays, 0);
  assert.equal(b.totals.presentDays, 1);
});

test("export: the CSV says 'late, excused' so nothing is hidden", () => {
  const r = reg([summary("b", { lateExcused: true })]);
  const b = r.rows.find((x) => x.employeeId === "b");
  assert.match(dayCellText(b.days[0]), /late, excused/);
  assert.match(registerToCsv(r), /late, excused/);
  const plain = reg([summary("b")]).rows.find((x) => x.employeeId === "b");
  assert.doesNotMatch(dayCellText(plain.days[0]), /excused/);
});

test("analytics: an excused late mark counts as on time, and attendance is unchanged", () => {
  const range = analyticsRange("last-7", "2026-10-17"); // finished days up to Friday 16th
  const make = (extra) =>
    buildAnalytics({
      period: range, roster, summaries: [{ ...summary("a", extra), minutesWorked: 480 }], leaves: [], holidays: [], wfh: [],
      timezone: TZ, generatedAt: "x",
    });
  const late = make({});
  const excused = make({ lateExcused: true });
  assert.equal(late.punctuality.onTimeDays, 0);
  assert.equal(excused.punctuality.onTimeDays, 1);
  assert.equal(late.attendanceRate.attendedDays, excused.attendanceRate.attendedDays);
  assert.equal(excused.trend.find((t) => t.dayKey === DAY).late, 0);
});

test("My page: an excused day shows as excused, not late", () => {
  const ctx = { employeeId: "a", orgId: "o1", timezone: TZ, now: NOW.getTime() };
  const [plain] = buildMyDays([summary("a")], ctx);
  const [excused] = buildMyDays([summary("a", { lateExcused: true })], ctx);
  assert.equal(plain.late, true);
  assert.equal(plain.lateExcused, false);
  assert.equal(excused.late, false);
  assert.equal(excused.lateExcused, true);
});

test("History: late check-ins on a page are checked against the excuse records, in one bounded read", () => {
  const src = readFileSync("src/routes/api/attendance/history.ts", "utf8");
  assert.ok(src.includes('collection("late_excuses")'));
  assert.ok(src.includes('s.data()?.orgId === orgId'), "an excuse from another organization is never applied");
  assert.ok(src.includes('status === "excused"'));
  assert.ok(src.includes("late: d.late === true && !excused"));
  assert.ok(/try \{[\s\S]*late_excuses[\s\S]*catch/.test(src), "a failed excuse read never breaks the history page");
});

test("screens show the excused state", () => {
  assert.ok(readFileSync("src/components/dashboard/TodayPanel.tsx", "utf8").includes("Late, excused"));
  assert.ok(readFileSync("src/components/me/MyTimesheet.tsx", "utf8").includes("Late, excused"));
  assert.ok(readFileSync("src/routes/_authenticated/history.tsx", "utf8").includes("Late, excused"));
  assert.ok(readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8").includes("Late, excused"));
});
