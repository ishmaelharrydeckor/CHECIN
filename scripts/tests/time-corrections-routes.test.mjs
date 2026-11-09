import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyEventToSummary, summaryFromEvents } from "../../src/lib/daily-summary.ts";
import { applyCorrections, decideCorrection } from "../../src/lib/time-corrections.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const route = read("src/routes/api/corrections.ts");

// ---- the route and the rebuild agree -----------------------------------------------------------------------------

const DAY = "2026-11-02";
const IN = `${DAY}T08:00:00.000Z`;
const identity = { orgId: "orgA", managerId: "m1", employeeId: "e1", employeeName: "Ama", department: "Ops", dayKey: DAY };
const NOW = "2026-11-04T09:00:00.000Z";
const approved = {
  id: `e1_${DAY}_1`, orgId: "orgA", employeeId: "e1", managerId: "m1", dayKey: DAY, proposedAt: `${DAY}T17:00:00.000Z`,
  reason: "Forgot to scan out", status: "approved", requestedBy: "e1", requestedAt: "2026-11-03T08:00:00.000Z", decidedBy: "m1", decidedAt: NOW,
};

test("approving one correction in place gives exactly the day that rebuilding from the scans and the correction gives", () => {
  // What the scan route stored when the person checked in...
  const stored = applyEventToSummary(null, { type: "in", timestamp: IN, late: true }, identity, IN);
  // ...what the approve route writes (the same function the scan route uses)...
  const inPlace = applyEventToSummary(stored, { type: "out", timestamp: approved.proposedAt, earlyDeparture: false }, stored, NOW);
  // ...and what the backfill script would rebuild later.
  const rebuilt = summaryFromEvents(applyCorrections([{ type: "in", timestamp: IN, late: true }], [approved]).events, identity, NOW);
  const strip = ({ updatedAt, ...rest }) => rest;
  assert.deepEqual(strip(inPlace), strip(rebuilt));
  assert.equal(inPlace.minutesWorked, 540);
  assert.equal(inPlace.state, "out");
  assert.equal(inPlace.late, true, "the real check-in's late flag is kept");
  assert.equal(inPlace.earlyDeparture, false);
});

test("the person who asked cannot be the one who approves, so the route can never write an unapproved change", () => {
  const pending = { ...approved, status: "pending", decidedBy: null, decidedAt: null };
  assert.equal(decideCorrection(pending, "approve", { uid: "e1", role: "employee", orgId: "orgA" }, NOW).ok, false);
  assert.equal(decideCorrection({ ...pending, requestedBy: "m1" }, "approve", { uid: "m1", role: "manager", orgId: "orgA" }, NOW).ok, false);
  assert.equal(decideCorrection(pending, "approve", { uid: "m1", role: "manager", orgId: "orgA" }, NOW).ok, true);
});

// ---- who is asking ------------------------------------------------------------------------------------------------------

test("the caller, role, organization and team come from the verified token, with revocation checked", () => {
  assert.ok(route.includes('verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true })'));
  assert.ok(route.includes('role !== "org_admin" && role !== "manager" && role !== "employee"'));
  assert.ok(route.includes("verified.managerId"));
});

test("nothing identity-related is read from the request body", () => {
  const body = route.slice(route.indexOf("const b = body as Record<string, unknown>;"));
  assert.ok(!/b\.(orgId|role|managerId|requestedBy|decidedBy|status)\b/.test(body), "no organization, role, team or actor from the request");
  const named = [...body.matchAll(/\bb\.([A-Za-z]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(named)].sort(), ["action", "dayKey", "decision", "employeeId", "id", "proposedAt", "reason"]);
});

test("a person named in the request is checked to be in the caller's scope before anything happens", () => {
  assert.ok(route.includes("resolveTargetInScope(caller, wanted)"));
  assert.ok(route.includes("canRequestCorrection(caller, person)"));
  assert.ok(route.indexOf("canRequestCorrection(caller, person)") < route.indexOf("runTransaction"));
  assert.ok(route.includes('wanted.includes("/")'), "a path cannot be smuggled in as an id");
});

test("another organization's correction looks like it does not exist", () => {
  const notFound = route.match(/c\.orgId !== caller\.orgId\) throw new Refused\(404, "Correction not found\."\)/g) ?? [];
  assert.equal(notFound.length, 2, "decide and cancel both answer 404 for another organization");
  assert.ok(route.includes("const ID_RE = /^[A-Za-z0-9_-]{3,200}$/;"));
});

test("an employee cannot see the review list, and a manager only sees their own team's", () => {
  const review = route.slice(route.indexOf('if (which === "review")'), route.indexOf('return Response.json({ error: "Choose mine or review."'));
  assert.ok(review.includes('caller.role === "employee"'));
  assert.ok(review.includes('caller.role === "manager") q = q.where("managerId", "==", caller.uid)'));
  assert.ok(review.includes("pendingToDecide("), "and never what they asked for themselves");
});

// ---- what it writes -------------------------------------------------------------------------------------------------------

test("the scans are never touched, and the day's summary is written only when a correction is approved", () => {
  assert.ok(!route.includes('collection("clock_events")'), "clock_events is never read or written here");
  assert.equal((route.match(/t\.set\(summaryRef/g) ?? []).length, 1);
  const approveBranch = route.slice(route.indexOf('r.correction.status === "approved"'), route.indexOf("t.update(ref, { status: r.correction.status, decidedBy: r.correction.decidedBy, decidedAt: r.correction.decidedAt });\n              return r.correction;\n            });\n            logEvent({ action: \"correction.decide\""));
  assert.ok(approveBranch.includes("t.set(summaryRef"));
  assert.ok(approveBranch.includes('prev.state !== "in"'), "only a day that still has an open check-in");
  assert.ok(approveBranch.includes("Date.parse(c.proposedAt) <= Date.parse(prev.openSince)"));
  assert.ok(approveBranch.includes("applyEventToSummary("), "the same function the scan route uses");
});

test("every change is one transaction, reads before writes, so a retry or two people at once cannot make a mess", () => {
  const transactions = route.split("runTransaction").length - 1;
  assert.equal(transactions, 3, "ask, decide and withdraw");
  for (const part of route.split("runTransaction").slice(1)) {
    const block = part.slice(0, part.indexOf("logEvent(") === -1 ? undefined : part.indexOf("logEvent("));
    const lastRead = Math.max(block.lastIndexOf("t.get("));
    const firstWrite = [block.indexOf("t.create("), block.indexOf("t.set("), block.indexOf("t.update(")].filter((i) => i >= 0).sort((a, b) => a - b)[0];
    assert.ok(lastRead >= 0 && firstWrite >= 0 && lastRead < firstWrite, "all reads come before the first write");
  }
});

test("asking is checked on the server with the day's real summary, not on anything the browser says about it", () => {
  const ask = route.slice(route.indexOf('b.action === "request"'), route.indexOf('const id = typeof b.id'));
  assert.ok(ask.includes("summaryDocId(person.uid, dayKey)"));
  assert.ok(ask.includes('summary.state === "in" && typeof summary.openSince === "string"'));
  assert.ok(ask.includes("validateCorrectionRequest({"));
  assert.ok(ask.includes("nowMs: Date.now()"), "the server's clock, never the browser's");
  assert.ok(ask.includes("nextCorrectionId("));
  assert.ok(ask.includes("t.create("), "create, so a double submit cannot overwrite");
  assert.ok(ask.includes("The manager on that day's summary") || ask.includes("summary.managerId"));
});

test("limits and logs: attempts are limited, and each change leaves one line without names or reasons", () => {
  assert.ok(route.includes("checkRateLimit(`corrections_${caller.uid}`"));
  for (const action of ["correction.request", "correction.decide", "correction.cancel"]) assert.ok(route.includes(`action: "${action}"`), action);
  const lines = [...route.matchAll(/logEvent\(\{[^}]*\}[^)]*\)/g)].map((m) => m[0]).join("\n");
  assert.ok(!/reason|employeeName|email/.test(lines.replace(/fields: \{[^}]*\}/g, "")), "no personal text in the log");
  assert.ok(!/fields: \{[^}]*(reason|proposedAt)/.test(lines), "the reason and times stay out of the log");
});

test("the lists are bounded and start with the organization", () => {
  for (const q of ['.where("orgId", "==", caller.orgId)']) assert.ok(route.includes(q));
  const limits = route.match(/\.limit\((LIST_LIMIT|REVIEW_LIMIT|SAME_DAY_LIMIT)\)/g) ?? [];
  assert.equal(limits.length, 3);
  assert.ok(route.includes("const LIST_LIMIT = 50;"));
});

test("errors reach the person only as the route's own plain refusals", () => {
  assert.ok(route.includes("if (err instanceof Refused)"));
  assert.ok(route.includes('error: "Could not update the correction."'));
});

// ---- the data: rules, indexes, rebuild ---------------------------------------------------------------------------------------

test("the rules let the person, their manager and org admins read, and nobody write from a browser", () => {
  const rules = read("firestore.rules");
  const block = rules.slice(rules.indexOf("match /time_corrections/{correctionId}"));
  assert.match(block, /inOrg\(resource\.data\)/);
  assert.match(block, /isManager\(\) && resource\.data\.managerId == request\.auth\.uid/);
  assert.match(block, /resource\.data\.employeeId == request\.auth\.uid/);
  assert.match(block, /allow create, update, delete: if false;/);
  assert.ok(rules.indexOf("match /time_corrections/") < rules.indexOf("match /{document=**}"), "before the catch-all");
});

test("each list has its index", () => {
  const idx = JSON.parse(read("firestore.indexes.json")).indexes.filter((i) => i.collectionGroup === "time_corrections");
  const shape = idx.map((i) => i.fields.map((f) => `${f.fieldPath}:${f.order}`).join(","));
  assert.deepEqual(shape.sort(), [
    "orgId:ASCENDING,employeeId:ASCENDING,dayKey:DESCENDING",
    "orgId:ASCENDING,managerId:ASCENDING,status:ASCENDING,requestedAt:DESCENDING",
    "orgId:ASCENDING,status:ASCENDING,requestedAt:DESCENDING",
  ].sort());
});

test("rebuilding summaries from the scans (the backfill script) keeps approved corrections", () => {
  const script = read("scripts/backfill-summaries.mjs");
  assert.ok(script.includes('import { applyCorrections } from "../src/lib/time-corrections.ts";'));
  assert.ok(script.includes('.collection("time_corrections")'));
  assert.ok(script.includes("applyCorrections(events,"));
  assert.ok(script.indexOf("applyCorrections(events,") < script.indexOf("summaryFromEvents(corrected.events"));
  assert.ok(script.includes("summary.correctedBy = corrected.applied[0]"));
});

test("a correction is not gated by a plan: fixing a missed check-out is core to being paid right", () => {
  assert.ok(!route.includes("gateFeature"));
});
