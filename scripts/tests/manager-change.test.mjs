import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planManagerMove, peopleLeftBehind, MAX_FUTURE_SHIFTS_MOVED, MAX_PENDING_LEAVE_MOVED } from "../../src/lib/manager-change.ts";

const ORG = "org-1";
const employee = { role: "employee", orgId: ORG, managerId: "mgr-a" };
const manager = { role: "manager", orgId: ORG, managerId: "mgr-b" };

const move = (over = {}) =>
  planManagerMove({
    callerOrgId: ORG,
    targetUid: "emp-1",
    target: employee,
    newManagerUid: "mgr-b",
    newManager: manager,
    ...over,
  });

test("an employee can be moved to another manager in the same organization", () => {
  assert.deepEqual(move(), { ok: true });
});

test("an organization admin can be the new manager", () => {
  assert.deepEqual(move({ newManagerUid: "admin-1", newManager: { role: "org_admin", orgId: ORG, managerId: "admin-1" } }), {
    ok: true,
  });
});

test("a person or manager must be chosen", () => {
  assert.equal(move({ targetUid: "" }).status, 400);
  assert.equal(move({ newManagerUid: "" }).status, 400);
});

test("a person from another organization looks the same as one that does not exist", () => {
  const unknown = move({ target: null });
  const elsewhere = move({ target: { ...employee, orgId: "org-2" } });
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown, elsewhere);
});

test("managers and admins cannot be moved: only employees", () => {
  assert.equal(move({ target: manager }).status, 400);
  assert.equal(move({ target: { role: "org_admin", orgId: ORG, managerId: "x" } }).status, 400);
});

test("the new manager must exist in the same organization", () => {
  assert.equal(move({ newManager: null }).status, 400);
  assert.equal(move({ newManager: { ...manager, orgId: "org-2" } }).status, 400);
});

test("the new manager cannot be an employee", () => {
  const r = move({ newManager: { role: "employee", orgId: ORG, managerId: "mgr-a" } });
  assert.equal(r.ok, false);
  assert.match(r.error, /not an employee/);
});

test("nobody is their own manager", () => {
  const r = move({ newManagerUid: "emp-1", newManager: { role: "manager", orgId: ORG, managerId: "emp-1" } });
  assert.equal(r.ok, false);
  assert.match(r.error, /own manager/);
});

test("moving someone to the team they are already on is refused", () => {
  const r = move({ target: { ...employee, managerId: "mgr-b" } });
  assert.equal(r.ok, false);
  assert.match(r.error, /already on this team/);
});

test("a manager is not left alone in their own team count", () => {
  assert.deepEqual(peopleLeftBehind(["mgr-a"], "mgr-a"), []);
  assert.deepEqual(peopleLeftBehind(["mgr-a", "emp-1", "emp-2"], "mgr-a"), ["emp-1", "emp-2"]);
});

// ---------------------------------------------------------------- guards on the real code
test("only the move action and the roles route change who someone reports to, and both keep the roster copy in step", () => {
  const move = readFileSync("src/routes/api/organization/member-manager.ts", "utf8");
  for (const needle of ["setStaffRoleClaims", "team_changes", "managerChangedAt", "leave_requests", "revokeUserSessions"]) {
    assert.ok(move.includes(needle), `the move action must handle ${needle}`);
  }
  const roles = readFileSync("src/routes/api/admin/roles.ts", "utf8");
  assert.ok(roles.includes("peopleLeftBehind"), "demoting a manager must check their team first");
  assert.ok(roles.includes('collection("users")'), "the roles route must keep the roster copy in step");
});

test("the move history is written by the server only", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const start = rules.indexOf("match /team_changes/");
  assert.ok(start > 0, "found the team_changes rule");
  const block = rules.slice(start, rules.indexOf("}", rules.indexOf("}", start) + 1));
  assert.ok(block.includes("allow create, update, delete: if false"), "no client may write team_changes");
});

test("shifts from today onwards follow the person, and everything still fits one batch of 500 writes", () => {
  assert.ok(1 + MAX_PENDING_LEAVE_MOVED + MAX_FUTURE_SHIFTS_MOVED + 1 <= 500, "profile + leave + shifts + history must fit one batch");
  const src = readFileSync("src/routes/api/organization/member-manager.ts", "utf8");
  assert.ok(src.includes('collection("shift_assignments")'), "the move reads the person's shift assignments");
  assert.ok(src.includes('.where("dayKey", ">=", today)'), "only shifts from today onwards move; past shifts stay");
  assert.ok(src.includes("for (const doc of futureShifts.docs) batch.update(doc.ref, { managerId: newManagerUid })"), "they are re-pointed in the same batch");
  assert.ok(src.includes("futureShiftsMoved: futureShifts.size"), "the history record says how many moved");
});
