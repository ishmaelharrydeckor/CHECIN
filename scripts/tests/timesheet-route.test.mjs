import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveDashboardScope } from "../../src/lib/dashboard-scope.ts";
import { maxRegisterDays, registerRangeError, parseReportRange, MAX_REPORT_DAYS } from "../../src/lib/report-data.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const route = read("src/routes/api/reports/timesheet.ts");
const loader = read("src/lib/register-load.server.ts");
const register = read("src/routes/api/reports/register.ts");

// ---- who may ask, and for whom (design test 4) ------------------------------------------------------------

test("an employee, a missing role or no organization gets no scope, so the route refuses them", () => {
  assert.equal(resolveDashboardScope({ uid: "u", role: "employee", orgId: "o" }), null);
  assert.equal(resolveDashboardScope({ uid: "u", role: undefined, orgId: "o" }), null);
  assert.equal(resolveDashboardScope({ uid: "u", role: "manager", orgId: "" }), null);
  assert.equal(resolveDashboardScope({ uid: "", role: "org_admin", orgId: "o" }), null);
});

test("a manager is scoped to their own uid and an admin to the organization, from the token", () => {
  assert.deepEqual(resolveDashboardScope({ uid: "m1", role: "manager", orgId: "orgA" }), { uid: "m1", role: "manager", orgId: "orgA" });
  assert.deepEqual(resolveDashboardScope({ uid: "a1", role: "org_admin", orgId: "orgA" }), { uid: "a1", role: "org_admin", orgId: "orgA" });
});

test("the route decides who is calling from the verified token only", () => {
  assert.ok(route.includes("authorizeReportCaller(request)"), "verified token, role, rate limit");
  assert.ok(route.includes('if ("response" in auth) return auth.response;'));
  // The only things read from the request are the two dates.
  assert.ok(!/request\.json\(\)|request\.formData\(\)/.test(route), "no body is read");
  const reads = [...route.matchAll(/searchParams\.get\("([^"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(reads, ["from", "to"]);
  assert.ok(!/orgId\s*=|managerId\s*=|userId/.test(route.replace(/scope\.orgId/g, "")), "no identity is taken from the request");
});

test("loading is scoped by the verified scope, never by an id from the request", () => {
  assert.ok(route.includes("loadRegisterForScope({ scope, range, context, request })"));
  assert.ok(route.includes("loadOrgContext(scope)"));
});

// ---- the range and the team size limits (design test 4) -----------------------------------------------------

test("a range over the limit is refused with a plain sentence", () => {
  const long = parseReportRange("2026-10-01", "2026-12-31");
  assert.equal(long.ok, false);
  assert.match(long.error, new RegExp(`${MAX_REPORT_DAYS} days or fewer`));
  assert.equal(parseReportRange("2026-10-05", "2026-10-01").ok, false);
  assert.equal(parseReportRange("nope", "2026-10-01").ok, false);
});

test("a large team gets a shorter limit, and the route refuses before reading anything", () => {
  assert.ok(route.includes("registerRangeError(context.roster.length, range.days.length)"));
  assert.ok(route.indexOf("registerRangeError") < route.indexOf("loadRegisterForScope("), "the check comes before the reads");
  assert.equal(maxRegisterDays(2000), 3);
  assert.match(registerRangeError(2000, 10), /at most 3 days/);
  assert.equal(registerRangeError(10, 10), null);
});

// ---- same reads, same builder as the register (design test 1) --------------------------------------------------

test("the timesheet reads exactly what the register reads, with the same limits and the same settings", () => {
  for (const cap of ["WEEK_SUMMARY_CAP", "SHIFT_ASSIGNMENT_CAP_RANGE", "WFH_RANGE_CAP", "DIARY_RANGE_CAP"]) {
    assert.ok(register.includes(cap) && loader.includes(cap), `${cap} is used by both`);
  }
  for (const piece of [
    "breaks: shifts.shiftsEnabled && shifts.breaksEnabled",
    "diaryTracked: context.diaryEnabled",
    'process.env.SHIFTS_DISABLED !== "1"',
    "loadScopedLeave(scope, \"approved\")",
    "loadHolidayDays(scope.orgId)",
  ]) {
    assert.ok(register.includes(piece), `the register has: ${piece}`);
    assert.ok(loader.includes(piece), `the loader has: ${piece}`);
  }
  assert.ok(loader.includes("buildAttendanceRegister("));
  assert.ok(!/firestoreAdmin/.test(loader), "the loader goes through the same bounded loaders, with no queries of its own");
});

test("the rota is passed to the register only when it has assignments, as the register does", () => {
  assert.ok(register.includes("shiftResult.assignments.length > 0"));
  assert.ok(loader.includes("shiftResult.assignments.length > 0"));
});

// ---- the answer ----------------------------------------------------------------------------------------------

test("the answer is never cached and the call is logged without secrets or names", () => {
  assert.ok(route.includes('"Cache-Control": "private, no-store"'));
  assert.ok(route.includes('action: "reports.timesheet"'));
  const log = route.slice(route.indexOf("logEvent({"), route.indexOf("});", route.indexOf("logEvent({")));
  assert.ok(/uid: scope\.uid/.test(log) && /orgId: scope\.orgId/.test(log) && /correlationId: cid/.test(log));
  assert.ok(!/email|name|token/i.test(log.replace(/correlationId/g, "")), "no personal details in the log line");
});

test("a failure answers with a plain sentence and logs the error, not the data", () => {
  assert.ok(route.includes('error: "Could not build the timesheet"'));
  assert.ok(route.includes('console.error("GET /api/reports/timesheet error:"'));
});

test("the old browser-side estimates stay gone and the route does not touch raw scans", () => {
  assert.ok(!route.includes("clock_events") && !loader.includes("clock_events"));
  assert.ok(!/api\/attendance\/history/.test(route + loader));
});
