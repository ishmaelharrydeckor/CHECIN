import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const rules = readFileSync("firestore.rules", "utf8").replace(/\r\n/g, "\n");

/** Every `match /name/{id} { ... }` block, with its text, found by counting braces. */
function blocks() {
  const out = new Map();
  const re = /match \/([A-Za-z_]+|\{document=\*\*\})(?:\/\{[A-Za-z]+\})?\s*\{/g;
  let m;
  while ((m = re.exec(rules))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < rules.length && depth > 0) {
      if (rules[i] === "{") depth++;
      else if (rules[i] === "}") depth--;
      i++;
    }
    out.set(m[1], rules.slice(m.index, i));
    re.lastIndex = i;
  }
  return out;
}
const all = blocks();
const collections = [...all.keys()].filter((k) => k !== "{document=**}");
const allowLines = (block) => [...block.matchAll(/allow ([a-z, ]+):\s*if ([^;]+);/g)].map((x) => ({ ops: x[1].split(",").map((o) => o.trim()), cond: x[2].replace(/\s+/g, " ").trim() }));
const canWrite = (block) => allowLines(block).some((a) => a.cond !== "false" && a.ops.some((o) => ["write", "create", "update", "delete"].includes(o)));

// ---- the floor: anything not named is closed ---------------------------------------------------------------------

test("the last rule closes every collection that is not named above it", () => {
  const catchAll = all.get("{document=**}");
  assert.ok(catchAll, "a catch-all exists");
  assert.deepEqual(allowLines(catchAll), [{ ops: ["read", "write"], cond: "false" }]);
  assert.ok(rules.lastIndexOf("match /{document=**}") > rules.lastIndexOf("match /shift_swaps/"), "and it is last");
  assert.ok(collections.length >= 30, "the rules still name the collections they should");
});

test("the rules use the verified token for who someone is, never a field a user can edit", () => {
  assert.doesNotMatch(rules, /request\.resource\.data\.role\b(?!s)/);
  assert.doesNotMatch(rules, /resource\.data\.role\b(?!s)/);
  assert.match(rules, /function role\(\) \{\s*return isSignedIn\(\) \? request\.auth\.token\.role : null;/);
  assert.match(rules, /function orgId\(\) \{\s*return isSignedIn\(\) \? request\.auth\.token\.orgId : null;/);
});

test("the only rule that says 'if true' is the tablet's live-greeting document, and only to read one", () => {
  const trues = [];
  for (const [name, block] of all) for (const a of allowLines(block)) if (a.cond === "true") trues.push(`${name}:${a.ops.join(",")}`);
  assert.deepEqual(trues, ["kiosk_channels:get"]);
});

// ---- secrets and server-only records stay closed --------------------------------------------------------------------

/** Collections that hold credentials, secrets or server-only working data: no browser access at all. */
const LOCKED = [
  "kiosks", "kiosk_pairings", "staff_invites", "rate_limits", "push_subscriptions", "in_app_notifications",
  "notification_preferences", "problem_reports", "problem_report_files", "recent_scans",
  "wfh_diary_sessions", "wfh_diary_intervals", "wfh_diary_days", "diary_consents",
];

test("credentials, invites, pairings, push keys, diary records and rate limits cannot be read or written from a browser", () => {
  for (const name of LOCKED) {
    const block = all.get(name);
    assert.ok(block, `${name} is named in the rules`);
    assert.deepEqual(allowLines(block), [{ ops: ["read", "write"], cond: "false" }], name);
  }
});

// ---- who can write from a browser ----------------------------------------------------------------------------------------

/** The only collections a browser may write to, with why. Adding one here needs a reviewer to accept the reason. */
const BROWSER_WRITES = new Map([
  ["users", "a person edits their own display profile only (allowed-fields check)"],
  ["leave_requests", "an employee asks; a manager decides; every field is checked"],
  ["holidays", "the org admin keeps the holiday list; every field is checked and the organization cannot change"],
  ["user_devices", "a person records and revokes their own sign-in devices"],
]);

test("the browser may write to exactly four collections, each named with a reason", () => {
  const writable = collections.filter((c) => canWrite(all.get(c))).sort();
  assert.deepEqual(writable, [...BROWSER_WRITES.keys()].sort());
});

test("organizations, announcements and locations are read-only in the browser: the server checks every write", () => {
  for (const name of ["organizations", "announcements", "locations"]) {
    const block = all.get(name);
    assert.ok(allowLines(block).some((a) => a.ops.includes("read") && /(inOrg\(resource\.data\)|orgId\(\) == targetOrgId)/.test(a.cond)), `${name} can still be read inside the organization`);
    assert.equal(canWrite(block), false, `${name} cannot be written from a browser`);
    assert.ok(allowLines(block).some((a) => a.ops.join() === "create,update,delete" && a.cond === "false"), name);
  }
});

test("the app never writes to organizations, announcements or locations from the browser", () => {
  const files = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = `${dir}/${n}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p) && !p.includes("/routes/api/") && !p.includes(".server.")) files.push(p);
    }
  };
  walk("src");
  for (const p of files) {
    const src = readFileSync(p, "utf8");
    assert.doesNotMatch(src, /(addDoc|setDoc|updateDoc|deleteDoc)\([^)]*["'](organizations|announcements|locations)["']/, p);
    assert.doesNotMatch(src, /collection\(firestoreDb,\s*["'](announcements|locations)["']\)[\s\S]{0,40}(addDoc|setDoc)/, p);
  }
});

test("every update rule in a browser-writable collection limits which fields can change, or who and what", () => {
  const limited = {
    users: /affectedKeys\(\)\.hasOnly\(/,
    leave_requests: /affectedKeys\(\)\.hasOnly\(/,
    holidays: /request\.resource\.data\.orgId == resource\.data\.orgId/,
    user_devices: /resource\.data\.user_id == request\.auth\.uid/,
  };
  for (const [name, check] of Object.entries(limited)) {
    const updates = allowLines(all.get(name)).filter((a) => a.ops.includes("update") && a.cond !== "false");
    assert.ok(updates.length > 0, `${name} has an update rule`);
    for (const u of updates) assert.match(u.cond, check, `${name} update`);
  }
});

test("creating a person's profile or a leave request cannot set tenancy, team or role", () => {
  const users = allowLines(all.get("users")).find((a) => a.ops.includes("create"));
  assert.match(users.cond, /keys\(\)\.hasOnly\(\["id", "email", "displayName", "photoURL", "createdAt", "updatedAt"\]\)/);
  const leave = allowLines(all.get("leave_requests")).find((a) => a.ops.includes("create"));
  assert.match(leave.cond, /status == "pending"/);
  assert.match(leave.cond, /employeeId == request\.auth\.uid/);
  assert.match(leave.cond, /managerId == managerId\(\)/);
  assert.match(leave.cond, /keys\(\)\.hasOnly\(/);
});

// ---- who can read -------------------------------------------------------------------------------------------------------

/** Reads that are not "inside my organization": the person's own record, or a deliberate exception. */
const READ_NOT_BY_ORG = new Map([
  ["users", "the person themselves, plus the org admin and manager inside the organization"],
  ["user_devices", "the person's own devices"],
  ["organizations", "members of that organization, matched by the id in the token"],
  ["kiosk_channels", "the tablet's single live-greeting document, by its secret address"],
]);

test("every readable collection is limited to the organization first (or is one of four named exceptions)", () => {
  for (const name of collections) {
    const block = all.get(name);
    if (LOCKED.includes(name)) continue;
    const reads = allowLines(block).filter((a) => a.ops.some((o) => ["read", "get", "list"].includes(o)) && a.cond !== "false");
    for (const r of reads) {
      if (READ_NOT_BY_ORG.has(name)) continue;
      assert.match(r.cond, /inOrg\(/, `${name}: a read must start with the organization`);
    }
  }
});

test("a manager's reads are limited to their own team wherever the records belong to a team", () => {
  for (const name of ["clock_events", "daily_summaries", "late_excuses", "leave_requests", "shift_assignments", "wfh_days", "shift_patterns", "refused_scans"]) {
    const read = allowLines(all.get(name)).find((a) => a.ops.includes("read"));
    assert.match(read.cond, /isManager\(\) && resource\.data\.managerId == request\.auth\.uid/, name);
  }
});

test("records made by the server cannot be created, changed or deleted from a browser", () => {
  const SERVER_ONLY = ["clock_events", "daily_summaries", "late_excuses", "team_changes", "shifts", "shift_assignments", "wfh_days", "shift_patterns", "shift_swaps", "refused_scans"];
  for (const name of SERVER_ONLY) {
    assert.equal(canWrite(all.get(name)), false, name);
  }
});
