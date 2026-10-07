import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeScanFailure,
  isRetrySafeFailure,
  chooseScanId,
  describeLastRecorded,
  SCAN_ID_REUSE_MS,
} from "../../src/lib/scan-result.ts";

test("every failure says the check-in was not recorded, except an already-recorded cooldown", () => {
  const cases = [
    [0, "", false],
    [0, "", true],
    [401, "Unauthorized", true],
    [403, "Security Violation: belongs to another organization", true],
    [404, "Invalid entrance terminal", true],
    [409, "", true],
    [400, "Token expired. Please scan the current live QR code on screen.", true],
    [500, "Failed", true],
    [418, "odd", true],
  ];
  for (const [status, msg, online] of cases) {
    const f = describeScanFailure(status, msg, online);
    assert.match(f.detail, /not recorded/i, `status ${status}: ${f.detail}`);
  }
  assert.doesNotMatch(describeScanFailure(429, "", true).detail, /not recorded/i);
});

test("offline is told apart from a server that cannot be reached", () => {
  assert.equal(describeScanFailure(0, "", false).kind, "offline");
  assert.equal(describeScanFailure(0, "", true).kind, "server");
});

test("cooldown reads the wait and the direction from the server message", () => {
  const f = describeScanFailure(
    429,
    "Cooldown active: You checked IN recently. Please wait 42s to prevent accidental double-clocking.",
    true,
  );
  assert.equal(f.kind, "cooldown");
  assert.equal(f.waitSeconds, 42);
  assert.match(f.detail, /checked in/);
  assert.match(f.detail, /42 seconds/);
});

test("an expired code is explained as expired", () => {
  const f = describeScanFailure(400, "Token expired. Please scan the current live QR code on screen.", true);
  assert.equal(f.kind, "expired");
});

test("a 400 that is not about the code falls through to a generic failure", () => {
  assert.equal(describeScanFailure(400, "Missing required token or locationId", true).kind, "other");
  assert.equal(describeScanFailure(400, "Invalid scanId", true).kind, "other");
});

test("messages never use exclamation marks", () => {
  for (const status of [0, 401, 403, 404, 409, 429, 400, 500, 418]) {
    const f = describeScanFailure(status, "Token expired", false);
    assert.doesNotMatch(f.title + f.detail, /!/);
  }
});

test("only a network failure or a 5xx is safe to retry with the same scanId", () => {
  assert.equal(isRetrySafeFailure(0), true);
  assert.equal(isRetrySafeFailure(503), true);
  assert.equal(isRetrySafeFailure(400), false);
  assert.equal(isRetrySafeFailure(429), false);
});

test("chooseScanId reuses the id for the same entrance inside the window, otherwise makes a new one", () => {
  let n = 0;
  const make = () => `new${++n}`;
  const pending = { scanId: "old", key: "loc1", at: 1000 };
  assert.equal(chooseScanId(pending, "loc1", 1000 + SCAN_ID_REUSE_MS, make), "old");
  assert.equal(chooseScanId(pending, "loc1", 1000 + SCAN_ID_REUSE_MS + 1, make), "new1");
  assert.equal(chooseScanId(pending, "loc2", 2000, make), "new2");
  assert.equal(chooseScanId(null, "loc1", 2000, make), "new3");
});

test("describeLastRecorded shortens the time and says nothing before a first scan", () => {
  assert.equal(describeLastRecorded("in", "08:52:07"), "Last recorded: IN at 08:52");
  assert.equal(describeLastRecorded("out", "17:01"), "Last recorded: OUT at 17:01");
  assert.equal(describeLastRecorded("out", null), null);
  assert.equal(describeLastRecorded("in", ""), null);
});
