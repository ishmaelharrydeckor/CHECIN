import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WFH_MAX_PER_REQUEST,
  addDays,
  dayCoveredByLeave,
  isDayKey,
  isWeekday,
  parseDeclareRequest,
  parseRemoveRequest,
  wfhId,
} from "../../src/lib/wfh.ts";

const TODAY = "2026-10-14"; // a Wednesday

test("one document per person per day", () => {
  assert.equal(wfhId("u1", "2026-10-14"), "u1_2026-10-14");
});

test("day keys must be real dates", () => {
  assert.ok(isDayKey("2026-10-14"));
  assert.ok(!isDayKey("2026-02-30"));
  assert.ok(!isDayKey("14/10/2026"));
  assert.ok(!isDayKey(20261014));
});

test("weekday check", () => {
  assert.ok(isWeekday("2026-10-14"));
  assert.ok(!isWeekday("2026-10-17")); // Saturday
  assert.ok(!isWeekday("2026-10-18")); // Sunday
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
});

test("declare: today and the next 30 days, weekdays only, no back-dating", () => {
  assert.ok(parseDeclareRequest({ days: [TODAY] }, TODAY).ok);
  assert.ok(parseDeclareRequest({ days: [addDays(TODAY, 30)] }, TODAY).ok === isWeekday(addDays(TODAY, 30)));
  assert.ok(!parseDeclareRequest({ days: [addDays(TODAY, -1)] }, TODAY).ok);
  assert.ok(!parseDeclareRequest({ days: [addDays(TODAY, 31)] }, TODAY).ok);
  assert.ok(!parseDeclareRequest({ days: ["2026-10-17"] }, TODAY).ok);
  assert.ok(!parseDeclareRequest({ days: [] }, TODAY).ok);
  assert.ok(!parseDeclareRequest({}, TODAY).ok);
  assert.ok(!parseDeclareRequest(null, TODAY).ok);
  assert.ok(!parseDeclareRequest({ days: ["nonsense"] }, TODAY).ok);
});

test("declare: duplicates collapse, order is sorted, the cap is enforced", () => {
  const r = parseDeclareRequest({ days: ["2026-10-16", "2026-10-15", "2026-10-15"] }, TODAY);
  assert.ok(r.ok);
  assert.deepEqual(r.value.days, ["2026-10-15", "2026-10-16"]);
  const many = Array.from({ length: WFH_MAX_PER_REQUEST + 1 }, () => TODAY);
  assert.ok(!parseDeclareRequest({ days: many }, TODAY).ok);
});

test("declare ignores any identity sent in the body", () => {
  const r = parseDeclareRequest({ days: [TODAY], employeeId: "someone-else", orgId: "other" }, TODAY);
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.value), ["days"]);
});

test("remove: only today and later; the person is optional", () => {
  const mine = parseRemoveRequest({ dayKey: TODAY }, TODAY);
  assert.ok(mine.ok && mine.value.employeeId === null);
  const theirs = parseRemoveRequest({ dayKey: "2026-10-15", employeeId: "u9" }, TODAY);
  assert.ok(theirs.ok && theirs.value.employeeId === "u9");
  assert.ok(!parseRemoveRequest({ dayKey: "2026-10-13" }, TODAY).ok);
  assert.ok(!parseRemoveRequest({ dayKey: "bad" }, TODAY).ok);
  assert.ok(!parseRemoveRequest({ dayKey: TODAY, employeeId: "" }, TODAY).ok);
  assert.ok(!parseRemoveRequest({ dayKey: TODAY, employeeId: 5 }, TODAY).ok);
});

test("leave: only approved leave blocks, and its dates are inclusive", () => {
  const approved = { status: "approved", startDate: "2026-10-15", endDate: "2026-10-16" };
  assert.equal(dayCoveredByLeave(["2026-10-14", "2026-10-16"], [approved]), "2026-10-16");
  assert.equal(dayCoveredByLeave(["2026-10-14", "2026-10-17"], [approved]), null);
  assert.equal(dayCoveredByLeave(["2026-10-15"], [{ ...approved, status: "pending" }]), null);
  assert.equal(dayCoveredByLeave(["2026-10-15"], [{ ...approved, status: "denied" }]), null);
  assert.equal(dayCoveredByLeave(["2026-10-15"], [{ status: "approved" }]), null);
});

const route = readFileSync("src/routes/api/wfh.ts", "utf8");

test("guards on the route", () => {
  assert.ok((route.match(/verifyCallerToken\(/g) ?? []).length >= 3, "every handler verifies the token");
  assert.ok(!/request\.json\(\)[^;]*\.(orgId|managerId|employeeId)\b/.test(route));
  assert.ok(route.includes("checkRateLimit"), "writes are rate limited");
  assert.ok((route.match(/logEvent\(/g) ?? []).length >= 2, "writes are logged");
  // every read is bounded
  const gets = route.match(/\.get\(\)/g) ?? [];
  const limits = route.match(/\.limit\(/g) ?? [];
  assert.ok(limits.length >= 2 && gets.length >= limits.length, "queries are bounded");
  // identity comes from the token: the target of a declare is always the caller
  assert.ok(route.includes("wfhId(caller.uid, d)"));
  // not-found and not-yours look the same
  assert.ok(route.includes("notFound"));
});

test("rule and indexes exist, and clients cannot write", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const block = rules.slice(rules.indexOf("match /wfh_days/"));
  assert.ok(/allow create, update, delete: if false;/.test(block.slice(0, 600)));
  const idx = JSON.parse(readFileSync("firestore.indexes.json", "utf8")).indexes.filter(
    (i) => i.collectionGroup === "wfh_days",
  );
  const shapes = idx.map((i) => i.fields.map((f) => f.fieldPath).join(","));
  for (const s of ["orgId,dayKey", "orgId,managerId,dayKey", "orgId,employeeId,dayKey"]) {
    assert.ok(shapes.includes(s), `index ${s}`);
  }
});

test("the screens use no GPS", () => {
  for (const f of ["src/components/wfh/MyWfhSection.tsx", "src/routes/api/wfh.ts", "src/lib/wfh.ts"]) {
    assert.ok(!/geolocation/i.test(readFileSync(f, "utf8")), f);
  }
});
