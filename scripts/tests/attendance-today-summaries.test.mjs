import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTodaySummary,
  buildTodayFromSummaries,
  buildWeekTrend,
  buildWeekTrendFromSummaries,
} from "../../src/lib/attendance-today.ts";
import { summaryFromEvents } from "../../src/lib/daily-summary.ts";

const TZ = "Africa/Accra";
const NOW = new Date("2026-03-10T15:00:00.000Z"); // Tuesday
const roster = [
  { uid: "a", displayName: "Ama", department: "Ops" },
  { uid: "b", displayName: "Kofi", department: "Ops" },
  { uid: "c", displayName: "Esi", department: "Sales" },
  { uid: "d", displayName: "Yaw", department: "Sales" },
];

let n = 0;
const ev = (employeeId, type, day, hhmm, extra = {}) => ({
  id: `e${++n}`,
  employeeId,
  employeeName: roster.find((r) => r.uid === employeeId)?.displayName,
  type,
  timestamp: `${day}T${hhmm}:00.000Z`,
  ...extra,
});

/** Group events into per-person-per-day summaries, the way the scan route builds them. */
function summariesOf(events) {
  const groups = new Map();
  for (const e of events) {
    const day = e.timestamp.slice(0, 10); // UTC == Accra in these tests
    const key = `${e.employeeId}|${day}`;
    if (!groups.has(key)) groups.set(key, { identity: { orgId: "o1", managerId: "m1", employeeId: e.employeeId, employeeName: e.employeeName, dayKey: day }, events: [] });
    groups.get(key).events.push(e);
  }
  return [...groups.values()].map((g) => summaryFromEvents(g.events, g.identity, NOW.toISOString()));
}

const todayEvents = [
  ev("a", "in", "2026-03-10", "08:00"),
  ev("a", "out", "2026-03-10", "12:00"),
  ev("a", "in", "2026-03-10", "13:00"),
  ev("b", "in", "2026-03-10", "09:20", { late: true }),
  ev("c", "in", "2026-03-10", "07:55"),
  ev("c", "out", "2026-03-10", "11:55", { earlyDeparture: true }),
  // d has not arrived
  ev("a", "in", "2026-03-09", "08:05"), // yesterday: must not count
];

test("counts from summaries match the counts from raw events", () => {
  const fromEvents = buildTodaySummary({ events: todayEvents, roster, timezone: TZ, now: NOW });
  const fromSummaries = buildTodayFromSummaries({
    summaries: summariesOf(todayEvents),
    recentEvents: todayEvents,
    roster,
    timezone: TZ,
    now: NOW,
  });
  assert.deepEqual(fromSummaries.counts, fromEvents.counts);
  assert.deepEqual(fromSummaries.onTimeRate, fromEvents.onTimeRate);
  assert.deepEqual(fromSummaries.late, fromEvents.late);
  assert.deepEqual(fromSummaries.notArrived, fromEvents.notArrived);
  assert.equal(fromSummaries.eventsTotal, 6); // today's six events, not yesterday's
});

test("present, on site, late and not arrived are right for a known day", () => {
  const s = buildTodayFromSummaries({ summaries: summariesOf(todayEvents), recentEvents: [], roster, timezone: TZ, now: NOW });
  assert.equal(s.counts.expected, 4);
  assert.equal(s.counts.present, 3); // a, b, c
  assert.equal(s.counts.onSite, 2); // a (back from lunch) and b; c left
  assert.equal(s.counts.late, 1);
  assert.equal(s.counts.absent, 1);
  assert.deepEqual(s.notArrived.map((p) => p.employeeId), ["d"]);
  assert.deepEqual(s.late.map((p) => p.employeeId), ["b"]);
  assert.equal(s.late[0].arrivedAt, "09:20");
});

test("average shift is the average of each person's total worked minutes", () => {
  const s = buildTodayFromSummaries({ summaries: summariesOf(todayEvents), recentEvents: [], roster, timezone: TZ, now: NOW });
  // a: 08:00-12:00 = 240 (still in again, not counted yet); c: 07:55-11:55 = 240; b never left.
  assert.equal(s.avgShift.completed, 2);
  assert.equal(s.avgShift.avgMinutes, 240);
  assert.equal(s.avgShift.inProgress, 2);
});

test("a summary from another day is ignored", () => {
  const s = buildTodayFromSummaries({ summaries: summariesOf([ev("a", "in", "2026-03-09", "08:00")]), recentEvents: [], roster, timezone: TZ, now: NOW });
  assert.equal(s.counts.present, 0);
  assert.equal(s.counts.absent, 4);
});

test("the activity list is today's newest events only, capped", () => {
  const s = buildTodayFromSummaries({
    summaries: summariesOf(todayEvents),
    recentEvents: todayEvents,
    roster,
    timezone: TZ,
    now: NOW,
    eventLimit: 3,
  });
  assert.equal(s.events.length, 3);
  assert.equal(s.events[0].time, "13:00");
  assert.ok(s.events.every((e) => e.timestamp.startsWith("2026-03-10")));
});

test("truncated is passed through so the page can warn about undercounting", () => {
  const s = buildTodayFromSummaries({ summaries: [], recentEvents: [], roster, timezone: TZ, now: NOW, truncated: true });
  assert.equal(s.truncated, true);
});

test("week trend from summaries matches the one from events", () => {
  const events = [
    ev("a", "in", "2026-03-09", "08:00"),
    ev("b", "in", "2026-03-09", "09:30", { late: true }),
    ev("a", "in", "2026-03-10", "08:00"),
    ev("a", "out", "2026-03-10", "17:00"),
  ];
  const fromEvents = buildWeekTrend({ events, timezone: TZ, now: NOW });
  const fromSummaries = buildWeekTrendFromSummaries({ summaries: summariesOf(events), timezone: TZ, now: NOW });
  assert.deepEqual(fromSummaries, fromEvents);
  assert.equal(fromSummaries[0].present, 2); // Monday
  assert.equal(fromSummaries[0].late, 1);
  assert.equal(fromSummaries[3].future, true); // Thursday has not happened
});
