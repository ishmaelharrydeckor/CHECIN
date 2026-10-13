import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTodayFromSummaries } from "../../src/lib/attendance-today.ts";

const TZ = "Africa/Accra";
const NOW = Date.UTC(2026, 9, 12, 11, 0); // Monday 12 October 2026, 11:00
const roster = [
  { uid: "a", displayName: "Ama" },
  { uid: "b", displayName: "Bola" },
  { uid: "c", displayName: "Chidi" },
  { uid: "d", displayName: "Dayo" },
];
const summary = (employeeId, extra = {}) => ({
  orgId: "o", managerId: "m", employeeId, employeeName: employeeId, department: "", dayKey: "2026-10-12",
  firstIn: "2026-10-12T08:00:00.000Z", lastOut: null, lastEventType: "in", lastEventAt: "2026-10-12T08:00:00.000Z",
  state: "in", openSince: "2026-10-12T08:00:00.000Z", minutesWorked: 0, eventCount: 1, late: false, earlyDeparture: false,
  schemaVersion: 1, updatedAt: "2026-10-12T08:00:00.000Z", ...extra,
});
const leave = (employeeId, startDate, endDate, status = "approved") => ({ employeeId, startDate, endDate, status });
const build = (leaves, summaries = [summary("a")]) =>
  buildTodayFromSummaries({ summaries, recentEvents: [], roster, timezone: TZ, now: NOW, ...(leaves === undefined ? {} : { leaves }) });

test("without leave data the numbers are exactly what they were before", () => {
  const before = build(undefined);
  assert.equal(before.counts.expected, 4);
  assert.equal(before.counts.onLeave, 0);
  assert.equal(before.counts.absent, 3);
  assert.deepEqual(build([]), before);
});

test("someone on approved leave today is not expected, not absent and not 'not arrived'", () => {
  const t = build([leave("b", "2026-10-12", "2026-10-14")]);
  assert.equal(t.counts.onLeave, 1);
  assert.equal(t.counts.expected, 3);
  assert.equal(t.counts.present, 1);
  assert.equal(t.counts.absent, 2);
  assert.deepEqual(t.notArrived.map((p) => p.name), ["Chidi", "Dayo"]);
});

test("leave dates are inclusive on both ends, and only today counts", () => {
  assert.equal(build([leave("b", "2026-10-12", "2026-10-12")]).counts.onLeave, 1, "one-day leave today");
  assert.equal(build([leave("b", "2026-10-01", "2026-10-12")]).counts.onLeave, 1, "last day is today");
  assert.equal(build([leave("b", "2026-10-13", "2026-10-15")]).counts.onLeave, 0, "starts tomorrow");
  assert.equal(build([leave("b", "2026-10-01", "2026-10-11")]).counts.onLeave, 0, "ended yesterday");
});

test("only approved leave counts", () => {
  for (const status of ["pending", "denied", "APPROVED"]) {
    assert.equal(build([leave("b", "2026-10-12", "2026-10-12", status)]).counts.onLeave, 0, String(status));
  }
  assert.equal(build([{ employeeId: "b", startDate: "2026-10-12", endDate: "2026-10-12" }]).counts.onLeave, 0, "no status at all");
});

test("someone on leave who scanned anyway is present, not on leave", () => {
  const t = build([leave("a", "2026-10-12", "2026-10-12")]);
  assert.equal(t.counts.onLeave, 0);
  assert.equal(t.counts.present, 1);
  assert.equal(t.counts.expected, 4);
});

test("leave for someone not on the team, or with damaged data, is ignored", () => {
  const t = build([
    leave("zzz", "2026-10-12", "2026-10-12"),
    { employeeId: "b", status: "approved" },
    { startDate: "2026-10-12", endDate: "2026-10-12", status: "approved" },
    null,
  ]);
  assert.equal(t.counts.onLeave, 0);
  assert.equal(t.counts.expected, 4);
});

test("the same person with two overlapping leave requests counts once", () => {
  const t = build([leave("b", "2026-10-10", "2026-10-13"), leave("b", "2026-10-12", "2026-10-20")]);
  assert.equal(t.counts.onLeave, 1);
  assert.equal(t.counts.expected, 3);
});

test("the numbers always add up", () => {
  const t = build([leave("b", "2026-10-12", "2026-10-12"), leave("c", "2026-10-12", "2026-10-12")]);
  const { expected, present, absent, onLeave } = t.counts;
  assert.equal(expected, present + absent);
  assert.equal(onLeave + expected, 4);
});

test("guards on the real code", () => {
  const route = readFileSync("src/routes/api/attendance/today.ts", "utf8");
  assert.ok(route.includes("loadApprovedLeaveOnDay"), "the route loads leave");
  assert.ok(route.includes("leaves: leaveResult.leaves"), "and passes it to the builder");
  assert.ok(route.includes("attendance.leave_fallback"), "a failed leave read leaves a log line instead of failing the dashboard");
  const data = readFileSync("src/lib/attendance-data.server.ts", "utf8");
  const helper = data.slice(data.indexOf("export async function loadApprovedLeaveOnDay"));
  assert.ok(helper.includes(".limit(TODAY_LEAVE_CAP)"), "the leave read is bounded");
  assert.ok(helper.includes('.where("endDate", ">=", day)'), "old leave is never read");
  const idx = JSON.parse(readFileSync("firestore.indexes.json", "utf8"))
    .indexes.filter((i) => i.collectionGroup === "leave_requests")
    .map((i) => i.fields.map((f) => f.fieldPath).join(","));
  assert.ok(idx.includes("orgId,status,endDate"), "admin index");
  assert.ok(idx.includes("orgId,managerId,status,endDate"), "manager index");
});
