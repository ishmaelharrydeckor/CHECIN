import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKey,
  nextScanType,
  cooldownSecondsLeft,
  SCAN_COOLDOWN_MS,
} from "../../src/lib/attendance-day.ts";

test("dayKey: UTC boundaries", () => {
  assert.equal(dayKey("2026-03-10T00:00:00.000Z", "UTC"), "2026-03-10");
  assert.equal(dayKey("2026-03-09T23:59:59.999Z", "UTC"), "2026-03-09");
});

test("dayKey: the same instant is a different day in different zones", () => {
  const t = "2026-01-01T11:30:00.000Z";
  assert.equal(dayKey(t, "UTC"), "2026-01-01");
  assert.equal(dayKey(t, "Africa/Accra"), "2026-01-01"); // UTC+0
  assert.equal(dayKey(t, "Pacific/Auckland"), "2026-01-02"); // UTC+13 in January (NZDT)
  assert.equal(dayKey(t, "Pacific/Kiritimati"), "2026-01-02"); // UTC+14
  assert.equal(dayKey("2026-01-01T05:00:00.000Z", "America/New_York"), "2026-01-01"); // 00:00 EST
  assert.equal(dayKey("2026-01-01T04:59:59.000Z", "America/New_York"), "2025-12-31"); // 23:59:59 EST
  assert.equal(dayKey("2026-01-01T10:59:00.000Z", "Pacific/Pago_Pago"), "2025-12-31"); // UTC-11
});

test("dayKey: daylight saving changes do not break the day", () => {
  // US spring forward: 2026-03-08 02:00 EST -> 03:00 EDT
  assert.equal(dayKey("2026-03-08T06:59:00.000Z", "America/New_York"), "2026-03-08"); // 01:59 EST
  assert.equal(dayKey("2026-03-08T07:00:00.000Z", "America/New_York"), "2026-03-08"); // 03:00 EDT
  // US fall back: 2026-11-01
  assert.equal(dayKey("2026-11-01T05:30:00.000Z", "America/New_York"), "2026-11-01"); // 01:30 EDT
  assert.equal(dayKey("2026-11-01T06:30:00.000Z", "America/New_York"), "2026-11-01"); // 01:30 EST
  assert.equal(dayKey("2026-11-02T04:59:00.000Z", "America/New_York"), "2026-11-01"); // 23:59 EST
});

test("dayKey: month, year and leap-day ends", () => {
  assert.equal(dayKey("2026-12-31T23:59:59.000Z", "UTC"), "2026-12-31");
  assert.equal(dayKey("2027-01-01T00:00:00.000Z", "UTC"), "2027-01-01");
  assert.equal(dayKey("2028-02-29T12:00:00.000Z", "UTC"), "2028-02-29");
  assert.equal(dayKey("2027-02-28T23:59:59.000Z", "UTC"), "2027-02-28");
});

test("dayKey: accepts Date, number and ISO string", () => {
  const iso = "2026-06-15T12:00:00.000Z";
  assert.equal(dayKey(new Date(iso), "UTC"), "2026-06-15");
  assert.equal(dayKey(Date.parse(iso), "UTC"), "2026-06-15");
  assert.equal(dayKey(iso, "UTC"), "2026-06-15");
});

test("dayKey: bad timezone falls back to UTC, bad date returns null", () => {
  assert.equal(dayKey("2026-06-15T23:30:00.000Z", "Not/AZone"), "2026-06-15");
  assert.equal(dayKey("2026-06-15T23:30:00.000Z", ""), "2026-06-15");
  assert.equal(dayKey("2026-06-15T23:30:00.000Z", undefined), "2026-06-15");
  assert.equal(dayKey("not a date", "UTC"), null);
  assert.equal(dayKey(NaN, "UTC"), null);
});

test("nextScanType: first scan ever is in", () => {
  assert.equal(nextScanType(null, Date.now(), "UTC"), "in");
  assert.equal(nextScanType(undefined, Date.now(), "UTC"), "in");
  assert.equal(nextScanType({}, Date.now(), "UTC"), "in");
});

test("nextScanType: alternates within the same day", () => {
  const now = Date.parse("2026-05-04T17:00:00.000Z");
  assert.equal(nextScanType({ type: "in", timestamp: "2026-05-04T08:00:00.000Z" }, now, "UTC"), "out");
  assert.equal(nextScanType({ type: "out", timestamp: "2026-05-04T12:00:00.000Z" }, now, "UTC"), "in");
});

test("nextScanType: a forgotten check-out yesterday does NOT make today's first scan an out", () => {
  const now = Date.parse("2026-05-05T08:00:00.000Z");
  assert.equal(nextScanType({ type: "in", timestamp: "2026-05-04T08:00:00.000Z" }, now, "UTC"), "in");
});

test("nextScanType: uses the org's local day, not the UTC day", () => {
  // Accra is UTC+0 so the two agree. Auckland is UTC+13 in January:
  // 2026-01-01T20:00Z is 2026-01-02 09:00 local; 2026-01-01T10:00Z is 2026-01-01 23:00 local.
  const last = { type: "in", timestamp: "2026-01-01T10:00:00.000Z" };
  const now = Date.parse("2026-01-01T20:00:00.000Z");
  // Same UTC day, but a different local day in Auckland -> new day -> "in"
  assert.equal(nextScanType(last, now, "Pacific/Auckland"), "in");
  // In UTC it is the same day -> "out"
  assert.equal(nextScanType(last, now, "UTC"), "out");
});

test("nextScanType: just either side of local midnight", () => {
  const tz = "America/New_York";
  const lastLateNight = { type: "in", timestamp: "2026-05-05T03:59:00.000Z" }; // 23:59 EDT on May 4
  assert.equal(nextScanType(lastLateNight, Date.parse("2026-05-05T04:01:00.000Z"), tz), "in"); // 00:01 May 5
  assert.equal(nextScanType(lastLateNight, Date.parse("2026-05-05T03:59:30.000Z"), tz), "out"); // still May 4
});

test("nextScanType: unreadable timestamp is treated as no usable history", () => {
  assert.equal(nextScanType({ type: "in", timestamp: "garbage" }, Date.now(), "UTC"), "in");
});

test("cooldownSecondsLeft", () => {
  const now = Date.parse("2026-05-04T08:00:30.000Z");
  assert.equal(cooldownSecondsLeft(null, now), 0);
  assert.equal(cooldownSecondsLeft({ timestamp: "2026-05-04T08:00:00.000Z" }, now), 30); // 30 s elapsed
  assert.equal(cooldownSecondsLeft({ timestamp: "2026-05-04T08:00:29.500Z" }, now), 60); // 0.5 s elapsed
  assert.equal(cooldownSecondsLeft({ timestamp: "2026-05-04T07:59:30.000Z" }, now), 0); // exactly 60 s
  assert.equal(cooldownSecondsLeft({ timestamp: "2026-05-04T07:00:00.000Z" }, now), 0);
  assert.equal(cooldownSecondsLeft({ timestamp: "garbage" }, now), 0);
  // a timestamp in the future (clock skew) must not lock someone out
  assert.equal(cooldownSecondsLeft({ timestamp: "2026-05-04T09:00:00.000Z" }, now), 0);
  assert.equal(SCAN_COOLDOWN_MS, 60000);
});
