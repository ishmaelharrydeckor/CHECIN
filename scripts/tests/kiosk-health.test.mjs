import { test } from "node:test";
import assert from "node:assert/strict";
import { QR_STALE_AFTER_MS, isQrStale, kioskStatus, retryDelayMs } from "../../src/lib/kiosk-health.ts";

const now = 1_000_000;

test("isQrStale: fresh until 20 seconds, stale from then on", () => {
  assert.equal(isQrStale(now - 1000, now), false);
  assert.equal(isQrStale(now - (QR_STALE_AFTER_MS - 1), now), false);
  assert.equal(isQrStale(now - QR_STALE_AFTER_MS, now), true);
  assert.equal(isQrStale(now - 120_000, now), true);
});

test("isQrStale: never refreshed counts as stale", () => {
  assert.equal(isQrStale(null, now), true);
});

test("the stale limit is longer than the slowest normal refresh and shorter than a code's longest life", () => {
  assert.ok(QR_STALE_AFTER_MS > 12_000 + 3_000, "must allow 12 s polling plus network time");
  assert.ok(QR_STALE_AFTER_MS < 30_000, "must be hidden before the code can be 30 s old");
});

test("kioskStatus: starting, live, offline", () => {
  assert.equal(kioskStatus({ lastSuccessMs: null, nowMs: now, failures: 0, credentialError: false }), "starting");
  assert.equal(kioskStatus({ lastSuccessMs: now - 3000, nowMs: now, failures: 0, credentialError: false }), "live");
  assert.equal(kioskStatus({ lastSuccessMs: now - 25_000, nowMs: now, failures: 3, credentialError: false }), "offline");
});

test("kioskStatus: never connected and failing is offline, not 'starting' forever", () => {
  assert.equal(kioskStatus({ lastSuccessMs: null, nowMs: now, failures: 2, credentialError: false }), "offline");
});

test("kioskStatus: one failed poll while the last code is still fresh keeps showing the code", () => {
  assert.equal(kioskStatus({ lastSuccessMs: now - 5000, nowMs: now, failures: 1, credentialError: false }), "live");
});

test("kioskStatus: a rejected secret always needs a person, whatever else is true", () => {
  assert.equal(kioskStatus({ lastSuccessMs: now - 1000, nowMs: now, failures: 0, credentialError: true }), "credentials");
  assert.equal(kioskStatus({ lastSuccessMs: null, nowMs: now, failures: 0, credentialError: true }), "credentials");
});

test("retryDelayMs: quick at first, backs off, never above 15 s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(retryDelayMs), [3000, 3000, 5000, 8000, 12000, 15000]);
  assert.equal(retryDelayMs(6), 15000);
  assert.equal(retryDelayMs(500), 15000);
  assert.equal(retryDelayMs(-3), 3000);
});
