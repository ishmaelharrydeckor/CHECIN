import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROSTER_MIN_DAYS, ROSTER_READ_BUDGET, buildTeamRoster, rosterPeriod } from "../../src/lib/team-roster.ts";
import { MAX_REPORT_DAYS, REGISTER_READ_BUDGET, buildAttendanceRegister, maxRegisterDays, registerRangeError } from "../../src/lib/report-data.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ---------------------------------------------------------------- the roster's period
test("a team that fits gets the whole month so far", () => {
  assert.deepEqual(rosterPeriod({ today: "2026-10-21", headcount: 50 }), { from: "2026-10-01", days: 21, full: true, label: "this month so far" });
  assert.equal(rosterPeriod({ today: "2026-10-31", headcount: 190 }).full, true, "190 people x 31 days = 5,890 records, within the budget");
});

test("a larger team gets the most days the budget allows, ending today, and the label says so", () => {
  const p = rosterPeriod({ today: "2026-10-21", headcount: 400 });
  assert.equal(p.days, 15);
  assert.equal(p.from, "2026-10-07");
  assert.equal(p.full, false);
  assert.equal(p.label, "over the last 15 days");
  assert.ok(p.days * 400 <= ROSTER_READ_BUDGET, "never more records than the budget");
});

test("a very large team gets no fewer than three days, and the period never crosses into the past beyond the month", () => {
  assert.equal(rosterPeriod({ today: "2026-10-21", headcount: 5000 }).days, ROSTER_MIN_DAYS);
  const early = rosterPeriod({ today: "2026-10-02", headcount: 5000 });
  assert.deepEqual([early.from, early.days, early.full], ["2026-10-01", 2, true], "two days into the month there are only two days to show");
});

test("on the 1st, the period is that single day", () => {
  assert.deepEqual(rosterPeriod({ today: "2026-10-01", headcount: 1000 }), { from: "2026-10-01", days: 1, full: true, label: "this month so far" });
});

test("the period never reads more than the budget for any team size and any day of the month", () => {
  for (const headcount of [1, 10, 100, 190, 191, 250, 400, 800, 1000, 1999, 2000]) {
    for (let day = 1; day <= 31; day++) {
      const today = `2026-10-${String(day).padStart(2, "0")}`;
      const p = rosterPeriod({ today, headcount });
      assert.ok(p.days <= day, `${headcount} people on the ${day}th`);
      if (headcount * ROSTER_MIN_DAYS <= ROSTER_READ_BUDGET) assert.ok(p.days * headcount <= ROSTER_READ_BUDGET || p.days === Math.min(ROSTER_MIN_DAYS, day), `${headcount} people, day ${day}`);
    }
  }
});

test("the roster carries the period it covers, for the screen to say", () => {
  const register = buildAttendanceRegister({
    days: ["2026-10-19", "2026-10-20", "2026-10-21"], people: [{ uid: "a", displayName: "Ama" }], summaries: [], leaves: [], holidays: [],
    timezone: "UTC", generatedAt: "x", from: "2026-10-19", to: "2026-10-21",
  });
  const input = { register, teamIds: new Set(["a"]), today: "2026-10-21", todayStates: new Map(), todayShifts: new Map(), generatedAt: "x" };
  const short = buildTeamRoster({ ...input, period: { from: "2026-10-19", days: 3, full: false, label: "over the last 3 days" } });
  assert.deepEqual([short.from, short.periodLabel, short.periodFull], ["2026-10-19", "over the last 3 days", false]);
  const plain = buildTeamRoster(input);
  assert.deepEqual([plain.periodLabel, plain.periodFull], ["this month so far", true]);
});

// ---------------------------------------------------------------- the register's range
test("a small team can ask for any range up to 31 days", () => {
  assert.equal(maxRegisterDays(10), MAX_REPORT_DAYS);
  assert.equal(maxRegisterDays(193), 31);
  assert.equal(registerRangeError(100, 31), null);
});

test("a large team gets a plain sentence for a range that would be cut off, and the number of days it can have", () => {
  assert.equal(maxRegisterDays(400), 15);
  assert.equal(registerRangeError(400, 15), null);
  assert.equal(registerRangeError(400, 16), "Your team has 400 people, so a register can cover at most 15 days at a time. Please choose a shorter range.");
  assert.equal(registerRangeError(1000, 7), "Your team has 1000 people, so a register can cover at most 6 days at a time. Please choose a shorter range.");
  assert.match(registerRangeError(6000, 2), /at most 1 day at a time/);
});

test("the register's limit never lets a read pass the budget", () => {
  for (const n of [1, 50, 193, 194, 300, 500, 1000, 2000, 6001]) {
    const days = maxRegisterDays(n);
    assert.ok(days >= 1 && days <= 31);
    if (n <= REGISTER_READ_BUDGET) assert.ok(days * n <= REGISTER_READ_BUDGET, `${n} people`);
  }
});

// ---------------------------------------------------------------- wiring
test("both budgets equal the real read ceiling used by the routes", () => {
  const server = read("src/lib/attendance-data.server.ts");
  const cap = Number(/export const WEEK_SUMMARY_CAP = (\d+);/.exec(server)?.[1]);
  assert.equal(ROSTER_READ_BUDGET, cap);
  assert.equal(REGISTER_READ_BUDGET, cap);
});

test("the roster route builds its period from the team size and reads only that period", () => {
  const route = read("src/routes/api/attendance/roster.ts");
  assert.ok(route.includes("rosterPeriod({ today, headcount: roster.length })"));
  assert.ok(route.includes("loadWfhRange(scope, period.from, today, WFH_RANGE_CAP)"));
  assert.ok(route.includes("const readFrom = yesterday < period.from ? yesterday : period.from;"));
  assert.ok(route.includes("                period,\n"), "and passes it on so the screen can say it");
});

test("the register route refuses a range that is too long for the team before reading anything", () => {
  const route = read("src/routes/api/reports/register.ts");
  const refuse = route.indexOf("registerRangeError(roster.length, range.days.length)");
  assert.ok(refuse > 0 && refuse < route.indexOf("loadWfhRange("), "checked before the daily records are read");
  assert.ok(route.includes("status: 400"));
});

test("the screen says which period the bars cover, and why when it is shorter than the month", () => {
  const screen = read("src/components/dashboard/TeamRoster.tsx");
  assert.ok(screen.includes('data?.periodLabel ?? "this month so far"'));
  assert.ok(screen.includes("!data.periodFull") && screen.includes("Your team is large"));
});
