import { test } from "node:test";
import assert from "node:assert/strict";
import { createCachedLoader } from "../../src/lib/ttl-cache.server.ts";
import { dashboardCacheKey } from "../../src/lib/dashboard-scope.ts";
import {
  IDLE_AFTER_MS,
  POLL_EVERY_MS,
  isIdle,
  shouldPoll,
  shouldRefreshOnReturn,
} from "../../src/lib/idle-refresh.ts";

// ---------------------------------------------------------------- cache key (security)
const admin = (orgId, uid = "a1") => ({ uid, role: "org_admin", orgId });
const manager = (orgId, uid) => ({ uid, role: "manager", orgId });

test("dashboardCacheKey: two different managers never share an entry", () => {
  assert.notEqual(dashboardCacheKey(manager("o1", "m1")), dashboardCacheKey(manager("o1", "m2")));
});

test("dashboardCacheKey: a manager never shares an entry with the org admin", () => {
  assert.notEqual(dashboardCacheKey(manager("o1", "m1")), dashboardCacheKey(admin("o1")));
});

test("dashboardCacheKey: different organizations never share an entry", () => {
  assert.notEqual(dashboardCacheKey(admin("o1")), dashboardCacheKey(admin("o2")));
  assert.notEqual(dashboardCacheKey(manager("o1", "m1")), dashboardCacheKey(manager("o2", "m1")));
});

test("dashboardCacheKey: two admins of the same org share one entry (same data)", () => {
  assert.equal(dashboardCacheKey(admin("o1", "a1")), dashboardCacheKey(admin("o1", "a2")));
});

test("dashboardCacheKey: values cannot run together to fake another key", () => {
  // naive 'orgId:uid' joining would make these two collide
  assert.notEqual(dashboardCacheKey(manager("o1:m", "1")), dashboardCacheKey(manager("o1", "m:1")));
  assert.notEqual(dashboardCacheKey(manager("o", "1")), dashboardCacheKey(admin("o:1")));
});

// ---------------------------------------------------------------- cached loader
function counter() {
  let n = 0;
  return { compute: async () => ++n, calls: () => n };
}

test("cachedLoader: a second request inside the lifetime does not recompute", async () => {
  const load = createCachedLoader(45_000, 10, 5_000);
  const c = counter();
  assert.equal(await load("k", c.compute, { now: 1000 }), 1);
  assert.equal(await load("k", c.compute, { now: 30_000 }), 1);
  assert.equal(c.calls(), 1);
});

test("cachedLoader: recomputes after the lifetime ends", async () => {
  const load = createCachedLoader(45_000, 10, 5_000);
  const c = counter();
  await load("k", c.compute, { now: 1000 });
  assert.equal(await load("k", c.compute, { now: 1000 + 45_001 }), 2);
});

test("cachedLoader: fresh recomputes, but not within the minimum age", async () => {
  const load = createCachedLoader(45_000, 10, 5_000);
  const c = counter();
  await load("k", c.compute, { now: 1000 });
  assert.equal(await load("k", c.compute, { now: 3000, fresh: true }), 1); // only 2 s old: ignored
  assert.equal(await load("k", c.compute, { now: 7000, fresh: true }), 2); // 6 s old: honoured
  assert.equal(c.calls(), 2);
});

test("cachedLoader: different keys are independent", async () => {
  const load = createCachedLoader(45_000, 10, 5_000);
  const a = counter();
  const b = counter();
  assert.equal(await load("a", a.compute, { now: 1 }), 1);
  assert.equal(await load("b", b.compute, { now: 1 }), 1);
  assert.equal(a.calls(), 1);
  assert.equal(b.calls(), 1);
});

test("cachedLoader: simultaneous requests share one computation", async () => {
  const load = createCachedLoader(45_000, 10, 5_000);
  let calls = 0;
  const slow = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return "done";
  };
  const results = await Promise.all([load("k", slow, { now: 1 }), load("k", slow, { now: 1 }), load("k", slow, { now: 1 })]);
  assert.deepEqual(results, ["done", "done", "done"]);
  assert.equal(calls, 1);
});

test("cachedLoader: a failed computation is not cached and can be retried", async () => {
  const load = createCachedLoader(45_000, 10, 5_000);
  await assert.rejects(load("k", async () => { throw new Error("boom"); }, { now: 1 }), /boom/);
  assert.equal(await load("k", async () => "ok", { now: 2 }), "ok");
});

// ---------------------------------------------------------------- idle rule
test("isIdle / shouldPoll: active and visible polls", () => {
  const now = 1_000_000;
  assert.equal(shouldPoll({ visible: true, lastActivityMs: now - 60_000, nowMs: now }), true);
});

test("shouldPoll: a hidden tab never polls", () => {
  const now = 1_000_000;
  assert.equal(shouldPoll({ visible: false, lastActivityMs: now, nowMs: now }), false);
});

test("shouldPoll: stops at 10 minutes without activity, not before", () => {
  const now = 10_000_000;
  assert.equal(shouldPoll({ visible: true, lastActivityMs: now - (IDLE_AFTER_MS - 1), nowMs: now }), true);
  assert.equal(shouldPoll({ visible: true, lastActivityMs: now - IDLE_AFTER_MS, nowMs: now }), false);
  assert.equal(isIdle(now - IDLE_AFTER_MS, now), true);
  assert.equal(isIdle(now - 1000, now), false);
});

test("shouldRefreshOnReturn: only when the numbers are older than one poll", () => {
  const now = 5_000_000;
  assert.equal(shouldRefreshOnReturn(now - (POLL_EVERY_MS - 1), now), false);
  assert.equal(shouldRefreshOnReturn(now - POLL_EVERY_MS, now), true);
  assert.equal(shouldRefreshOnReturn(0, now), true);
});

test("constants are what the owner approved", () => {
  assert.equal(IDLE_AFTER_MS, 10 * 60_000);
  assert.equal(POLL_EVERY_MS, 2 * 60_000);
});
