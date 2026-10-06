import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  weekdayIndex,
  startOfDayMs,
  dayBoundsMs,
  weekBoundsMs,
  formatClock,
  buildTodaySummary,
  buildWeekTrend,
} from "../../src/lib/attendance-today.ts";

const iso = (s) => new Date(s).toISOString();
let n = 0;
const ev = (employeeId, type, ts, extra = {}) => ({
  id: `e${++n}`,
  employeeId,
  employeeName: extra.name ?? `Person ${employeeId}`,
  employeeEmail: `${employeeId}@x.test`,
  department: extra.department ?? "Operations",
  locationName: "Main Entrance",
  type,
  timestamp: iso(ts),
  late: extra.late === true,
  earlyDeparture: extra.early === true,
});

test("addDays and weekdayIndex", () => {
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // leap year
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(weekdayIndex("2026-10-05"), 0); // Monday
  assert.equal(weekdayIndex("2026-10-07"), 2); // Wednesday
  assert.equal(weekdayIndex("2026-10-11"), 6); // Sunday
});

test("startOfDayMs / dayBoundsMs: UTC and Accra", () => {
  assert.equal(startOfDayMs("2026-10-05", "UTC"), Date.UTC(2026, 9, 5));
  assert.equal(startOfDayMs("2026-10-05", "Africa/Accra"), Date.UTC(2026, 9, 5));
  const b = dayBoundsMs("2026-10-05", "UTC");
  assert.equal(b.endMs - b.startMs, 24 * 3600_000);
});

test("startOfDayMs: zones ahead of and behind UTC", () => {
  // Auckland is UTC+13 in January (NZDT): 2026-01-02 begins at 2026-01-01T11:00Z
  assert.equal(startOfDayMs("2026-01-02", "Pacific/Auckland"), Date.UTC(2026, 0, 1, 11));
  // Pago Pago is UTC-11: 2026-01-01 begins at 11:00Z the same day
  assert.equal(startOfDayMs("2026-01-01", "Pacific/Pago_Pago"), Date.UTC(2026, 0, 1, 11));
  // Kiritimati is UTC+14
  assert.equal(startOfDayMs("2026-01-02", "Pacific/Kiritimati"), Date.UTC(2026, 0, 1, 10));
});

test("dayBoundsMs: daylight saving days are 23 and 25 hours", () => {
  const spring = dayBoundsMs("2026-03-08", "America/New_York");
  assert.equal(spring.startMs, Date.UTC(2026, 2, 8, 5));
  assert.equal((spring.endMs - spring.startMs) / 3600_000, 23);
  const fall = dayBoundsMs("2026-11-01", "America/New_York");
  assert.equal(fall.startMs, Date.UTC(2026, 10, 1, 4));
  assert.equal((fall.endMs - fall.startMs) / 3600_000, 25);
});

test("formatClock is 24-hour in the org timezone", () => {
  assert.equal(formatClock("2026-10-05T08:14:59Z", "Africa/Accra"), "08:14");
  assert.equal(formatClock("2026-10-05T08:14:00Z", "Pacific/Auckland"), "21:14"); // UTC+13 (NZDT)
  assert.equal(formatClock("2026-10-05T00:05:00Z", "UTC"), "00:05");
  assert.equal(formatClock("nonsense", "UTC"), "--:--");
  assert.equal(formatClock("2026-10-05T08:14:00Z", "Bad/Zone"), "08:14"); // falls back to UTC
});

// ---------------------------------------------------------------------------

const now = Date.parse("2026-10-05T14:00:00Z"); // Monday 14:00 UTC
const roster = ["A", "B", "C", "D", "E"].map((id) => ({
  uid: id,
  displayName: `Person ${id}`,
  email: `${id}@x.test`,
  department: "Operations",
}));

function scenario() {
  return [
    ev("A", "in", "2026-10-05T08:00:00Z"),
    ev("A", "out", "2026-10-05T12:30:00Z"),
    ev("B", "in", "2026-10-05T09:30:00Z", { late: true }),
    // C forgot to check out YESTERDAY: must NOT count as present today
    ev("C", "in", "2026-10-04T08:00:00Z"),
    ev("D", "in", "2026-10-05T08:10:00Z"),
    ev("D", "out", "2026-10-05T12:00:00Z"),
    ev("D", "in", "2026-10-05T13:00:00Z"),
  ];
}

test("buildTodaySummary: counts are about TODAY only", () => {
  const s = buildTodaySummary({ events: scenario(), roster, timezone: "UTC", now });
  assert.equal(s.dayKey, "2026-10-05");
  assert.equal(s.counts.expected, 5);
  assert.equal(s.counts.present, 3); // A, B, D (C's event is yesterday)
  assert.equal(s.counts.onSite, 2); // B and D are "in" as their latest event today
  assert.equal(s.counts.late, 1);
  assert.equal(s.counts.absent, 2); // C and E
  assert.equal(s.counts.onLeave, 0);
  assert.equal(s.counts.wfh, 0);
});

test("buildTodaySummary: the forgotten check-out from yesterday is ignored", () => {
  const s = buildTodaySummary({ events: scenario(), roster, timezone: "UTC", now });
  assert.ok(!s.events.some((e) => e.employeeId === "C"));
  assert.ok(s.notArrived.some((p) => p.employeeId === "C"));
});

test("buildTodaySummary: late list, not-arrived list, on-time rate", () => {
  const s = buildTodaySummary({ events: scenario(), roster, timezone: "UTC", now });
  assert.deepEqual(
    s.late.map((l) => [l.employeeId, l.arrivedAt]),
    [["B", "09:30"]],
  );
  assert.deepEqual(s.notArrived.map((p) => p.employeeId).sort(), ["C", "E"]);
  assert.deepEqual(s.onTimeRate, { percent: 67, onTime: 2, total: 3 });
});

test("buildTodaySummary: lateness comes from the stored flag, not a fixed time", () => {
  // 09:30 but NOT flagged late (this location opens at 10:00): must count as on time
  const e = [ev("A", "in", "2026-10-05T09:30:00Z", { late: false })];
  const s = buildTodaySummary({ events: e, roster, timezone: "UTC", now });
  assert.equal(s.counts.late, 0);
  assert.equal(s.onTimeRate.percent, 100);
});

test("buildTodaySummary: average shift pairs in/out and counts open shifts", () => {
  const s = buildTodaySummary({ events: scenario(), roster, timezone: "UTC", now });
  // A: 08:00-12:30 = 270 min; D: 08:10-12:00 = 230 min; B and D are still in
  assert.equal(s.avgShift.completed, 2);
  assert.equal(s.avgShift.avgMinutes, 250);
  assert.equal(s.avgShift.inProgress, 2);
});

test("buildTodaySummary: feed is newest first, today only, capped", () => {
  const s = buildTodaySummary({ events: scenario(), roster, timezone: "UTC", now, eventLimit: 3 });
  assert.equal(s.eventsTotal, 6);
  assert.equal(s.events.length, 3);
  assert.deepEqual(
    s.events.map((e) => e.time),
    ["13:00", "12:30", "12:00"],
  );
  assert.equal(s.events[0].initials, "PD");
});

test("buildTodaySummary: empty day", () => {
  const s = buildTodaySummary({ events: [], roster, timezone: "UTC", now });
  assert.equal(s.counts.present, 0);
  assert.equal(s.counts.absent, 5);
  assert.equal(s.onTimeRate.percent, null);
  assert.equal(s.avgShift.avgMinutes, null);
  assert.equal(s.events.length, 0);
});

test("buildTodaySummary: 'today' follows the ORG timezone, not UTC", () => {
  // Auckland (UTC+13): 11:00 on Oct 6 locally is 22:00Z on Oct 5
  const nowNz = Date.parse("2026-10-05T22:00:00Z");
  const e = [
    ev("A", "in", "2026-10-05T20:00:00Z"), // Oct 6, 09:00 local: today
    ev("B", "in", "2026-10-05T10:00:00Z"), // Oct 5, 23:00 local: yesterday
  ];
  const s = buildTodaySummary({ events: e, roster, timezone: "Pacific/Auckland", now: nowNz });
  assert.equal(s.dayKey, "2026-10-06");
  assert.equal(s.counts.present, 1);
  assert.equal(s.events[0].time, "09:00");
});

test("buildTodaySummary: absent never goes negative", () => {
  const few = [{ uid: "A" }];
  const e = [ev("A", "in", "2026-10-05T08:00:00Z"), ev("Z", "in", "2026-10-05T08:05:00Z")];
  const s = buildTodaySummary({ events: e, roster: few, timezone: "UTC", now });
  assert.equal(s.counts.absent, 0);
  assert.equal(s.counts.present, 2);
});

test("buildTodaySummary: passes the truncated flag through", () => {
  assert.equal(buildTodaySummary({ events: [], roster, timezone: "UTC", now, truncated: true }).truncated, true);
  assert.equal(buildTodaySummary({ events: [], roster, timezone: "UTC", now }).truncated, false);
});

// ---------------------------------------------------------------------------

test("buildWeekTrend: Mon-Fri, future days are flagged and empty", () => {
  const wed = Date.parse("2026-10-07T12:00:00Z"); // Wednesday
  const e = [
    ev("A", "in", "2026-10-05T08:00:00Z"),
    ev("B", "in", "2026-10-05T09:40:00Z", { late: true }),
    ev("A", "in", "2026-10-06T08:05:00Z"),
    ev("A", "in", "2026-10-07T08:00:00Z"),
    ev("A", "out", "2026-10-07T10:00:00Z"),
    ev("A", "in", "2026-10-07T11:00:00Z"), // second in on the same day: still one person
    ev("B", "in", "2026-10-07T08:30:00Z"),
  ];
  const w = buildWeekTrend({ events: e, timezone: "UTC", now: wed });
  assert.deepEqual(
    w.map((d) => d.day),
    ["Mon", "Tue", "Wed", "Thu", "Fri"],
  );
  assert.deepEqual(
    w.map((d) => d.present),
    [2, 1, 2, 0, 0],
  );
  assert.deepEqual(
    w.map((d) => d.late),
    [1, 0, 0, 0, 0],
  );
  assert.deepEqual(
    w.map((d) => d.future),
    [false, false, false, true, true],
  );
  assert.deepEqual(
    w.map((d) => d.isToday),
    [false, false, true, false, false],
  );
});

test("buildWeekTrend: lateness is judged on the FIRST check-in of the day", () => {
  const e = [
    ev("A", "in", "2026-10-05T08:00:00Z", { late: false }),
    ev("A", "in", "2026-10-05T13:00:00Z", { late: true }), // back from lunch, flagged late: ignored
  ];
  const w = buildWeekTrend({ events: e, timezone: "UTC", now: Date.parse("2026-10-05T15:00:00Z") });
  assert.equal(w[0].present, 1);
  assert.equal(w[0].late, 0);
});

test("buildWeekTrend: on a weekend the whole week is in the past", () => {
  const sat = Date.parse("2026-10-10T12:00:00Z");
  const w = buildWeekTrend({ events: [], timezone: "UTC", now: sat });
  assert.deepEqual(
    w.map((d) => d.dayKey),
    ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
  );
  assert.ok(w.every((d) => !d.future && !d.isToday));
});

test("weekBoundsMs: Monday start to end of today", () => {
  const b = weekBoundsMs(Date.parse("2026-10-07T12:00:00Z"), "UTC");
  assert.equal(b.monday, "2026-10-05");
  assert.equal(b.today, "2026-10-07");
  assert.equal(b.startMs, Date.UTC(2026, 9, 5));
  assert.equal(b.endMs, Date.UTC(2026, 9, 8));
});
