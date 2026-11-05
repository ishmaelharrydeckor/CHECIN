import { test } from "node:test";
import assert from "node:assert/strict";
import {
  profileFromSummary,
  applyEventToSummary,
  summaryFromEvents,
  summaryDocId,
  nextTypeFromSummary,
  cooldownFromSummary,
  isIncomplete,
} from "../../src/lib/daily-summary.ts";
import { formatClock } from "../../src/lib/attendance-day.ts";

const id = { orgId: "o1", managerId: "m1", employeeId: "e1", employeeName: "Ama", department: "Ops", dayKey: "2026-03-10" };
const NOW = "2026-03-10T18:00:00.000Z";
const ev = (type, hhmm, extra = {}) => ({ type, timestamp: `2026-03-10T${hhmm}:00.000Z`, ...extra });

test("summaryDocId is deterministic: one document per person per day", () => {
  assert.equal(summaryDocId("e1", "2026-03-10"), "e1_2026-03-10");
});

test("first scan of the day opens a session and keeps its late flag", () => {
  const s = applyEventToSummary(null, ev("in", "08:12", { late: true }), id, NOW);
  assert.equal(s.state, "in");
  assert.equal(s.firstIn, "2026-03-10T08:12:00.000Z");
  assert.equal(s.openSince, s.firstIn);
  assert.equal(s.late, true);
  assert.equal(s.eventCount, 1);
  assert.equal(s.minutesWorked, 0);
});

test("check-out closes the session and adds the minutes", () => {
  let s = applyEventToSummary(null, ev("in", "08:00"), id, NOW);
  s = applyEventToSummary(s, ev("out", "12:30"), id, NOW);
  assert.equal(s.state, "out");
  assert.equal(s.minutesWorked, 270);
  assert.equal(s.openSince, null);
  assert.equal(s.lastOut, "2026-03-10T12:30:00.000Z");
});

test("a return after lunch adds a second session; first check-in and late flag are kept", () => {
  let s = applyEventToSummary(null, ev("in", "08:30", { late: true }), id, NOW);
  s = applyEventToSummary(s, ev("out", "12:00"), id, NOW);
  s = applyEventToSummary(s, ev("in", "13:00", { late: false }), id, NOW);
  s = applyEventToSummary(s, ev("out", "17:00", { earlyDeparture: false }), id, NOW);
  assert.equal(s.firstIn, "2026-03-10T08:30:00.000Z");
  assert.equal(s.late, true);
  assert.equal(s.minutesWorked, 210 + 240);
  assert.equal(s.eventCount, 4);
});

test("the early-departure flag follows the LAST check-out", () => {
  let s = applyEventToSummary(null, ev("in", "08:00"), id, NOW);
  s = applyEventToSummary(s, ev("out", "11:00", { earlyDeparture: true }), id, NOW);
  s = applyEventToSummary(s, ev("in", "12:00"), id, NOW);
  s = applyEventToSummary(s, ev("out", "17:30", { earlyDeparture: false }), id, NOW);
  assert.equal(s.earlyDeparture, false);
});

test("an open session is not counted until it is closed", () => {
  let s = applyEventToSummary(null, ev("in", "08:00"), id, NOW);
  s = applyEventToSummary(s, ev("out", "09:00"), id, NOW);
  s = applyEventToSummary(s, ev("in", "10:00"), id, NOW);
  assert.equal(s.minutesWorked, 60);
  assert.equal(s.state, "in");
});

test("a first scan that is a check-out (check-in was on an earlier day) opens nothing", () => {
  const s = applyEventToSummary(null, ev("out", "09:00"), id, NOW);
  assert.equal(s.firstIn, null);
  assert.equal(s.minutesWorked, 0);
  assert.equal(s.state, "out");
});

test("direction comes from today's summary; no summary today means 'in'", () => {
  assert.equal(nextTypeFromSummary(null), "in");
  assert.equal(nextTypeFromSummary({ lastEventType: "in" }), "out");
  assert.equal(nextTypeFromSummary({ lastEventType: "out" }), "in");
});

test("forgotten check-out yesterday does not turn today's first scan into 'out'", () => {
  // Yesterday's summary is a different document; today has none.
  const yesterday = applyEventToSummary(null, { type: "in", timestamp: "2026-03-09T08:00:00.000Z" }, { ...id, dayKey: "2026-03-09" }, NOW);
  assert.equal(yesterday.state, "in");
  const todayDoc = null;
  assert.equal(nextTypeFromSummary(todayDoc), "in");
});

test("cooldown comes from lastEventAt", () => {
  const today = { lastEventAt: "2026-03-10T08:00:00.000Z" };
  const t0 = new Date("2026-03-10T08:00:00.000Z").getTime();
  assert.equal(cooldownFromSummary(today, t0 + 20_000), 40);
  assert.equal(cooldownFromSummary(today, t0 + 60_000), 0);
  assert.equal(cooldownFromSummary(null, t0), 0);
});

test("incomplete is derived: still 'in' on a day that has ended", () => {
  assert.equal(isIncomplete({ state: "in", dayKey: "2026-03-09" }, "2026-03-10"), true);
  assert.equal(isIncomplete({ state: "in", dayKey: "2026-03-10" }, "2026-03-10"), false);
  assert.equal(isIncomplete({ state: "out", dayKey: "2026-03-09" }, "2026-03-10"), false);
});

test("rebuilding from events gives the same result as applying them live, in any input order", () => {
  const events = [ev("in", "08:30", { late: true }), ev("out", "12:00"), ev("in", "13:00"), ev("out", "17:00", { earlyDeparture: true })];
  let live = null;
  for (const e of events) live = applyEventToSummary(live, e, id, NOW);
  const rebuilt = summaryFromEvents([events[2], events[0], events[3], events[1]], id, NOW);
  assert.deepEqual(rebuilt, live);
  assert.equal(summaryFromEvents([], id, NOW), null);
});

test("formatClock uses the organization timezone, not the server's", () => {
  const t = "2026-03-10T08:52:07.000Z";
  assert.equal(formatClock(t, "UTC"), "08:52:07");
  assert.equal(formatClock(t, "Africa/Accra"), "08:52:07");
  assert.equal(formatClock(t, "Asia/Kolkata"), "14:22:07");
  assert.equal(formatClock(t, "America/New_York"), "04:52:07");
  assert.equal(formatClock(t, "Not/AZone"), "08:52:07"); // falls back to UTC
  assert.equal(formatClock("garbage", "UTC"), "");
});

test("the summary records the department, so a later scan the same day needs no profile read", () => {
  let s = applyEventToSummary(null, ev("in", "08:00"), id, NOW);
  assert.equal(s.department, "Ops");
  s = applyEventToSummary(s, ev("out", "12:00"), id, NOW);
  assert.equal(s.department, "Ops");
  assert.deepEqual(profileFromSummary(s), { name: "Ama", department: "Ops" });
});

test("profileFromSummary gives nothing when there is no summary, or it has no name or department", () => {
  assert.equal(profileFromSummary(null), null);
  assert.equal(profileFromSummary(undefined), null);
  assert.equal(profileFromSummary({ employeeName: "Ama" }), null); // written before the department field existed
  assert.equal(profileFromSummary({ employeeName: "Ama", department: "" }), null); // rebuilt from events, unknown
  assert.equal(profileFromSummary({ employeeName: "  ", department: "Ops" }), null);
  assert.deepEqual(profileFromSummary({ employeeName: " Ama ", department: " Ops " }), { name: "Ama", department: "Ops" });
});

test("a summary written before the department field gains it on the next scan", () => {
  const old = applyEventToSummary(null, ev("in", "08:00"), { ...id, department: "" }, NOW);
  delete old.department; // as stored before this change
  const next = applyEventToSummary(old, ev("out", "12:00"), id, NOW);
  assert.equal(next.department, "Ops");
});

test("first scan of a shift day creates the summary with shiftId, shiftName, shiftStart and shiftEnd", () => {
  const shiftIdentity = {
    ...id,
    shiftId: "shift_day",
    shiftName: "Day Shift",
    shiftStart: "09:00",
    shiftEnd: "17:00",
  };
  const s = applyEventToSummary(null, ev("in", "08:55", { late: false }), shiftIdentity, NOW);
  assert.equal(s.shiftId, "shift_day");
  assert.equal(s.shiftName, "Day Shift");
  assert.equal(s.shiftStart, "09:00");
  assert.equal(s.shiftEnd, "17:00");
  assert.equal(Object.values(s).includes(undefined), false);
});

test("later scans on a shift day keep the shift fields from the first scan", () => {
  const shiftIdentity = {
    ...id,
    shiftId: "shift_night",
    shiftName: "Night Shift",
    shiftStart: "22:00",
    shiftEnd: "06:00",
  };
  let s = applyEventToSummary(null, ev("in", "21:55"), shiftIdentity, NOW);
  // Even if a later scan passes a plain identity, ...prev preserves the shift fields
  s = applyEventToSummary(s, ev("out", "23:55"), id, NOW);
  s = applyEventToSummary(s, ev("in", "00:15"), id, NOW);
  assert.equal(s.shiftId, "shift_night");
  assert.equal(s.shiftName, "Night Shift");
  assert.equal(s.shiftStart, "22:00");
  assert.equal(s.shiftEnd, "06:00");
  assert.equal(Object.values(s).includes(undefined), false);
});

test("a summary created with no shift omits the shift keys and never contains undefined values", () => {
  const s = applyEventToSummary(null, ev("in", "08:00"), id, NOW);
  assert.equal("shiftId" in s, false);
  assert.equal("shiftName" in s, false);
  assert.equal("shiftStart" in s, false);
  assert.equal("shiftEnd" in s, false);
  assert.equal(Object.values(s).includes(undefined), false);

  // Even if caller explicitly passes undefined shift properties on identity, they are omitted
  const withExplicitUndefined = applyEventToSummary(
    null,
    ev("in", "08:00"),
    { ...id, shiftId: undefined, shiftName: undefined, shiftStart: undefined, shiftEnd: undefined },
    NOW,
  );
  assert.equal("shiftId" in withExplicitUndefined, false);
  assert.equal("shiftName" in withExplicitUndefined, false);
  assert.equal("shiftStart" in withExplicitUndefined, false);
  assert.equal("shiftEnd" in withExplicitUndefined, false);
  assert.equal(Object.values(withExplicitUndefined).includes(undefined), false);
});

