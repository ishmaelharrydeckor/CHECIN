import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source checks for the swap routes (3.1-P7 step 2). The rules themselves are tested in
// shift-swaps.test.mjs; these make sure the route keeps the security and scale rules.
const route = readFileSync("src/routes/api/shifts/swaps.ts", "utf8");
const server = readFileSync("src/lib/shift-swaps.server.ts", "utf8");

test("every swap handler verifies the ID token, with revocation, through one function", () => {
  const handlers = route.match(/(GET|POST|PUT|PATCH|DELETE): async/g) ?? [];
  assert.deepEqual(handlers.sort(), ["GET: async", "POST: async", "PUT: async"]);
  assert.equal((route.match(/verifyCallerToken\(/g) ?? []).length, 1);
  assert.ok(route.includes('verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true })'));
  assert.equal((route.match(/await authCaller\(request\)/g) ?? []).length, 3, "GET, POST and PUT all authenticate");
});

test("the proposer, organization, role and managers come from the token and claims, never the body", () => {
  for (const field of ["orgId", "proposerId", "managerId", "role", "status", "decidedBy"]) {
    assert.ok(!new RegExp(String.raw`(body|b|rest)\??\.${field}\b`).test(route), `${field} must not be read from the request`);
  }
  assert.ok(route.includes("loadClaimedPeople(orgId, [caller.uid, colleagueId])"));
  assert.ok(route.includes("proposerManagerId: people.get(swap.proposerId)?.managerId ?? null"), "managers are re-read from claims");
  assert.ok(route.includes("const managers = managersNow(stored, people);"), "at decision time");
  assert.ok(server.includes("claims.orgId !== orgId"), "people outside the organization are ignored");
});

test("every move is decided by the tested rules inside the transaction, on the freshly read swap", () => {
  assert.ok(/runTransaction\(async \(tx\) => \{\s*const snap = await tx\.get\(ref\);/.test(route));
  assert.ok(route.includes("decideSwapAction(fresh, me, action)"));
  assert.ok(route.includes("const fresh = currentParties(partiesOf(data), managers);"));
});

test("approval re-checks everything inside the transaction and swaps both documents there", () => {
  const approve = route.slice(route.indexOf('if (action === "approve") {'));
  assert.ok(approve.includes("tx.getAll(pRef, cRef, pSum, cSum)"));
  assert.ok(approve.includes("tx.get(leaveQuery(fresh.proposerId))"));
  assert.ok(approve.includes("shiftsStillAsProposed("), "a swap whose shifts changed is refused");
  assert.ok(approve.includes("checkSwapEligibility("), "leave, holiday and attendance are checked again");
  assert.ok(approve.includes("swapAssignments("));
  assert.ok(approve.includes("tx.set(pRef, swapped.value.proposer)") && approve.includes("tx.set(cRef, swapped.value.colleague)"));
});

test("writes are rate limited and logged; the switch is admin only", () => {
  for (const key of ["shift_swaps_propose_", "shift_swaps_act_", "shift_swaps_settings_"]) assert.ok(route.includes(key), key);
  assert.ok(route.includes('action: "shift.swap.propose"'));
  assert.ok(route.includes("action: `shift.swap.${action}`"));
  assert.ok(route.includes('action: "shift.swap.settings"'));
  assert.ok(/caller\.role !== "org_admin"\) return refuse\(403, "Only an organization admin can switch shift swaps/.test(route));
});

test("a retried proposal cannot make a second swap, and one person cannot have two open swaps for a day", () => {
  assert.ok(route.includes("swapDocId(caller.uid, dayKey, requestId)"));
  assert.ok(/const existing = await tx\.get\(ref\);\s*if \(!existing\.exists\) tx\.set\(ref, doc\);/.test(route));
  assert.ok(route.includes("One of you already has a swap waiting for that day"));
});

test("swaps are off unless the organization switched them on", () => {
  assert.ok(route.includes("if (!org.swapsEnabled) return refuse(403"));
  assert.ok(route.includes('(action === "accept" || action === "approve") && !org.swapsEnabled'));
});

test("the swap routes do not touch the scan route or use location", () => {
  for (const src of [route, server]) {
    assert.ok(!src.includes("check-in/"));
    assert.ok(!src.includes("geolocation"));
  }
});

test("who may see and decide an open swap follows each person's manager now, in the list and the actions", () => {
  const start = route.indexOf("async function act(");
  const act = route.slice(start, route.indexOf("runTransaction", start));
  assert.ok(act.includes("if (!canSeeSwap(currentParties(stored, managers), me)) return refuse(404"), "visibility uses the fresh managers");
  assert.ok(!act.includes("canSeeSwap(partiesOf("), "never the stored managers alone");
  assert.ok(route.includes("managerIds: swapManagerIds(managers.proposerManagerId, managers.colleagueManagerId)"), "each move stores the managers it was decided under");
  const list = route.slice(route.indexOf("GET: async"), route.indexOf("POST: async"));
  assert.ok(list.includes('base.where("status", "in", ["pending", "accepted"]).orderBy("createdAt", "desc").limit(SWAP_LIST_CAP)'), "a new manager finds open swaps not yet under their id");
  assert.ok(list.includes("currentParties(stored, managersNow(stored, people))"));
});

test("the colleague picker lists only the caller's own team, from their claims, bounded, and only while swaps are on", () => {
  const fn = route.slice(route.indexOf("async function candidates("), route.indexOf("export const Route"));
  assert.ok(fn.includes('caller.role !== "employee" && caller.role !== "manager"'));
  assert.ok(fn.includes("if (!org.swapsEnabled) return refuse(403"));
  assert.ok(fn.includes("parseCandidatesDay(rawDay, org.today)"), "no past days");
  assert.ok(fn.includes("caller.managerId"), "the team comes from the verified claims");
  assert.ok(!/searchParams\.get\("(managerId|orgId|uid|team)"\)/.test(route), "never from the query string");
  assert.ok(fn.includes('.where("managerId", "==", team)') && fn.includes(".limit(200)"));
  assert.ok(fn.includes("swapCandidatesFrom("));
});

test("the manager's open-swaps query (status in, newest first) has the index it needs", async () => {
  const { readFileSync } = await import("node:fs");
  const indexes = JSON.parse(readFileSync("firestore.indexes.json", "utf8")).indexes;
  const has = indexes.some(
    (i) =>
      i.collectionGroup === "shift_swaps" &&
      i.fields.map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(",") === "orgId:ASCENDING,status:ASCENDING,createdAt:DESCENDING",
  );
  assert.ok(has, "without this index a manager's swap list fails with a 500");
});
