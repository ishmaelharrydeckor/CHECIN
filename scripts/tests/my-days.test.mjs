import test from "node:test";
import assert from "node:assert/strict";
import { MY_DAYS, buildMyDays, recentSummaryIds } from "../../src/lib/my-days.ts";

const TZ = "Africa/Accra"; // UTC+0, so an ISO instant reads the same clock time
const NOW = Date.parse("2026-10-09T12:00:00Z");

const day = (over = {}) => ({
  orgId: "org1",
  employeeId: "u1",
  dayKey: "2026-10-09",
  firstIn: "2026-10-09T08:14:30Z",
  lastOut: "2026-10-09T17:02:00Z",
  state: "out",
  minutesWorked: 528,
  late: false,
  earlyDeparture: false,
  ...over,
});
const ctx = { employeeId: "u1", orgId: "org1", timezone: TZ, now: NOW };

test("recentSummaryIds: today and the six days before it, newest first, for this person only", () => {
  const ids = recentSummaryIds("u1", TZ, NOW);
  assert.equal(ids.length, MY_DAYS);
  assert.equal(ids[0], "u1_2026-10-09");
  assert.equal(ids[6], "u1_2026-10-03");
  assert.ok(ids.every((id) => id.startsWith("u1_")));
});

test("buildMyDays: shows times in the organization's timezone and the worked minutes as given", () => {
  const [row] = buildMyDays([day()], ctx);
  assert.equal(row.firstIn, "08:14");
  assert.equal(row.lastOut, "17:02");
  assert.equal(row.minutesWorked, 528);
  assert.equal(row.stillIn, false);
  assert.equal(row.noCheckOut, false);
});

test("buildMyDays: a different timezone changes the clock time shown", () => {
  const [row] = buildMyDays([day()], { ...ctx, timezone: "Asia/Tokyo" });
  assert.equal(row.firstIn, "17:14");
});

test("buildMyDays: checked in today is 'still in'; a past day left open is 'no check-out'", () => {
  const rows = buildMyDays(
    [day({ state: "in", lastOut: null }), day({ dayKey: "2026-10-08", state: "in", lastOut: null })],
    ctx,
  );
  assert.equal(rows[0].dayKey, "2026-10-09");
  assert.equal(rows[0].stillIn, true);
  assert.equal(rows[0].noCheckOut, false);
  assert.equal(rows[1].stillIn, false);
  assert.equal(rows[1].noCheckOut, true);
});

test("buildMyDays: drops anything that is not this person's or this organization's", () => {
  const rows = buildMyDays(
    [day({ employeeId: "someone-else" }), day({ orgId: "other-org" }), day({ dayKey: 5 }), day({ dayKey: "2026-10-08" })],
    ctx,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dayKey, "2026-10-08");
});

test("buildMyDays: newest first, never more than seven, tolerant of missing fields", () => {
  const many = Array.from({ length: 10 }, (_, i) => day({ dayKey: `2026-09-${20 + i}` }));
  const rows = buildMyDays(many, ctx);
  assert.ok(rows.length <= MY_DAYS);
  const sorted = [...rows].sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
  assert.deepEqual(rows.map((r) => r.dayKey), sorted.map((r) => r.dayKey));
  const [bare] = buildMyDays([{ orgId: "org1", employeeId: "u1", dayKey: "2026-10-09" }], ctx);
  assert.equal(bare.firstIn, null);
  assert.equal(bare.minutesWorked, 0);
});
