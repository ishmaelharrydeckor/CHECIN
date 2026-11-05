import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DEPARTMENT,
  MAX_DEPARTMENTS,
  MAX_DEPARTMENT_NAME,
  buildDepartmentList,
  cleanDepartmentName,
  departmentsInUse,
  matchDepartment,
  storedDepartments,
} from "../../src/lib/departments.ts";

test("names are tidied: trimmed, single spaces, no control characters", () => {
  assert.equal(cleanDepartmentName("  Human   Resources "), "Human Resources");
  assert.equal(cleanDepartmentName("Fin\u0000ance\n"), "Fin ance");
  assert.equal(cleanDepartmentName(42), "");
  assert.equal(cleanDepartmentName(null), "");
});

test("the list always starts with General, even when the admin sent nothing", () => {
  assert.deepEqual(buildDepartmentList([]), { ok: true, list: ["General"] });
  assert.deepEqual(buildDepartmentList(["Finance", "Sales"]), { ok: true, list: ["General", "Finance", "Sales"] });
});

test("duplicates are dropped ignoring upper and lower case, the first spelling wins", () => {
  const r = buildDepartmentList(["Finance", "finance", "FINANCE ", "general", "Sales"]);
  assert.deepEqual(r, { ok: true, list: ["General", "Finance", "Sales"] });
});

test("blank rows are ignored", () => {
  assert.deepEqual(buildDepartmentList(["", "   ", "IT"]), { ok: true, list: ["General", "IT"] });
});

test("something that is not a list is refused", () => {
  assert.equal(buildDepartmentList("Finance").ok, false);
  assert.equal(buildDepartmentList(undefined).ok, false);
  assert.equal(buildDepartmentList({ 0: "Finance" }).ok, false);
});

test("a name that is too long is refused, not cut", () => {
  const long = "x".repeat(MAX_DEPARTMENT_NAME + 1);
  const r = buildDepartmentList(["Finance", long]);
  assert.equal(r.ok, false);
  assert.match(r.error, /at most 40 characters/);
  assert.equal(buildDepartmentList(["y".repeat(MAX_DEPARTMENT_NAME)]).ok, true);
});

test("at most 30 departments including General", () => {
  const ok = Array.from({ length: MAX_DEPARTMENTS - 1 }, (_, i) => `Dept ${i}`);
  assert.equal(buildDepartmentList(ok).ok, true);
  const tooMany = [...ok, "One more"];
  const r = buildDepartmentList(tooMany);
  assert.equal(r.ok, false);
  assert.match(r.error, /at most 30 departments/);
});

test("matching ignores upper and lower case and returns the list's own spelling", () => {
  const list = ["General", "Human Resources"];
  assert.equal(matchDepartment(list, "human  resources"), "Human Resources");
  assert.equal(matchDepartment(list, "Marketing"), null);
  assert.equal(matchDepartment(list, ""), null);
  assert.equal(matchDepartment(list, undefined), null);
});

test("a missing or damaged saved list falls back to General only", () => {
  assert.deepEqual(storedDepartments(undefined), ["General"]);
  assert.deepEqual(storedDepartments("nope"), ["General"]);
  assert.deepEqual(storedDepartments(["General", "Sales"]), ["General", "Sales"]);
});

test("an older organization's list is built from the departments people already have", () => {
  const list = departmentsInUse(["Operations", "operations", "Finance", "", undefined, "General", "x".repeat(60)]);
  assert.deepEqual(list, ["General", "Operations", "Finance"]);
  assert.equal(list[0], DEFAULT_DEPARTMENT);
});

test("an older organization with too many distinct names keeps the first ones that fit", () => {
  const many = Array.from({ length: 80 }, (_, i) => `Team ${i}`);
  const list = departmentsInUse(many);
  assert.equal(list.length, MAX_DEPARTMENTS);
  assert.equal(list[0], "General");
});

// ---------------------------------------------------------------- guards on the real code
import { readFileSync } from "node:fs";

test("the rules do not let a person write their own department", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const block = rules.slice(rules.indexOf("match /users/{userId}"), rules.indexOf("match /locations/{locationId}"));
  assert.ok(block.includes("hasOnly"), "found the users rule");
  assert.ok(!block.includes('"department"'), "department must not be in what a person may write");
});

test("redeeming an invite never takes the department from the person redeeming it", () => {
  const src = readFileSync("src/routes/api/admin/staff-invites.ts", "utf8");
  const redeem = src.slice(src.indexOf("PUT: async"));
  assert.ok(redeem.length > 500, "found the redeem handler");
  assert.ok(!redeem.includes("body?.department"), "the redeem handler must ignore any department sent by the invitee");
});
