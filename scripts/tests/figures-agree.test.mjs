import test from "node:test";
import assert from "node:assert/strict";
import { buildTodayFromSummaries } from "../../src/lib/attendance-today.ts";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";
import { buildTeamRoster } from "../../src/lib/team-roster.ts";
import { buildTodayWithShifts, evaluateShiftToday, rosterTodayFrom } from "../../src/lib/shift-today.ts";
import { readShiftSettings } from "../../src/lib/shift-requests.ts";

// Acceptance pass 4.9: the numbers on the dashboard tiles ("Today") and the team roster must agree, because
// both claim to describe the same people on the same day. Organizations that do not use shifts first.
const TZ = "UTC";
const people = Array.from({ length: 10 }, (_, i) => ({ uid: `u${i}`, displayName: `Person ${i}`, department: i % 2 ? "Lab" : "Office" }));

/** A tiny seeded random generator so a failure can be replayed. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const summary = (uid, day, over = {}) => ({
  employeeId: uid,
  employeeName: uid,
  dayKey: day,
  firstIn: `${day}T08:00:00.000Z`,
  lastOut: null,
  lastEventType: "in",
  lastEventAt: `${day}T08:00:00.000Z`,
  state: "in",
  openSince: `${day}T08:00:00.000Z`,
  minutesWorked: 0,
  eventCount: 1,
  late: false,
  earlyDeparture: false,
  schemaVersion: 1,
  updatedAt: `${day}T08:00:00.000Z`,
  ...over,
});

function scenario(seed, today) {
  const r = rng(seed);
  const monthFrom = `${today.slice(0, 8)}01`;
  const days = [];
  for (let d = monthFrom; d <= today; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) days.push(d);
  const summaries = [];
  const leaves = [];
  const wfh = [];
  for (const p of people) {
    const roll = r();
    if (roll < 0.45) {
      summaries.push(summary(p.uid, today, { late: r() < 0.3, lateExcused: r() < 0.1, state: r() < 0.4 ? "out" : "in" }));
    } else if (roll < 0.6) {
      leaves.push({ employeeId: p.uid, startDate: today, endDate: today, status: "approved" });
    } else if (roll < 0.75) {
      wfh.push({ employeeId: p.uid, dayKey: today });
    }
  }
  return { days, monthFrom, summaries, leaves, wfh };
}

function bothFor(seed, today, holidays = []) {
  const { days, monthFrom, summaries, leaves, wfh } = scenario(seed, today);
  const nowMs = Date.parse(`${today}T12:00:00.000Z`);
  const todayData = buildTodayFromSummaries({
    summaries,
    recentEvents: [],
    roster: people,
    timezone: TZ,
    now: nowMs,
    holidays,
    leaves,
    wfhEmployeeIds: wfh.map((w) => w.employeeId),
  });
  const register = buildAttendanceRegister({
    days,
    people,
    summaries,
    leaves,
    holidays,
    timezone: TZ,
    generatedAt: new Date(nowMs).toISOString(),
    from: monthFrom,
    to: today,
    wfh,
  });
  const states = new Map(summaries.map((s) => [s.employeeId, s.state === "out" ? "out" : "in"]));
  const roster = buildTeamRoster({
    register,
    teamIds: new Set(people.map((p) => p.uid)),
    today,
    todayStates: states,
    todayShifts: new Map(),
    generatedAt: new Date(nowMs).toISOString(),
  });
  const count = (f) => roster.rows.filter(f).length;
  return {
    today: todayData.counts,
    roster: {
      present: count((r) => r.status === "in" || r.status === "out"),
      onSite: count((r) => r.status === "in"),
      late: count((r) => r.late),
      lateExcused: count((r) => r.lateExcused),
      onLeave: count((r) => r.status === "leave"),
      wfh: count((r) => r.status === "wfh"),
      absent: count((r) => r.status === "absent"),
    },
  };
}

// Wednesday 21 October 2026 and Thursday 22 October 2026: ordinary working days.
for (const today of ["2026-10-21", "2026-10-22"]) {
  test(`weekday ${today}: every number on the Today tiles matches the team roster, over 200 random days`, () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { today: t, roster: r } = bothFor(seed, today);
      assert.equal(t.present, r.present, `present (seed ${seed})`);
      assert.equal(t.onSite, r.onSite, `on site (seed ${seed})`);
      assert.equal(t.late, r.late, `late (seed ${seed})`);
      assert.equal(t.onLeave, r.onLeave, `on leave (seed ${seed})`);
      assert.equal(t.wfh, r.wfh, `working from home (seed ${seed})`);
      assert.equal(t.absent, r.absent, `absent (seed ${seed})`);
    }
  });
}

test("on a Saturday nobody is absent: the Today tiles and the roster agree that no one was expected", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { today: t, roster: r } = bothFor(seed, "2026-10-24");
    assert.equal(r.absent, 0, `roster (seed ${seed})`);
    assert.equal(t.absent, 0, `Today tile absent (seed ${seed})`);
  }
});

test("on a public holiday nobody is absent either", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { today: t, roster: r } = bothFor(seed, "2026-10-21", ["2026-10-21"]);
    assert.equal(r.absent, 0, `roster (seed ${seed})`);
    assert.equal(t.absent, 0, `Today tile absent (seed ${seed})`);
  }
});

// ---------------------------------------------------------------- organizations that use shifts

/** What the roster route does with shifts: today's state comes from the same evaluation the Today tiles use. */
function overrideFor({ summaries, assignments, leaves, holidays, nowMs, wfh, today }) {
  const evaluations = evaluateShiftToday({
    summaries, roster: people, assignments, leaves, holidays, settings: readShiftSettings({ shiftsEnabled: true }), timezone: TZ, now: nowMs,
  });
  const wfhToday = new Set(wfh.filter((w) => w.dayKey === today).map((w) => w.employeeId));
  return new Map(evaluations.map((ev) => [ev.member.uid, rosterTodayFrom(ev, wfhToday.has(ev.member.uid), TZ)]));
}

const DAY_SHIFT = { shiftId: "day", name: "Day", type: "day", start: "08:00", end: "16:00", graceMinutes: 15, expectedMinutes: null };

function shiftBoth(seed, today, hour) {
  const r = rng(seed * 7919);
  const base = scenario(seed, today);
  const { days, monthFrom, summaries, leaves } = base;
  const nowMs = Date.parse(`${today}T${String(hour).padStart(2, "0")}:00:00.000Z`);
  // About three in four people are rostered for the day shift on every day of the month so far.
  const rostered = people.filter(() => r() < 0.75).map((p) => p.uid);
  // Work from home is declared by people who have a shift that day (the normal case; see the note below).
  const wfh = base.wfh.filter((w) => rostered.includes(w.employeeId));
  const assignments = rostered.flatMap((uid) => days.map((d) => ({ employeeId: uid, dayKey: d, shift: DAY_SHIFT })));
  const settings = readShiftSettings({ shiftsEnabled: true });
  const todayData = buildTodayWithShifts({
    summaries, recentEvents: [], roster: people, assignments, leaves, holidays: [], settings, timezone: TZ, now: nowMs,
    wfhEmployeeIds: wfh.map((w) => w.employeeId),
  });
  const register = buildAttendanceRegister({
    days, people, summaries, leaves, holidays: [], timezone: TZ, generatedAt: new Date(nowMs).toISOString(),
    from: monthFrom, to: today, wfh, shifts: { assignments, nowMs },
  });
  const states = new Map(summaries.map((s) => [s.employeeId, s.state === "out" ? "out" : "in"]));
  const roster = buildTeamRoster({
    register, teamIds: new Set(people.map((p) => p.uid)), today, todayStates: states, todayShifts: new Map(),
    todayOverride: overrideFor({ summaries, assignments, leaves, holidays: [], nowMs, wfh, today }),
    generatedAt: new Date(nowMs).toISOString(),
  });
  const count = (f) => roster.rows.filter(f).length;
  return {
    today: todayData.counts,
    roster: {
      present: count((x) => x.status === "in" || x.status === "out"),
      late: count((x) => x.late),
      onLeave: count((x) => x.status === "leave"),
      wfh: count((x) => x.status === "wfh"),
      absent: count((x) => x.status === "absent"),
    },
  };
}

for (const hour of [7, 12, 18]) {
  test(`with day shifts at ${String(hour).padStart(2, "0")}:00 the Today tiles and the roster agree`, () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { today: t, roster: r } = shiftBoth(seed, "2026-10-21", hour);
      assert.equal(t.present, r.present, `present (seed ${seed})`);
      assert.equal(t.late, r.late, `late (seed ${seed})`);
      assert.equal(t.onLeave, r.onLeave, `on leave (seed ${seed})`);
      assert.equal(t.wfh, r.wfh, `working from home (seed ${seed})`);
      assert.equal(t.absent, r.absent, `absent (seed ${seed})`);
    }
  });
}

// ---------------------------------------------------------------- night shifts
const NIGHT = { shiftId: "night", name: "Night", type: "night", start: "22:00", end: "06:00", graceMinutes: 15, expectedMinutes: null };

test("a night shift that began yesterday and is still running is on site in both the Today tiles and the roster", () => {
  const today = "2026-10-21";
  const yesterday = "2026-10-20";
  const nowMs = Date.parse(`${today}T02:00:00.000Z`);
  const one = [{ uid: "n1", displayName: "Night Nurse" }];
  const summaries = [summary("n1", yesterday, { firstIn: `${yesterday}T21:55:00.000Z`, openSince: `${yesterday}T21:55:00.000Z` })];
  const assignments = [yesterday, today].map((d) => ({ employeeId: "n1", dayKey: d, shift: NIGHT }));
  const settings = readShiftSettings({ shiftsEnabled: true });
  const t = buildTodayWithShifts({ summaries, recentEvents: [], roster: one, assignments, leaves: [], holidays: [], settings, timezone: TZ, now: nowMs });
  const register = buildAttendanceRegister({
    days: ["2026-10-19", yesterday, today], people: one, summaries, leaves: [], holidays: [], timezone: TZ,
    generatedAt: new Date(nowMs).toISOString(), from: "2026-10-19", to: today, shifts: { assignments, nowMs },
  });
  const evaluations = evaluateShiftToday({ summaries, roster: one, assignments, leaves: [], holidays: [], settings, timezone: TZ, now: nowMs });
  const roster = buildTeamRoster({
    register, teamIds: new Set(["n1"]), today, todayStates: new Map(), todayShifts: new Map(),
    todayOverride: new Map(evaluations.map((ev) => [ev.member.uid, rosterTodayFrom(ev, false, TZ)])),
    generatedAt: new Date(nowMs).toISOString(),
  });
  assert.equal(t.counts.onSite, 1, "the Today tiles see them on site");
  assert.equal(roster.rows[0].status, "in", "and so does the roster");
  assert.equal(roster.rows[0].firstIn, "21:55", "with the time they arrived, on last evening's clock");
  assert.deepEqual(roster.rows[0].shift, { name: "Night", start: "22:00", end: "06:00" }, "and the shift that is running");
});

test("with a mix of day and night shifts, the Today tiles and the roster agree at 02:00, 12:00 and 23:00", () => {
  const today = "2026-10-21";
  const yesterday = "2026-10-20";
  for (const hour of [2, 12, 23]) {
    for (let seed = 1; seed <= 15; seed++) {
      const r = rng(seed * 104729);
      const nowMs = Date.parse(`${today}T${String(hour).padStart(2, "0")}:00:00.000Z`);
      const days = ["2026-10-19", yesterday, today];
      const kind = new Map(people.map((p) => [p.uid, r() < 0.5 ? NIGHT : r() < 0.7 ? DAY_SHIFT : null]));
      const assignments = people.flatMap((p) => (kind.get(p.uid) ? days.map((d) => ({ employeeId: p.uid, dayKey: d, shift: kind.get(p.uid) })) : []));
      const summaries = [];
      for (const p of people) {
        const shift = kind.get(p.uid);
        if (!shift || r() < 0.3) continue;
        // Night workers who arrived last evening are still in; day workers arrive this morning, if it is past it.
        if (shift === NIGHT) summaries.push(summary(p.uid, yesterday, { firstIn: `${yesterday}T21:58:00.000Z`, state: hour < 6 ? "in" : "out", late: r() < 0.2 }));
        else if (hour >= 8) summaries.push(summary(p.uid, today, { firstIn: `${today}T08:01:00.000Z`, state: hour >= 17 ? "out" : "in", late: r() < 0.2 }));
      }
      const settings = readShiftSettings({ shiftsEnabled: true });
      const t = buildTodayWithShifts({ summaries, recentEvents: [], roster: people, assignments, leaves: [], holidays: [], settings, timezone: TZ, now: nowMs });
      const register = buildAttendanceRegister({
        days, people, summaries, leaves: [], holidays: [], timezone: TZ, generatedAt: new Date(nowMs).toISOString(),
        from: days[0], to: today, shifts: { assignments, nowMs },
      });
      const roster = buildTeamRoster({
        register, teamIds: new Set(people.map((p) => p.uid)), today, todayStates: new Map(), todayShifts: new Map(),
        todayOverride: overrideFor({ summaries, assignments, leaves: [], holidays: [], nowMs, wfh: [], today }),
        generatedAt: new Date(nowMs).toISOString(),
      });
      const count = (f) => roster.rows.filter(f).length;
      const where = `hour ${hour}, seed ${seed}`;
      assert.equal(t.counts.present, count((x) => x.status === "in" || x.status === "out"), `present (${where})`);
      assert.equal(t.counts.onSite, count((x) => x.status === "in"), `on site (${where})`);
      assert.equal(t.counts.late, count((x) => x.late), `late (${where})`);
      assert.equal(t.counts.absent, count((x) => x.status === "absent"), `absent (${where})`);
    }
  }
});
