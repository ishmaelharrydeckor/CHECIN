import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FEATURES, canUseFeature, decideGate, parseEnforcementMode, resolvePlan } from "../../src/lib/plans.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const assignments = read("src/routes/api/shifts/assignments.ts");
const patterns = read("src/routes/api/shifts/patterns.ts");
const swaps = read("src/routes/api/shifts/swaps.ts");

const NOW = Date.parse("2026-11-09T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86_400_000;

const orgs = {
  trial: { trialEndsAt: iso(NOW + 5 * DAY) },
  expired: { trialEndsAt: iso(NOW - DAY) },
  grandfathered: {},
  starter: { plan: "starter", planStatus: "active" },
  growth: { plan: "growth", planStatus: "active" },
  enterprise: { plan: "enterprise", planStatus: "active" },
  starterWithGrant: { plan: "starter", planStatus: "active", featureGrants: { shift_swaps: true } },
};
const FEATURES_WIRED_HERE = ["shifts", "shift_patterns", "shift_swaps"];

// ---- the rules these routes now ask ------------------------------------------------------------------------------

test("the three features belong to the Growth plan and are built", () => {
  for (const f of FEATURES_WIRED_HERE) {
    assert.equal(FEATURES[f].minPlan, "growth", f);
    assert.equal(FEATURES[f].built, true, f);
  }
});

test("with enforcement off or unset nothing is checked, for any organization", () => {
  for (const unset of [undefined, null, "", "off", "OFF", "garbage"]) assert.equal(parseEnforcementMode(unset), "off", String(unset));
  for (const [name, org] of Object.entries(orgs)) {
    for (const feature of FEATURES_WIRED_HERE) {
      assert.equal(decideGate({ mode: "off", feature, access: resolvePlan(org, NOW) }), "allow", `${name} ${feature}`);
    }
  }
});

test("in shadow mode everything is allowed and what would be blocked is logged", () => {
  for (const feature of FEATURES_WIRED_HERE) {
    assert.equal(decideGate({ mode: "shadow", feature, access: resolvePlan(orgs.expired, NOW) }), "log");
    assert.equal(decideGate({ mode: "shadow", feature, access: resolvePlan(orgs.growth, NOW) }), "allow");
  }
});

test("when it is on: trials, grandfathered, Growth and Enterprise keep the features; Starter and expired trials do not", () => {
  const verdict = (org, feature) => decideGate({ mode: "on", feature, access: resolvePlan(org, NOW) });
  for (const feature of FEATURES_WIRED_HERE) {
    for (const ok of ["trial", "grandfathered", "growth", "enterprise"]) assert.equal(verdict(orgs[ok], feature), "allow", `${ok} ${feature}`);
    for (const no of ["starter", "expired"]) assert.equal(verdict(orgs[no], feature), "deny", `${no} ${feature}`);
  }
  assert.equal(verdict(orgs.starterWithGrant, "shift_swaps"), "allow", "a grant adds one feature");
  assert.equal(verdict(orgs.starterWithGrant, "shifts"), "deny", "and only that one");
  assert.equal(canUseFeature("shifts", resolvePlan(orgs.expired, NOW)), false);
});

// ---- where the routes ask -------------------------------------------------------------------------------------------

const slice = (src, from, to) => {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `${from} exists`);
  const b = to ? src.indexOf(to, a + from.length) : -1;
  return b < 0 ? src.slice(a) : src.slice(a, b);
};

test("every route imports the guard", () => {
  for (const src of [assignments, patterns, swaps]) assert.ok(src.includes('import { gateFeature } from "@/lib/plan-gate.server";'));
});

test("giving people shifts is checked after the caller and their permission, and before any work", () => {
  const post = slice(assignments, "POST: async", "DELETE: async");
  const gate = post.indexOf('gateFeature(orgId, "shifts", { uid: caller.uid, request })');
  assert.ok(gate > 0, "assignments POST asks");
  assert.ok(post.indexOf("canCallerManageShifts(caller)") < gate, "after the permission check");
  assert.ok(gate < post.indexOf("checkRateLimit("), "before the rate limit");
  assert.ok(gate < post.indexOf("request.json()"), "before the body is read");
  assert.ok(gate < post.indexOf('collection("shift_assignments")'), "before anything is written");
});

test("removing assignments is never blocked", () => {
  const del = slice(assignments, "DELETE: async");
  assert.ok(!del.includes("gateFeature"), "taking a shift away stays possible on any plan");
});

test("creating or filling a pattern is checked; changing one is checked; ending one never is", () => {
  const post = slice(patterns, "POST: async", "PATCH: async");
  const gate = post.indexOf('gateFeature(orgId, "shift_patterns", { uid: caller.uid, request })');
  assert.ok(gate > 0, "pattern POST asks");
  assert.ok(post.indexOf("authManager(request") < gate, "after the caller is known");
  assert.ok(gate < post.indexOf("request.json()"), "before the body is read");
  assert.ok(gate < post.indexOf('action === "topup"'), "so filling ahead is covered too");

  const edit = slice(patterns, "async function applyEdit", "\nexport const Route");
  const g = edit.indexOf('gateFeature(orgId, "shift_patterns"');
  assert.ok(g > 0, "changing a pattern asks");
  assert.ok(edit.lastIndexOf('if (mode === "edit")', g) > edit.indexOf("authManager(request"), "only when editing, not ending");
  assert.ok(g < edit.indexOf("limited("), "before the rate limit");
  const gates = (edit.match(/gateFeature\(/g) ?? []).length;
  assert.equal(gates, 1, "one place, inside the edit branch");
});

test("proposing a swap is checked; answering, cancelling and approving one already in progress never are", () => {
  const propose = slice(swaps, "async function propose", "\nasync function ");
  const gate = propose.indexOf('gateFeature(orgId, "shift_swaps", { uid: caller.uid, request })');
  assert.ok(gate > 0, "propose asks");
  assert.ok(propose.indexOf("Only people with shifts can propose a swap.") < gate, "after the role check");
  assert.ok(gate < propose.indexOf("limited("), "before the rate limit");
  assert.equal((swaps.match(/gateFeature\(/g) ?? []).length, 1, "only the proposal asks");
  const act = slice(swaps, "async function act(");
  assert.ok(!act.includes("gateFeature"));
});

test("the organization asked about is the caller's own, from the verified token, never the request", () => {
  for (const src of [assignments, patterns, swaps]) {
    for (const m of src.matchAll(/gateFeature\(([^,]+),/g)) assert.equal(m[1].trim(), "orgId");
    assert.ok(!/gateFeature\([^)]*(body|searchParams|url)/.test(src));
  }
  assert.ok(assignments.includes('const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";'));
  assert.ok(patterns.includes('const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";'));
});

test("the other shift routes and the scan route are left alone here", () => {
  assert.ok(!read("src/routes/api/check-in/scan.ts").includes("gateFeature"), "the scan route is the hot path: it is not touched");
  assert.ok(!read("src/routes/api/cron/shift-patterns.ts").includes("gateFeature"), "the nightly refill is a separate decision");
});

test("the design note lists what is wired", () => {
  const doc = read("docs/PLAN-GATING-DESIGN.md");
  assert.match(doc, /Shift assignments/i);
  assert.match(doc, /patterns/i);
  assert.match(doc, /swaps/i);
  assert.match(doc, /removing|ending|never blocked/i);
});
