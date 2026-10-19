import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summaryFromEvents, nextTypeFromSummary } from "../../src/lib/daily-summary.ts";
import { describeRecordedOutside } from "../../src/lib/shift-scan.ts";
import { classifyScan } from "../../src/lib/shift-lenient.ts";

// Lenient mode (shifts phase 3b): a scan outside the allowed time is RECORDED but NEVER COUNTED.
// It must not start or end a shift, change the direction of the next scan, or add hours.
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const scan = read("src/routes/api/check-in/scan.ts");
const lenientBranch = scan.slice(scan.indexOf("const recorded = classifyLenientScan"), scan.indexOf("// Both modes leave one short note"));

const identity = { orgId: "o", managerId: "m", employeeId: "e", employeeName: "Efua", department: "Ops", dayKey: "2026-10-19" };
const NOW = "2026-10-19T20:00:00.000Z";
const day = [
  { type: "in", timestamp: "2026-10-19T08:00:00.000Z" },
  { type: "out", timestamp: "2026-10-19T16:00:00.000Z" },
];
const outside = { type: "in", timestamp: "2026-10-19T18:30:00.000Z", outsideWindow: true };

// ---------------------------------------------------------------- the numbers cannot change
test("an uncounted scan changes nothing about the day: same summary, same hours, same next direction", () => {
  const without = summaryFromEvents(day, identity, NOW);
  const withOutside = summaryFromEvents([...day, outside], identity, NOW);
  assert.deepEqual(withOutside, without);
  assert.equal(nextTypeFromSummary(withOutside), nextTypeFromSummary(without));
  assert.equal(withOutside.lastEventAt, without.lastEventAt, "it is not the 'latest scan', so the cooldown is unaffected");
});

test("a day with only an uncounted scan has no summary at all (the person is not present)", () => {
  assert.equal(summaryFromEvents([outside], identity, NOW), null);
});

test("an uncounted scan cannot start or end a shift, whatever its direction", () => {
  const asOut = { ...outside, type: "out", timestamp: "2026-10-19T23:00:00.000Z" };
  const s = summaryFromEvents([day[0], asOut], identity, NOW);
  assert.equal(s.lastOut, null, "an uncounted out does not end the day");
  assert.equal(s.state, "in", "still on shift");
});

// ---------------------------------------------------------------- what the rules decide
test("Strict refuses, Lenient records, and both leave a note", () => {
  assert.deepEqual(classifyScan({ mode: "strict", insideWindow: false }), { record: false, counted: false, note: true });
  assert.deepEqual(classifyScan({ mode: "lenient", insideWindow: false }), { record: true, counted: false, note: true });
  assert.deepEqual(classifyScan({ mode: "lenient", insideWindow: true }), { record: true, counted: true, note: false });
  assert.deepEqual(classifyScan({ mode: undefined, insideWindow: false }), { record: false, counted: false, note: true }, "no setting means Strict");
});

test("the phone is told plainly that the scan was recorded but does not count", () => {
  const early = describeRecordedOutside({ reason: "too_early", shift: { start: "22:00", end: "06:00" } });
  assert.match(early, /shift starts at 22:00/);
  assert.match(early, /recorded, but it does not count toward your hours/);
  const late = describeRecordedOutside({ reason: "too_late", shift: { start: "22:00", end: "06:00" } });
  assert.match(late, /shift ended at 06:00/);
  assert.match(late, /speak to your manager/);
  assert.doesNotMatch(describeRecordedOutside({ reason: "too_early", shift: { start: null, end: null } }), /null/, "a flexible shift has no times to name");
  assert.doesNotMatch(describeRecordedOutside({ reason: "too_late", shift: { start: null, end: null } }), /null/);
});

// ---------------------------------------------------------------- the scan route
test("the Lenient branch writes the event and the note, and never touches the daily summary", () => {
  assert.ok(lenientBranch.length > 500, "the Lenient branch is in the scan route");
  for (const forbidden of ["activeSummaryRef", "summaryRef", "daily_summaries", "applyEventToSummary", "summaryBefore", "t.set", "publishScanNote"]) {
    assert.ok(!lenientBranch.includes(forbidden), `the Lenient branch must not use ${forbidden}`);
  }
  assert.ok(lenientBranch.includes("outsideWindow: true"), "the event carries the marker every reader checks");
  assert.ok(lenientBranch.includes("late: false") && lenientBranch.includes("earlyDeparture: false"), "no late or early judgement");
  assert.ok(lenientBranch.includes("undoSeconds: 0"), "nothing counted, so nothing to undo");
  assert.ok(lenientBranch.includes("await eventRef.create(eventData)"), "created once per scanId, so a retry cannot duplicate it");
});

test("Lenient scans are rate limited, because they do not hit the summary's cooldown", () => {
  assert.ok(lenientBranch.includes("checkRateLimit(`lenient_outside_${caller.uid}`"));
  assert.ok(lenientBranch.includes("status: 429"));
});

test("the transaction that decides a refusal still writes nothing", () => {
  const tx = scan.slice(scan.indexOf("runTransaction"), scan.indexOf("if (txResult.refused)"));
  const refusedReturn = tx.slice(tx.indexOf('if (plan.kind === "refuse")'), tx.indexOf("prev = plan.kind"));
  assert.ok(refusedReturn.includes("refused: true") && !/t\.(set|create|update|delete)/.test(refusedReturn));
});

test("Strict is unchanged: it answers 400 with the reason and records nothing", () => {
  assert.ok(scan.includes("return Response.json({ error: plan.message }, { status: 400 });"));
  assert.ok(scan.includes('action: recorded ? "scan.outside_window" : "scan.refused"'));
});

test("the note says whether the scan was kept, and a retry of a Lenient scan gets its original answer", () => {
  assert.ok(scan.includes("recorded,\n"), "the note stores `recorded`");
  const replay = scan.slice(scan.indexOf("async function replayOf"));
  assert.ok(replay.includes("e.outsideWindow === true") && replay.includes("describeRecordedOutside"));
});

// ---------------------------------------------------------------- every reader ignores the record
test("everything that rebuilds or lists counted events skips Lenient records", () => {
  assert.ok(scan.includes("if (e.outsideWindow === true) continue;"), "the rollout fallback rebuild");
  assert.ok(read("src/lib/attendance-data.server.ts").includes("if (d.outsideWindow === true) continue;"), "Today, week and register event lists");
  assert.ok(read("scripts/backfill-summaries.mjs").includes("e.voidedAt || e.outsideWindow === true"), "the summary rebuild script");
  const status = read("src/routes/api/check-in/status.ts");
  assert.ok(status.includes("d.data().outsideWindow !== true"), "the status fallback ignores them");
});

test("an uncounted check-in cannot be undone", () => {
  const undo = read("src/routes/api/check-in/undo.ts");
  assert.ok(undo.includes("e.outsideWindow === true") && undo.includes("recorded outside your shift"));
});

// ---------------------------------------------------------------- what people see
test("History marks the record, so nobody thinks it counted", () => {
  assert.ok(read("src/routes/api/attendance/history.ts").includes("outsideWindow: d.outsideWindow === true"));
  assert.ok(read("src/routes/_authenticated/history.tsx").includes("Outside shift, not counted"));
});

test("the Refused check-ins list shows whether each scan was turned away or kept", () => {
  assert.ok(read("src/routes/api/shifts/refused-scans.ts").includes("recorded: x.recorded === true"));
  const tab = read("src/components/shifts/RefusedScansTab.tsx");
  assert.ok(tab.includes("Recorded, not counted") && tab.includes("Turned away"));
});

test("the admin can choose Lenient, and the choice is saved through the existing settings route", () => {
  const card = read("src/components/shifts/ShiftSettingsCard.tsx");
  assert.ok(!card.includes("Coming soon"), "no longer a placeholder");
  assert.ok(card.includes('value={settings?.shiftScanMode ?? "strict"}') && card.includes("saveMode("));
  assert.ok(!/id="mode-lenient"[^>]*disabled/.test(card), "the Lenient option is not disabled");
  assert.ok(card.replace(/\s+/g, " ").includes("it does not count"), "it says plainly what Lenient means");
});

test("the phone shows a distinct message and leaves the in/out status alone", () => {
  const overlay = read("src/components/scan/ScanResultOverlay.tsx");
  assert.ok(overlay.includes('kind: "outside"') && overlay.includes("Recorded outside your shift"));
  const page = read("src/routes/scan.tsx");
  const branch = page.slice(page.indexOf("if (data.outsideWindow === true)"), page.indexOf("const isCheckIn = data.type"));
  assert.ok(branch.includes('kind: "outside"') && branch.includes("return;"));
  assert.ok(!branch.includes("setStatus(") && !branch.includes("setLastScanTime(") && !branch.includes("setUndoState("), "status, last scan time and undo are untouched");
});

test("the placeholder from before Lenient was built is gone", () => {
  assert.ok(!scan.includes("lenientNotYet"));
});
