import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDashboardScope } from "../../src/lib/dashboard-scope.ts";
import { createTtlCache } from "../../src/lib/ttl-cache.server.ts";

test("resolveDashboardScope: org admin sees the whole organization", () => {
  assert.deepEqual(resolveDashboardScope({ uid: "u1", role: "org_admin", orgId: "o1" }), {
    uid: "u1",
    role: "org_admin",
    orgId: "o1",
  });
});

test("resolveDashboardScope: manager is scoped to their own uid", () => {
  assert.deepEqual(resolveDashboardScope({ uid: "m1", role: "manager", orgId: "o1" }), {
    uid: "m1",
    role: "manager",
    orgId: "o1",
  });
});

test("resolveDashboardScope: employees and unknown roles are refused", () => {
  assert.equal(resolveDashboardScope({ uid: "e1", role: "employee", orgId: "o1" }), null);
  assert.equal(resolveDashboardScope({ uid: "e1", role: "superuser", orgId: "o1" }), null);
  assert.equal(resolveDashboardScope({ uid: "e1", role: undefined, orgId: "o1" }), null);
  assert.equal(resolveDashboardScope({ uid: "e1", role: null, orgId: "o1" }), null);
  assert.equal(resolveDashboardScope({ uid: "e1", role: "ORG_ADMIN", orgId: "o1" }), null); // case-sensitive
});

test("resolveDashboardScope: no organization or no uid means no access", () => {
  assert.equal(resolveDashboardScope({ uid: "a", role: "org_admin" }), null);
  assert.equal(resolveDashboardScope({ uid: "a", role: "org_admin", orgId: "" }), null);
  assert.equal(resolveDashboardScope({ uid: "a", role: "org_admin", orgId: 42 }), null);
  assert.equal(resolveDashboardScope({ role: "org_admin", orgId: "o1" }), null);
  assert.equal(resolveDashboardScope({ uid: "", role: "manager", orgId: "o1" }), null);
  assert.equal(resolveDashboardScope({}), null);
});

test("resolveDashboardScope: the scope can never be widened by extra fields", () => {
  // Extra properties a hostile caller might add are ignored; only the three claims matter.
  const s = resolveDashboardScope({ uid: "m1", role: "manager", orgId: "o1", managerId: "someone-else", isAdmin: true });
  assert.deepEqual(s, { uid: "m1", role: "manager", orgId: "o1" });
});

test("ttl cache: hit, expiry, overwrite, delete, size bound", () => {
  const c = createTtlCache(1000, 3);
  assert.equal(c.get("a", 0), undefined);
  c.set("a", 1, 0);
  assert.equal(c.get("a", 999), 1);
  assert.equal(c.get("a", 1001), undefined); // expired
  c.set("a", 2, 2000);
  assert.equal(c.get("a", 2500), 2);
  c.delete("a");
  assert.equal(c.get("a", 2500), undefined);

  c.clear();
  c.set("a", 1, 0);
  c.set("b", 2, 0);
  c.set("c", 3, 0);
  c.set("d", 4, 0); // evicts the oldest ("a")
  assert.equal(c.size(), 3);
  assert.equal(c.get("a", 1), undefined);
  assert.equal(c.get("d", 1), 4);
  // overwriting an existing key does not evict
  c.set("b", 22, 0);
  assert.equal(c.size(), 3);
  assert.equal(c.get("b", 1), 22);
});
