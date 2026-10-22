import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FEATURES,
  PLAN_RANK,
  TRIAL_DAYS,
  canUseFeature,
  decideGate,
  grantedFeatures,
  isPlanId,
  lockedMessage,
  parseEnforcementMode,
  resolvePlan,
  trialEndsAtFrom,
} from "../../src/lib/plans.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-20T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const access = (org) => resolvePlan(org, NOW);

// ---------------------------------------------------------------- what an organization may use
test("an organization created before trial dates were stored keeps everything and never expires", () => {
  for (const org of [undefined, null, {}, { plan: "growth" }, { plan: "growth", trialEndsAt: "garbage" }, "not an object", []]) {
    const a = access(org);
    assert.equal(a.status, "trial", JSON.stringify(org));
    assert.equal(a.grandfathered, true);
    assert.equal(a.trialEndsAt, null);
    for (const f of Object.keys(FEATURES)) assert.equal(canUseFeature(f, a), true, `${f} for ${JSON.stringify(org)}`);
  }
});

test("a trial has every feature, including Enterprise ones, until its end, and the last moment still counts", () => {
  const live = access({ plan: "growth", trialEndsAt: iso(NOW + 3 * DAY) });
  assert.equal(live.status, "trial");
  assert.equal(live.grandfathered, false);
  assert.ok(Object.keys(FEATURES).every((f) => canUseFeature(f, live)));
  assert.equal(resolvePlan({ trialEndsAt: iso(NOW) }, NOW).status, "trial", "exactly at the end");
  assert.equal(resolvePlan({ trialEndsAt: iso(NOW - 1) }, NOW).status, "expired", "one millisecond after");
});

test("an expired trial keeps nothing that is gated", () => {
  const expired = access({ plan: "growth", trialEndsAt: iso(NOW - DAY) });
  assert.equal(expired.status, "expired");
  assert.ok(Object.keys(FEATURES).every((f) => canUseFeature(f, expired) === false));
});

test("a paid plan unlocks features up to its own level and no further", () => {
  const starter = access({ plan: "starter", planStatus: "active" });
  const growth = access({ plan: "growth", planStatus: "active" });
  const enterprise = access({ plan: "enterprise", planStatus: "active" });
  for (const [key, info] of Object.entries(FEATURES)) {
    assert.equal(canUseFeature(key, starter), false, `${key}: Starter has none of the gated features`);
    assert.equal(canUseFeature(key, growth), PLAN_RANK.growth >= PLAN_RANK[info.minPlan], `${key} on Growth`);
    assert.equal(canUseFeature(key, enterprise), true, `${key} on Enterprise`);
  }
  assert.equal(canUseFeature("shifts", growth), true);
  assert.equal(canUseFeature("sso", growth), false);
});

test("damaged data never locks anyone out: an unknown plan reads as the legacy trial label", () => {
  assert.equal(access({ plan: "platinum" }).plan, "growth");
  assert.equal(isPlanId("growth"), true);
  assert.equal(isPlanId("platinum"), false);
  assert.equal(access({ plan: 7, planStatus: "weird" }).status, "trial");
});

// ---------------------------------------------------------------- giving one company a feature
test("a grant switches one feature on for one company whatever its plan", () => {
  const starter = access({ plan: "starter", planStatus: "active", featureGrants: { sso: true } });
  assert.equal(canUseFeature("sso", starter), true);
  assert.equal(canUseFeature("audit_trail", starter), false, "only what was granted");
  const expired = access({ trialEndsAt: iso(NOW - DAY), featureGrants: { analytics: true } });
  assert.equal(canUseFeature("analytics", expired), true, "even after a trial ends");
  assert.equal(canUseFeature("shifts", expired), false);
});

test("only an exact true counts as a grant; names we do not know and other values are ignored", () => {
  assert.deepEqual(grantedFeatures({ sso: true, wfh: "yes", analytics: 1, nonsense: true, shifts: false }), ["sso"]);
  assert.deepEqual(grantedFeatures(undefined), []);
  assert.deepEqual(grantedFeatures([true]), []);
  assert.deepEqual(grantedFeatures("sso"), []);
});

test("a grant can only add: false never takes away what the plan includes", () => {
  const growth = access({ plan: "growth", planStatus: "active", featureGrants: { shifts: false } });
  assert.equal(canUseFeature("shifts", growth), true);
});

// ---------------------------------------------------------------- the feature table
test("every gated feature belongs to Growth or Enterprise (Starter's features are not gated), with a name", () => {
  for (const [key, info] of Object.entries(FEATURES)) {
    assert.ok(info.minPlan === "growth" || info.minPlan === "enterprise", key);
    assert.ok(info.label.length > 2, key);
  }
});

test("Growth has the six built features the pricing page lists; the six Enterprise features are planned, not built", () => {
  const growth = Object.entries(FEATURES).filter(([, i]) => i.minPlan === "growth");
  const enterprise = Object.entries(FEATURES).filter(([, i]) => i.minPlan === "enterprise");
  assert.deepEqual(growth.map(([k]) => k).sort(), ["analytics", "breaks", "shift_patterns", "shift_swaps", "shifts", "wfh"]);
  assert.ok(growth.every(([, i]) => i.built));
  assert.deepEqual(enterprise.map(([k]) => k).sort(), ["audit_trail", "data_export", "leave_balances", "overtime_payroll", "scheduled_reports", "sso"]);
  assert.ok(enterprise.every(([, i]) => i.built === false), "nothing unbuilt may be offered");
});

test("the sentence for a locked feature is plain and names the plan that includes it", () => {
  assert.equal(lockedMessage("analytics"), "Attendance analytics is not part of your plan. The Growth plan includes it.");
  assert.match(lockedMessage("sso"), /Enterprise plan includes it/);
  assert.match(lockedMessage("shifts", access({ trialEndsAt: iso(NOW - DAY) })), /free trial has ended/);
});

// ---------------------------------------------------------------- the trial
test("a new organization's trial lasts 14 days from sign-up", () => {
  assert.equal(TRIAL_DAYS, 14);
  assert.equal(trialEndsAtFrom(NOW), iso(NOW + 14 * DAY));
});

// ---------------------------------------------------------------- how strictly it is applied
test("enforcement is off unless it is clearly switched on, and a typo never turns it on", () => {
  assert.equal(parseEnforcementMode(undefined), "off");
  assert.equal(parseEnforcementMode(""), "off");
  assert.equal(parseEnforcementMode("true"), "off");
  assert.equal(parseEnforcementMode("ON "), "on");
  assert.equal(parseEnforcementMode("shadow"), "shadow");
  assert.equal(parseEnforcementMode("enforce"), "off");
});

test("off allows everything, shadow only logs, on refuses", () => {
  const locked = access({ plan: "starter", planStatus: "active" });
  const ok = access({ plan: "growth", planStatus: "active" });
  assert.equal(decideGate({ mode: "off", feature: "shifts", access: locked }), "allow");
  assert.equal(decideGate({ mode: "shadow", feature: "shifts", access: locked }), "log");
  assert.equal(decideGate({ mode: "on", feature: "shifts", access: locked }), "deny");
  for (const mode of ["off", "shadow", "on"]) assert.equal(decideGate({ mode, feature: "shifts", access: ok }), "allow");
});

// ---------------------------------------------------------------- the guard and where it is used
const gate = read("src/lib/plan-gate.server.ts");

test("the guard does nothing and reads nothing while enforcement is off", () => {
  assert.ok(gate.indexOf('if (mode === "off") return null;') < gate.indexOf('collection("organizations")'));
});

test("the plan is read from the caller's own verified organization, never from the request", () => {
  assert.ok(gate.includes('.collection("organizations").doc(orgId)'));
  assert.ok(!gate.includes("request.json") && !gate.includes("searchParams") && !gate.includes("headers.get"), "nothing is taken from the request");
});

test("a fault of ours never blocks anyone, and a refusal is a plain 403 with a code the screens can use", () => {
  assert.ok(gate.includes("read_error") && gate.includes("our own fault never blocks anyone"));
  assert.ok(gate.includes('code: "plan_required"') && gate.includes("status: 403"));
});

test("every request that would be blocked is logged with the feature and plan, never a person's details", () => {
  assert.ok(gate.includes('action: "plan.gate"') && gate.includes("wouldBlock: true"));
});

test("the paid routes call the guard after they know who is asking", () => {
  const analytics = read("src/routes/api/analytics.ts");
  assert.ok(analytics.indexOf("const { scope } = auth;") < analytics.indexOf('gateFeature(scope.orgId, "analytics"'));
  const wfh = read("src/routes/api/wfh.ts");
  assert.equal((wfh.match(/gateFeature\(orgId, "wfh"/g) ?? []).length, 2, "declaring and removing a day");
  const settings = read("src/routes/api/shifts/settings.ts");
  assert.ok(settings.includes('parsed.value.shiftsEnabled === true') && settings.includes('gateFeature(orgId, "shifts"'));
  assert.ok(settings.includes('parsed.value.breaksEnabled === true') && settings.includes('gateFeature(orgId, "breaks"'));
});

test("turning a paid feature OFF is never blocked, only turning it on", () => {
  const settings = read("src/routes/api/shifts/settings.ts");
  assert.ok(!settings.includes("shiftsEnabled === false") && !settings.includes("breaksEnabled === false"));
});

test("a new organization is created with its trial end date", () => {
  const reg = read("src/routes/api/auth/register-org.ts");
  assert.ok(reg.includes("trialEndsAt: trialEndsAtFrom(Date.now())") && reg.includes('from "@/lib/plans"'));
});

test("PLAN_ENFORCEMENT is documented, off by default, and has no value in the repository", () => {
  const env = read(".env.example");
  assert.ok(env.includes("PLAN_ENFORCEMENT="));
  assert.ok(!/PLAN_ENFORCEMENT=\S/.test(env), "empty means off");
});
