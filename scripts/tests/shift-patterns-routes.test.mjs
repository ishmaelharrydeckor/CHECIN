import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source checks for the pattern routes (3.1-P6 step 2). The rules themselves are tested in
// shift-patterns.test.mjs; these make sure the routes keep the security and scale rules.
const route = readFileSync("src/routes/api/shifts/patterns.ts", "utf8");
const server = readFileSync("src/lib/shift-patterns.server.ts", "utf8");

test("every pattern handler verifies the ID token and checks revocation", () => {
  const handlers = route.match(/(GET|POST|PATCH|DELETE): async/g) ?? [];
  assert.deepEqual(handlers.sort(), ["DELETE: async", "GET: async", "PATCH: async", "POST: async"]);
  // GET verifies itself; POST, PATCH and DELETE go through authManager.
  assert.equal((route.match(/verifyCallerToken\(request\.headers\.get\("authorization"\), \{ checkRevoked: true \}\)/g) ?? []).length, 2);
  assert.ok(/async function authManager[\s\S]*?canCallerManageShifts\(caller\)/.test(route), "writes need the shift permission");
  assert.ok(/async function applyEdit[\s\S]*?authManager\(request/.test(route), "edit and end go through authManager");
  assert.ok(/POST: async[\s\S]*?authManager\(request/.test(route), "create and top-up go through authManager");
});

test("organization, role and manager come from the token, never from the request body", () => {
  for (const field of ["orgId", "managerId", "role", "createdBy"]) {
    assert.ok(!new RegExp(String.raw`body\??\.${field}\b`).test(route), `${field} must not be read from the body`);
    assert.ok(!new RegExp(String.raw`raw\.${field}\b`).test(route), `${field} must not be read from the body`);
    assert.ok(!new RegExp(String.raw`searchParams\.get\("${field}"\)`).test(route), `${field} must not come from the query`);
  }
  assert.ok(route.includes('const orgId = typeof caller?.orgId === "string" ? caller.orgId : ""'));
  assert.ok(route.includes("createdBy: caller.uid"));
});

test("a manager is limited to their own team, for create and for edit/end", () => {
  assert.ok(route.includes("checkPeople(callerFromToken(caller), orgId, employeeIds)"));
  assert.ok(/async function loadOwnPattern[\s\S]*?canAssignTo\(callerFromToken\(caller\), person\)/.test(route));
  assert.ok(server.includes("canAssignTo(caller, person)"));
  // The list for a manager is scoped by their own uid, and an employee only ever sees their own.
  assert.ok(route.includes('managerId: caller.role === "manager" ? caller.uid : undefined'));
  assert.ok(route.includes('employeeId: caller.role === "employee" ? caller.uid : filterEmployeeId || undefined'));
});

test("pattern writes are rate limited and logged", () => {
  assert.ok(route.includes("shifts_patterns_${caller.uid}"));
  assert.ok(route.includes("shifts_patterns_topup_${caller.uid}"));
  for (const action of ["shift.pattern.create", "shift.pattern.topup", "shift.pattern.edit", "shift.pattern.end"]) {
    assert.ok(route.includes(action), `${action} is logged`);
  }
});

test("the fill step is one transaction per run, bounded, and safe to repeat", () => {
  assert.ok(server.includes("export async function fillPattern("));
  assert.ok(server.includes("export async function fillDuePatterns("), "the nightly job and the Rota top-up share this");
  assert.ok(/runTransaction\(async \(tx\)/.test(server));
  assert.ok(server.includes("planFill({"), "the rules come from the tested engine");
  assert.ok(/const MAX_RUNS_PER_FILL = 2;/.test(server));
  // Assignment ids are deterministic, and pattern-written assignments carry their pattern.
  assert.ok(server.includes("assignmentId(employeeId, w.dayKey)"));
  assert.ok(/tx\.set\([\s\S]*?patternId,\n\s*\}\);/.test(server));
  // Counts are returned from the transaction body, not added inside it (a retried body would double them).
  assert.ok(!/runTransaction[\s\S]*?result\.written \+=[\s\S]*?\}\);\n\s*if \(!outcome\)/.test(server));
});

test("a retried create cannot make a second pattern", () => {
  assert.ok(route.includes("patternDocId(uid, requestId)"));
  assert.ok(/const existing = await tx\.get\(ref\);\s*if \(existing\.exists\) return;/.test(route));
});

test("trimming removes only this pattern's own days", () => {
  assert.ok(/\.where\("patternId", "==", pattern\.id\)/.test(server));
  assert.ok(server.includes("planTrim({"));
});

test("the pattern routes do not touch the scan route or the rules", () => {
  for (const src of [route, server]) {
    assert.ok(!src.includes("check-in/"), "no imports from the scan route");
    assert.ok(!src.includes("geolocation"));
  }
});
