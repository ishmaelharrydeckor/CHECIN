import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { analyticsRange, buildAnalytics, isPeriodKey } from "../../src/lib/analytics.ts";

// Wed 2026-10-14 is "today", so the finished days are up to Tue 2026-10-13.
const TODAY = "2026-10-14";
const roster = [
  { uid: "a", department: "Ops" },
  { uid: "b", department: "Ops" },
  { uid: "c", department: "Sales" },
  { uid: "d" },
];
const scan = (employeeId, dayKey, extra = {}) => ({ employeeId, dayKey, firstIn: `${dayKey}T08:00:00.000Z`, late: false, minutesWorked: 480, ...extra });

function run(extra = {}) {
  const range = analyticsRange("this-week", TODAY);
  return buildAnalytics({
    period: range, roster, summaries: [], leaves: [], holidays: [], wfh: [], timezone: "UTC",
    generatedAt: "2026-10-14T10:00:00.000Z", ...extra,
  });
}

test("periods: today is never included, this-week starts Monday", () => {
  const r = analyticsRange("this-week", TODAY);
  assert.deepEqual(r.days, ["2026-10-12", "2026-10-13"]);
  assert.equal(r.from, "2026-10-12");
  assert.equal(r.to, "2026-10-13");
  const week = analyticsRange("last-7", TODAY);
  assert.equal(week.days.length, 7);
  assert.equal(week.days.at(-1), "2026-10-13");
  assert.equal(analyticsRange("last-30", TODAY).days.length, 30);
  // First day of the week: nothing finished yet
  const monday = analyticsRange("this-week", "2026-10-12");
  assert.deepEqual(monday.days, []);
  assert.equal(monday.to, "2026-10-12");
  assert.ok(isPeriodKey("last-14") && !isPeriodKey("last-90") && !isPeriodKey(undefined));
});

test("nothing recorded: no rates, no trend days with data claims", () => {
  const s = run();
  assert.equal(s.teamSize, 4);
  assert.equal(s.attendanceRate.percent, 0);
  assert.equal(s.attendanceRate.expectedDays, 8); // 4 people x Mon, Tue
  assert.equal(s.punctuality.percent, null);
  assert.equal(s.avgHoursPerDay.hours, null);
});

test("no working day at all gives null, not 0%", () => {
  const s = buildAnalytics({
    period: analyticsRange("this-week", "2026-10-12"), roster, summaries: [], leaves: [], holidays: [], wfh: [],
    timezone: "UTC", generatedAt: "x",
  });
  assert.equal(s.attendanceRate.percent, null);
  assert.deepEqual(s.trend, []);
});

test("rates, punctuality and hours are worked out from scans", () => {
  const s = run({
    summaries: [
      scan("a", "2026-10-12"), scan("b", "2026-10-12", { late: true, minutesWorked: 360 }),
      scan("a", "2026-10-13"), scan("c", "2026-10-13"),
    ],
  });
  assert.equal(s.attendanceRate.attendedDays, 4);
  assert.equal(s.attendanceRate.percent, 50);
  assert.equal(s.punctuality.arrivalDays, 4);
  assert.equal(s.punctuality.onTimeDays, 3);
  assert.equal(s.punctuality.percent, 75);
  assert.equal(s.avgHoursPerDay.hours, 7.5); // (480*3 + 360) / 4 / 60
  assert.equal(s.trend[0].late, 1);
  assert.equal(s.trend[0].attended, 2);
});

test("work from home counts as attended but never as hours or punctuality", () => {
  const s = run({
    summaries: [scan("a", "2026-10-12")],
    wfh: [{ employeeId: "b", dayKey: "2026-10-12" }],
  });
  assert.equal(s.attendanceRate.attendedDays, 2);
  assert.equal(s.punctuality.arrivalDays, 1);
  assert.equal(s.avgHoursPerDay.daysCounted, 1);
  assert.equal(s.trend[0].attended, 2);
});

test("a scan and a declaration on the same day count once", () => {
  const s = run({ summaries: [scan("a", "2026-10-12")], wfh: [{ employeeId: "a", dayKey: "2026-10-12" }] });
  assert.equal(s.attendanceRate.attendedDays, 1);
});

test("approved leave removes the person from that day; pending leave does not", () => {
  const leave = { employeeId: "d", status: "approved", startDate: "2026-10-12", endDate: "2026-10-12" };
  const s = run({ leaves: [leave, { ...leave, employeeId: "c", status: "pending" }] });
  assert.equal(s.trend[0].expected, 3);
  assert.equal(s.trend[1].expected, 4);
});

test("a holiday and a weekend are not working days", () => {
  const s = buildAnalytics({
    period: analyticsRange("last-7", "2026-10-19"), // Mon 12 .. Sun 18
    roster, summaries: [], leaves: [], holidays: ["2026-10-14"], wfh: [], timezone: "UTC", generatedAt: "x",
  });
  const days = s.trend.map((t) => t.dayKey);
  assert.ok(!days.includes("2026-10-14"), "holiday skipped");
  assert.ok(!days.includes("2026-10-17") && !days.includes("2026-10-18"), "weekend skipped");
  assert.equal(days.length, 4);
});

test("with shifts, only rostered people are expected, on any day of the week", () => {
  const s = buildAnalytics({
    period: { from: "2026-10-17", to: "2026-10-18", days: ["2026-10-17", "2026-10-18"] }, // Sat, Sun
    roster, summaries: [scan("a", "2026-10-17")], leaves: [], holidays: [], wfh: [], timezone: "UTC", generatedAt: "x",
    assignments: [{ employeeId: "a", dayKey: "2026-10-17" }, { employeeId: "b", dayKey: "2026-10-17" }],
  });
  assert.equal(s.trend.length, 1);
  assert.equal(s.trend[0].expected, 2);
  assert.equal(s.attendanceRate.percent, 50);
});

test("people who are not on the team are ignored", () => {
  const s = run({ summaries: [scan("stranger", "2026-10-12")] });
  assert.equal(s.attendanceRate.attendedDays, 0);
});

test("departments: percentages per department, no department kept blank", () => {
  const s = run({ summaries: [scan("a", "2026-10-12"), scan("a", "2026-10-13"), scan("c", "2026-10-12", { late: true })] });
  const ops = s.byDepartment.find((d) => d.department === "Ops");
  const sales = s.byDepartment.find((d) => d.department === "Sales");
  const none = s.byDepartment.find((d) => d.department === "");
  assert.equal(ops.people, 2);
  assert.equal(ops.attendancePercent, 50); // 2 of 4 person-days
  assert.equal(ops.punctualityPercent, 100);
  assert.equal(sales.attendancePercent, 50);
  assert.equal(sales.punctualityPercent, 0);
  assert.equal(none.people, 1);
});

test("the truncated flag is passed through", () => {
  assert.equal(run({ truncated: true }).truncated, true);
  assert.equal(run().truncated, false);
});

test("guards: route is authorized, bounded, cached per scope; the preview is gone", () => {
  const route = readFileSync("src/routes/api/analytics.ts", "utf8");
  assert.ok(route.includes("authorizeReportCaller"), "admin or manager only, rate limited");
  assert.ok(route.includes("dashboardCacheKey(scope)"), "cache key includes who is asking");
  assert.ok(route.includes("isPeriodKey"), "the period is validated");
  assert.ok(!/request\.json\(|\.orgId\b.*searchParams/.test(route), "nothing about identity comes from the request");
  assert.ok(!existsSync("src/routes/_authenticated/analytics-preview.tsx"));
  assert.ok(!existsSync("src/lib/analytics-sample.ts"));
  const dash = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
  assert.ok(dash.includes("<AnalyticsSection"));
});
