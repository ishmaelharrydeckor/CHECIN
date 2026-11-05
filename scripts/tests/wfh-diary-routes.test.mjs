import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source checks for the diary route (task 2.3b, phase 2). The rules are tested in wfh-diary*.test.mjs;
// these keep the route to the security and scale rules.
const route = readFileSync("src/routes/api/wfh-diary.ts", "utf8");
const server = readFileSync("src/lib/wfh-diary.server.ts", "utf8");
const env = readFileSync(".env.example", "utf8");

test("every handler verifies the ID token, with revocation, through one function", () => {
  assert.deepEqual((route.match(/(GET|POST|PUT|PATCH|DELETE): async/g) ?? []).sort(), ["GET: async", "POST: async", "PUT: async"]);
  assert.equal((route.match(/verifyCallerToken\(/g) ?? []).length, 1);
  assert.ok(route.includes('verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true })'));
  assert.equal((route.match(/await authCaller\(request\)/g) ?? []).length, 3);
});

test("the session is always the caller's own: found by their id and the organization's day, never by a request field", () => {
  assert.ok(route.includes("findOwnSession(caller.uid, org.today, org.yesterday)"));
  assert.ok(route.includes("before.employeeId !== caller.uid"));
  for (const field of ["orgId", "managerId", "role", "sessionId", "uid"]) {
    assert.ok(!new RegExp(String.raw`\b(body|a|parsed\.value)\.${field}\b`).test(route), `${field} is never read from the request`);
  }
  assert.ok(!/searchParams\.get\("(orgId|managerId|role|sessionId)"\)/.test(route));
});

test("a session needs the diary on, a declared work-from-home day today and recorded consent", () => {
  const fn = route.slice(route.indexOf("async function start("), route.indexOf("async function changeSession("));
  assert.ok(fn.includes("if (!org.settings.enabled) return refuse(403"));
  assert.ok(fn.includes('collection("wfh_days").doc(wfhId(caller.uid, org.today))'));
  assert.ok(fn.includes("if (!consentSnap.exists) return refuse(403"));
  assert.ok(fn.includes("data.requestId === requestId"), "a retried start returns the same session");
  assert.ok(fn.includes("A work session is already running for you today, on this or another device."), "one session, one device");
  assert.ok(fn.includes("keyHash: sha256Hex(key)") && !/\bkey,\s*$|\bkey: key\b/m.test(fn.slice(0, fn.indexOf("tx.set(ref, data)"))), "only the key's hash is stored");
});

test("every change to a session is one transaction that rebuilds the day from what is stored", () => {
  assert.ok(/runTransaction\(async \(tx\) => \{\s*const \[snap, daySnap\] = await Promise\.all\(\[tx\.get\(ref\), tx\.get\(dayRef\)\]\);/.test(route));
  assert.ok(route.includes("checkIntervalTiming("), "intervals: finished, inside the session, once");
  assert.ok(route.includes("verifyIntervalSignature("));
  assert.ok(route.includes("answerLivenessCheck("));
  assert.ok(route.includes("nextSessionState("));
  assert.ok(route.includes("rebuild(secret, sessionId, changed.data"));
});

test("deciding a day: manager of the team or an admin, never your own, on figures rebuilt at that moment", () => {
  const fn = route.slice(route.indexOf("async function decide("), route.indexOf("// ---------------------------------------------------------------- GET views"));
  assert.ok(fn.includes('caller.role !== "manager" && caller.role !== "org_admin"'));
  assert.ok(fn.includes("canDecideDay("));
  assert.ok(fn.includes("rebuild(secret, id, data, session"));
  assert.ok(fn.includes("decideDay("));
  assert.ok(fn.includes("decidedBy: caller.uid"));
});

test("writes are rate limited and logged; settings are admin only and cannot touch the overtime switch", () => {
  for (const key of ["wfh_diary_consent_", "wfh_diary_start_", "wfh_diary_interval_", "wfh_diary_answer_", "wfh_diary_state_", "wfh_diary_decide_", "wfh_diary_settings_"]) {
    assert.ok(route.includes(key), key);
  }
  assert.ok(route.includes('action: "wfh_diary.start"') && route.includes("action: `wfh_diary.${action}`") && route.includes('action: "wfh_diary.settings"'));
  assert.ok(route.includes('if (caller.role !== "org_admin") return refuse(403, "Only an organization admin can change the diary settings.")'));
  assert.ok(!route.includes("diaryCountsTowardOvertime"));
});

test("the signing secret is required, with no fallback, and documented without a value", () => {
  assert.ok(server.includes("process.env.WFH_DIARY_SIGNING_SECRET"));
  assert.ok(!/WFH_DIARY_SIGNING_SECRET\s*(\|\||\?\?)\s*["'][^"']+["']/.test(server), "no baked-in fallback");
  assert.ok(server.includes("throw new DiaryNotConfigured("));
  assert.ok(route.includes("refuse(503,"));
  assert.match(env, /^WFH_DIARY_SIGNING_SECRET=$/m);
});

test("the still-here schedule and codes are worked out from the secret, never stored or sent ahead", () => {
  assert.ok(server.includes("secretRandom(secret,"));
  assert.ok(server.includes("hmacHex(secret, `code|v1|"));
  const start = route.slice(route.indexOf("async function start("), route.indexOf("async function changeSession("));
  assert.ok(!/checks:\s*checks\b/.test(start) && start.includes("upcomingChecks(checks, nowMs, CHECK_HORIZON_MS)"));
  const detail = route.slice(route.indexOf("async function viewDetail("));
  assert.ok(!detail.slice(0, detail.indexOf("function diaryError")).includes("code: c.code"), "the review screen never gets codes");
});

test("lists are bounded; counts and timings only, nothing about content", () => {
  assert.ok(route.includes(".limit(DIARY_TEAM_CAP)"));
  assert.ok(!/url|title|keystroke|screenshot|application/i.test(route.replace(/request\.url|new URL\(/g, "")));
});
