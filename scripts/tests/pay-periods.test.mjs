import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_PERIODS_LISTED,
  daysInPeriod,
  nextPeriod,
  parsePayPeriodSettings,
  payPeriodId,
  periodContaining,
  periodsBetween,
  previousPeriod,
} from "../../src/lib/pay-periods.ts";

const monthly = { type: "monthly" };
const semi = { type: "semimonthly" };
const weekly = { type: "weekly", anchorDay: "2026-11-02" }; // a Monday
const biweekly = { type: "biweekly", anchorDay: "2026-11-02" };

// ---- settings, refused with a plain sentence ------------------------------------------------------------

test("valid settings are accepted for every type", () => {
  assert.deepEqual(parsePayPeriodSettings({ type: "monthly" }), { ok: true, value: { type: "monthly" } });
  assert.deepEqual(parsePayPeriodSettings({ type: "semimonthly", anchorDay: "2026-01-01" }), { ok: true, value: { type: "semimonthly" } }, "an anchor means nothing here and is dropped");
  assert.deepEqual(parsePayPeriodSettings({ type: "weekly", anchorDay: "2026-11-02" }), { ok: true, value: { type: "weekly", anchorDay: "2026-11-02" } });
  assert.deepEqual(parsePayPeriodSettings({ type: "biweekly", anchorDay: "2026-11-02" }), { ok: true, value: { type: "biweekly", anchorDay: "2026-11-02" } });
});

test("bad settings are refused in words", () => {
  for (const bad of [null, undefined, 5, "monthly", [], {}, { type: "daily" }, { type: "weekly" }, { type: "weekly", anchorDay: "next monday" }, { type: "biweekly", anchorDay: "2026-02-30" }, { type: "weekly", anchorDay: 20261102 }, { type: "weekly", anchorDay: "1999-01-04" }, { type: "weekly", anchorDay: "2101-01-04" }]) {
    const r = parsePayPeriodSettings(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(typeof r.error === "string" && r.error.length > 20 && !/undefined|\[object/.test(r.error), JSON.stringify(bad));
  }
});

// ---- the four kinds of period, with the awkward edges ---------------------------------------------------------

test("monthly: a whole calendar month, including leap years and year ends", () => {
  assert.deepEqual(periodContaining(monthly, "2026-11-17"), { startDay: "2026-11-01", endDay: "2026-11-30", days: 30 });
  assert.deepEqual(periodContaining(monthly, "2026-02-28"), { startDay: "2026-02-01", endDay: "2026-02-28", days: 28 });
  assert.deepEqual(periodContaining(monthly, "2028-02-10"), { startDay: "2028-02-01", endDay: "2028-02-29", days: 29 });
  assert.deepEqual(periodContaining(monthly, "2026-12-31"), { startDay: "2026-12-01", endDay: "2026-12-31", days: 31 });
  assert.deepEqual(periodContaining(monthly, "2027-01-01"), { startDay: "2027-01-01", endDay: "2027-01-31", days: 31 });
  assert.equal(periodContaining(monthly, "2026-11-30").endDay, "2026-11-30", "the last day belongs to its own month");
  assert.equal(periodContaining(monthly, "2026-12-01").startDay, "2026-12-01", "the next day starts the next period");
});

test("twice a month: the 1st to the 15th, then the 16th to the end of the month", () => {
  assert.deepEqual(periodContaining(semi, "2026-11-01"), { startDay: "2026-11-01", endDay: "2026-11-15", days: 15 });
  assert.deepEqual(periodContaining(semi, "2026-11-15"), { startDay: "2026-11-01", endDay: "2026-11-15", days: 15 });
  assert.deepEqual(periodContaining(semi, "2026-11-16"), { startDay: "2026-11-16", endDay: "2026-11-30", days: 15 });
  assert.deepEqual(periodContaining(semi, "2026-10-31"), { startDay: "2026-10-16", endDay: "2026-10-31", days: 16 });
  assert.deepEqual(periodContaining(semi, "2026-02-20"), { startDay: "2026-02-16", endDay: "2026-02-28", days: 13 });
  assert.deepEqual(periodContaining(semi, "2028-02-20"), { startDay: "2028-02-16", endDay: "2028-02-29", days: 14 });
});

test("weekly: seven days from the anchor, before and after it", () => {
  assert.deepEqual(periodContaining(weekly, "2026-11-02"), { startDay: "2026-11-02", endDay: "2026-11-08", days: 7 });
  assert.deepEqual(periodContaining(weekly, "2026-11-08"), { startDay: "2026-11-02", endDay: "2026-11-08", days: 7 });
  assert.deepEqual(periodContaining(weekly, "2026-11-09"), { startDay: "2026-11-09", endDay: "2026-11-15", days: 7 });
  assert.deepEqual(periodContaining(weekly, "2026-10-30"), { startDay: "2026-10-26", endDay: "2026-11-01", days: 7 }, "before the anchor");
  assert.deepEqual(periodContaining(weekly, "2025-12-31"), { startDay: "2025-12-29", endDay: "2026-01-04", days: 7 }, "across a year end, long before the anchor");
  // The anchor can be any day of the week it should start on.
  const sunday = { type: "weekly", anchorDay: "2026-11-01" };
  assert.deepEqual(periodContaining(sunday, "2026-11-04"), { startDay: "2026-11-01", endDay: "2026-11-07", days: 7 });
  assert.equal(periodContaining({ type: "weekly", anchorDay: "2026-11-18" }, "2026-11-02").startDay, "2026-10-28", "an anchor in the future still works");
});

test("every two weeks: fourteen days from the anchor", () => {
  assert.deepEqual(periodContaining(biweekly, "2026-11-02"), { startDay: "2026-11-02", endDay: "2026-11-15", days: 14 });
  assert.deepEqual(periodContaining(biweekly, "2026-11-15"), { startDay: "2026-11-02", endDay: "2026-11-15", days: 14 });
  assert.deepEqual(periodContaining(biweekly, "2026-11-16"), { startDay: "2026-11-16", endDay: "2026-11-29", days: 14 });
  assert.deepEqual(periodContaining(biweekly, "2026-10-20"), { startDay: "2026-10-19", endDay: "2026-11-01", days: 14 }, "before the anchor");
});

test("a bad day is refused, not guessed", () => {
  for (const bad of ["", "2026-13-01", "2026-02-30", "11/05/2026", null, undefined, 20261105]) {
    assert.throws(() => periodContaining(monthly, bad), RangeError, String(bad));
  }
});

// ---- the periods tile the calendar: no gap, no overlap ----------------------------------------------------------

test("for every type, every day is in exactly one period and neighbouring periods touch", () => {
  const span = { from: "2025-12-15", to: "2028-03-20" }; // leap day, two year ends
  for (const [name, settings] of Object.entries({ monthly, semi, weekly, biweekly })) {
    const list = periodsBetween(settings, span.from, span.to, 100);
    assert.ok(list.length > 10, name);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const here = list[i];
      assert.equal(nextPeriod(settings, prev).startDay, here.startDay, `${name}: next of ${prev.startDay}`);
      assert.equal(previousPeriod(settings, here).startDay, prev.startDay, `${name}: previous of ${here.startDay}`);
      const dayAfterPrev = daysInPeriod(prev).at(-1);
      assert.equal(periodContaining(settings, dayAfterPrev).startDay, prev.startDay);
      assert.equal(daysInPeriod(here)[0], here.startDay);
    }
    // Walk day by day: each day sits inside the period that claims it.
    let day = span.from;
    for (let n = 0; n < 800; n++) {
      const p = periodContaining(settings, day);
      assert.ok(p.startDay <= day && day <= p.endDay, `${name} ${day}`);
      assert.equal(daysInPeriod(p).length, p.days);
      assert.ok(p.days >= 7 && p.days <= 31, `${name} ${day} length ${p.days}`);
      const d = new Date(`${day}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      day = d.toISOString().slice(0, 10);
    }
  }
});

test("listing periods is bounded and covers the whole range it is asked for", () => {
  const list = periodsBetween(monthly, "2026-10-20", "2026-12-05");
  assert.deepEqual(list.map((p) => p.startDay), ["2026-10-01", "2026-11-01", "2026-12-01"]);
  assert.equal(periodsBetween(monthly, "2026-11-05", "2026-11-05").length, 1);
  assert.deepEqual(periodsBetween(monthly, "2026-12-05", "2026-10-20"), [], "backwards is empty");
  assert.equal(periodsBetween(weekly, "2000-01-01", "2100-01-01").length, MAX_PERIODS_LISTED, "never an unbounded list");
});

test("days of a period are listed in order, one each", () => {
  assert.deepEqual(daysInPeriod({ startDay: "2026-02-26", endDay: "2026-03-02", days: 5 }), ["2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
});

test("the period id is stable: the organization and the first day", () => {
  assert.equal(payPeriodId("orgA", "2026-11-01"), "orgA_2026-11-01");
  assert.throws(() => payPeriodId("", "2026-11-01"), RangeError);
  assert.throws(() => payPeriodId("orgA", "soon"), RangeError);
});

test("the module is pure: no database, no clock, no device time, no alias imports", () => {
  const src = readFileSync("src/lib/pay-periods.ts", "utf8");
  assert.doesNotMatch(src, /firebase|firestore/i);
  assert.doesNotMatch(src, /Date\.now|new Date\(\)|getHours|toLocale|process\./);
  assert.doesNotMatch(src, /from\s+["']@\//);
});
