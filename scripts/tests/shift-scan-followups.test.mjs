import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scan = readFileSync("src/routes/api/check-in/scan.ts", "utf8");
const status = readFileSync("src/routes/api/check-in/status.ts", "utf8");

test("a refused scan first checks whether the same scan was already recorded", () => {
  const refuseAt = scan.indexOf("if (txResult.refused)");
  assert.ok(refuseAt > 0, "found the refusal branch");
  const branch = scan.slice(refuseAt, scan.indexOf("const scanResult = txResult.scanResult"));
  const replayAt = branch.indexOf("replayOf(scanActor, requestScanId)");
  const answerAt = branch.indexOf("status: 400");
  assert.ok(replayAt > 0, "the refusal branch must ask for the original result");
  assert.ok(replayAt < answerAt, "the original result must be checked before answering 'not recorded'");
  assert.ok(branch.indexOf("refused_scans") > replayAt, "no refused-scan note is written for a scan that was recorded");
});

test("with shifts off, the scan does not work out any shift days", () => {
  assert.match(scan, /const shiftsOn = kiosk\.shifts\.shiftsEnabled && process\.env\.SHIFTS_DISABLED !== "1"/);
  assert.match(scan, /const days = shiftsOn \? candidateShiftDays\(now, orgTimezone\) : \[\]/);
});

test("the status check logs when it falls back from shifts", () => {
  assert.ok(status.includes("status.shift_fallback"), "a fallback must leave a log line");
});
