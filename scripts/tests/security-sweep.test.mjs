import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { PREFERENCE_KEYS, sanitizePreferences } from "../../src/lib/notification-preferences.ts";
import {
  KIOSK_MISS_TTL_MS,
  clearKioskCache,
  invalidateKiosk,
  isKnownMissingKiosk,
  noteMissingKiosk,
} from "../../src/lib/kiosk-cache.server.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

function routeFiles(dir = "src/routes/api") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out.sort();
}
const routes = routeFiles();

// ---- the saved notification settings ------------------------------------------------------------------------

test("only the known switches are kept, and only as true or false", () => {
  const r = sanitizePreferences({ pushEnabled: true, announcements: false, leave: true, shifts: false, account: true, attendance: false, assignments: true, deadlines: true, system: false });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value).sort(), [...PREFERENCE_KEYS].sort());
});

test("anything else the browser sends is dropped, so the record cannot grow or carry someone else's id", () => {
  const r = sanitizePreferences({ announcements: true, userId: "someone-else", orgId: "orgB", role: "org_admin", huge: "x".repeat(100000), __proto__: { admin: true } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { announcements: true });
});

test("a known switch that is not true or false is refused", () => {
  for (const bad of ["yes", 1, 0, null, {}, [], "true"]) {
    const r = sanitizePreferences({ announcements: bad });
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.error.length > 15);
  }
});

test("nothing to save is refused, whatever it looks like", () => {
  for (const bad of [null, undefined, 5, "on", [], {}, { userId: "x" }, { evil: true }]) {
    assert.equal(sanitizePreferences(bad).ok, false, JSON.stringify(bad));
  }
});

test("the preferences route uses it and no longer saves the browser's object as it came", () => {
  const route = read("src/routes/api/push/preferences.ts");
  assert.ok(route.includes("sanitizePreferences("));
  assert.ok(!/\.\.\.preferences/.test(route), "the raw object is not spread into the saved record");
});

// ---- no internal error text goes to the browser ------------------------------------------------------------------

/** Routes that answer with a message on purpose, from an error class made for that (a refusal with its own status). */
const TYPED_REFUSALS = new Map([
  ["src/routes/api/attendance/late-excuse.ts", "Refused"],
  ["src/routes/api/check-in/undo.ts", "UndoRefused"],
  ["src/routes/api/corrections.ts", "Refused"],
]);

test("no route sends an error's own text, or its details, to the browser", () => {
  const offenders = [];
  routes.forEach((p) => {
    const src = read(p);
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      const leaks = /(error|detail|message):\s*(err|e|error)\??\.message/.test(line) || /detail:\s*err/.test(line);
      if (!leaks) return;
      const cls = TYPED_REFUSALS.get(p);
      const guarded = cls && lines.slice(Math.max(0, i - 3), i + 1).some((l) => l.includes(`instanceof ${cls}`));
      if (!guarded) offenders.push(`${p}:${i + 1}`);
    });
  });
  assert.deepEqual(offenders, []);
});

// ---- every route says who may call it ---------------------------------------------------------------------------------

const AUTH_MARKERS = [
  "verifyCallerToken",
  "authorizeReportCaller",
  "resolveCallerIdentity",
  "checkCronAuth",
  "resolveDashboardScope",
];

/** Routes with no signed-in caller, and why that is right. Adding a route here needs a reason a reviewer accepts. */
const NO_SIGNED_IN_CALLER = new Map([
  ["src/routes/api/kiosk/token.ts", "the tablet proves itself with its device secret (x-kiosk-secret), checked in constant time"],
  ["src/routes/api/kiosk/pair.ts", "a new tablet proves itself with a one-time pairing code (single use, 10 minutes), and attempts are limited"],
  ["src/routes/api/push/vapid-key.ts", "returns only the public push key, which is public by design"],
]);

test("every API route verifies its caller, or is on the short list of exceptions with a reason", () => {
  const missing = routes.filter((p) => !AUTH_MARKERS.some((m) => read(p).includes(m)) && !NO_SIGNED_IN_CALLER.has(p));
  assert.deepEqual(missing, [], "a new route must verify the caller's token itself (AGENTS.md rule 7)");
  for (const [p, why] of NO_SIGNED_IN_CALLER) {
    assert.ok(routes.includes(p), `${p} still exists`);
    assert.ok(why.length > 20);
  }
});

test("the kiosk route really does check the device secret, and the public key route returns nothing private", () => {
  const kiosk = read("src/routes/api/kiosk/token.ts");
  assert.ok(kiosk.includes('request.headers.get("x-kiosk-secret")'));
  assert.ok(kiosk.includes("timingSafeHashMatch("));
  const key = read("src/routes/api/push/vapid-key.ts");
  assert.ok(!/VAPID_PRIVATE_KEY/.test(key));
});

/** The entry points anyone on the internet can reach. Each must limit attempts in a shared store and fail closed. */
const OPEN_ENTRY_POINTS = ["src/routes/api/kiosk/pair.ts", "src/routes/api/auth/register-org.ts", "src/routes/api/admin/staff-invites.ts"];

test("the open entry points limit attempts in the shared store and refuse when it cannot be read", () => {
  for (const p of OPEN_ENTRY_POINTS) {
    const src = read(p);
    assert.ok(src.includes("checkRateLimit("), `${p} limits attempts`);
    assert.ok(src.includes("failClosed: true"), `${p} fails closed`);
    assert.ok(src.includes("clientIpFrom(request)"), `${p} limits by the caller's address`);
  }
});

test("nothing reads the caller's identity from a request body in a way that is trusted", () => {
  // Identity (role, organization, manager) comes from the token. A body may NAME a target, which the route then
  // checks is in the caller's scope; it may never be the caller.
  for (const p of routes) {
    const src = read(p);
    assert.ok(!/caller\.(role|orgId|managerId)\s*=\s*body/.test(src), p);
    assert.ok(!/const\s+(callerRole|callerOrgId)\s*=\s*body/.test(src), p);
  }
});

test("deleting a notice also needs the caller to belong to an organization", () => {
  const src = read("src/routes/api/announcements/index.ts");
  const del = src.slice(src.indexOf("DELETE:"));
  assert.ok(/if \(!caller\.orgId\)/.test(del), "a caller with no organization cannot match a notice that has none");
});

// ---- the kiosk route and unknown ids ----------------------------------------------------------------------------------

test("a tablet id that does not exist is remembered briefly, so a flood of made-up ids does not read the database each time", () => {
  clearKioskCache();
  const t0 = 1_000_000;
  assert.equal(isKnownMissingKiosk("nope", t0), false);
  noteMissingKiosk("nope", t0);
  assert.equal(isKnownMissingKiosk("nope", t0 + 1), true);
  assert.equal(isKnownMissingKiosk("nope", t0 + KIOSK_MISS_TTL_MS - 1), true);
  assert.equal(isKnownMissingKiosk("nope", t0 + KIOSK_MISS_TTL_MS + 1), false, "forgotten after a short time");
  assert.equal(isKnownMissingKiosk("other", t0 + 1), false, "only that id");
});

test("pairing or revoking a tablet makes the change count straight away", () => {
  clearKioskCache();
  noteMissingKiosk("loc1", 5_000);
  assert.equal(isKnownMissingKiosk("loc1", 5_001), true);
  invalidateKiosk("loc1");
  assert.equal(isKnownMissingKiosk("loc1", 5_002), false);
});

test("the remembered misses are bounded", () => {
  clearKioskCache();
  for (let i = 0; i < 5000; i++) noteMissingKiosk(`id${i}`, 10_000);
  let remembered = 0;
  for (let i = 0; i < 5000; i++) if (isKnownMissingKiosk(`id${i}`, 10_001)) remembered++;
  assert.ok(remembered <= 1000, `kept ${remembered}`);
  assert.ok(remembered > 0);
});

test("the kiosk token route no longer sends error details, checks the type of the id, and uses the miss memory", () => {
  const src = read("src/routes/api/kiosk/token.ts");
  assert.ok(!src.includes("detail:"));
  assert.ok(src.includes('typeof body?.locationId === "string"'));
  assert.ok(src.includes("isKnownMissingKiosk("));
  assert.ok(src.includes("noteMissingKiosk("));
});
