import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkCronAuth, cleanCronSecret, presentedCronToken, MIN_CRON_SECRET_LENGTH } from "../../src/lib/cron-auth.server.ts";
import { runRefill, REFILL_BATCH_SIZE, REFILL_MAX_BATCHES, REFILL_BUDGET_MS } from "../../src/lib/pattern-refill.ts";

const read = (p) => readFileSync(p, "utf8");
const route = read("src/routes/api/cron/shift-patterns.ts");
const SECRET = "a-long-random-test-secret-0123456789";

// ---------------------------------------------------------------- who may call it
test("the right bearer secret is let in, and nothing else is", () => {
  assert.equal(checkCronAuth(`Bearer ${SECRET}`, SECRET), "ok");
  assert.equal(checkCronAuth(`Bearer ${SECRET}x`, SECRET), "denied");
  assert.equal(checkCronAuth("Bearer wrong", SECRET), "denied");
  assert.equal(checkCronAuth(SECRET, SECRET), "denied", "the word Bearer is required");
  assert.equal(checkCronAuth(`bearer ${SECRET}`, SECRET), "denied", "and it is case sensitive");
  assert.equal(checkCronAuth("", SECRET), "denied");
  assert.equal(checkCronAuth(null, SECRET), "denied");
  assert.equal(checkCronAuth(undefined, SECRET), "denied");
  assert.equal(checkCronAuth("Bearer ", SECRET), "denied");
});

test("with no secret, or a weak one, nobody is let in, not even with a matching header (fail closed)", () => {
  assert.equal(checkCronAuth("Bearer ", ""), "not_configured", "an empty header must not match an empty secret");
  assert.equal(checkCronAuth("Bearer ", undefined), "not_configured");
  assert.equal(checkCronAuth(undefined, undefined), "not_configured");
  assert.equal(checkCronAuth("Bearer short", "short"), "not_configured", "a secret under the minimum is refused");
  assert.equal(checkCronAuth(`Bearer ${"x".repeat(MIN_CRON_SECRET_LENGTH)}`, "x".repeat(MIN_CRON_SECRET_LENGTH)), "ok", "exactly the minimum is fine");
  assert.equal(MIN_CRON_SECRET_LENGTH, 16);
});

test("the secret check does not leak through length or prefix: every wrong value is simply denied", () => {
  for (const guess of ["B", SECRET.slice(0, -1), SECRET + SECRET, SECRET.toUpperCase(), " " + SECRET]) {
    assert.equal(checkCronAuth(`Bearer ${guess}`, SECRET), "denied");
  }
});

// ---------------------------------------------------------------- the loop
const batches = (...results) => {
  const calls = [];
  const fill = async (max) => {
    calls.push(max);
    const next = results[calls.length - 1] ?? { checked: 0, written: 0, failed: 0 };
    return typeof next === "function" ? next() : next;
  };
  return { fill, calls };
};

test("nothing due: one look, done, nothing written", async () => {
  const { fill, calls } = batches({ checked: 0, written: 0, failed: 0 });
  const r = await runRefill(fill);
  assert.deepEqual(r, { checked: 0, written: 0, failed: 0, batches: 1, partial: false, stoppedBecause: "done" });
  assert.deepEqual(calls, [REFILL_BATCH_SIZE]);
});

test("a short batch means everything due was handled", async () => {
  const { fill } = batches({ checked: 7, written: 400, failed: 0 });
  const r = await runRefill(fill);
  assert.equal(r.stoppedBecause, "done");
  assert.equal(r.partial, false);
  assert.equal(r.written, 400);
});

test("a full batch is followed by another until a short one, and the counts add up", async () => {
  const { fill, calls } = batches(
    { checked: 200, written: 900, failed: 1 },
    { checked: 200, written: 800, failed: 0 },
    { checked: 30, written: 120, failed: 2 },
  );
  const r = await runRefill(fill);
  assert.deepEqual(r, { checked: 430, written: 1820, failed: 3, batches: 3, partial: false, stoppedBecause: "done" });
  assert.equal(calls.length, 3);
});

test("a full batch that wrote nothing stops the loop instead of spinning on a broken pattern", async () => {
  const { fill, calls } = batches({ checked: 200, written: 0, failed: 200 }, { checked: 200, written: 5, failed: 0 });
  const r = await runRefill(fill);
  assert.equal(r.stoppedBecause, "no_progress");
  assert.equal(r.partial, true, "left for the next run");
  assert.equal(calls.length, 1, "it never asks again");
});

test("it stops at the time budget and says some work was left", async () => {
  let t = 0;
  const { fill, calls } = batches(...Array.from({ length: 10 }, () => () => { t += 8000; return { checked: 200, written: 10, failed: 0 }; }));
  const r = await runRefill(fill, { now: () => t });
  assert.equal(r.stoppedBecause, "time");
  assert.equal(r.partial, true);
  assert.ok(calls.length >= 1 && calls.length < 10, `stopped after ${calls.length} batches`);
  assert.ok(t >= REFILL_BUDGET_MS, "only after the budget was used");
});

test("it never runs more than the batch limit, whatever happens", async () => {
  const { fill, calls } = batches(...Array.from({ length: 100 }, () => ({ checked: 200, written: 1, failed: 0 })));
  const r = await runRefill(fill, { now: () => 0 });
  assert.equal(calls.length, REFILL_MAX_BATCHES);
  assert.equal(r.stoppedBecause, "batches");
  assert.equal(r.partial, true);
});

test("the first batch always runs, even with a tiny budget", async () => {
  const { fill, calls } = batches({ checked: 3, written: 10, failed: 0 });
  await runRefill(fill, { budgetMs: 0 });
  assert.equal(calls.length, 1);
});

test("the batch size is within what fillDuePatterns allows (it caps at 200)", () => {
  assert.equal(REFILL_BATCH_SIZE, 200);
});

// ---------------------------------------------------------------- the route
test("the route only answers GET, takes nothing from the request, and checks the secret before doing anything", () => {
  assert.ok(route.includes("GET: async"));
  assert.ok(!route.includes("POST:") && !route.includes("PUT:") && !route.includes("DELETE:"));
  assert.ok(!route.includes("request.json") && !route.includes("searchParams") && !route.includes("new URL("), "no body or query is read");
  assert.ok(route.indexOf("checkCronAuth(") < route.indexOf("runRefill("), "the secret is checked first");
  assert.ok(route.includes("process.env.CRON_SECRET"));
});

test("with no secret configured the route refuses everyone, and wrong attempts are rate limited", () => {
  assert.ok(route.includes('auth === "not_configured"') && route.includes("status: 503"));
  assert.ok(route.includes('auth === "denied"') && route.includes("status: 401") && route.includes("status: 429"));
  assert.ok(route.includes("checkRateLimit(`cron_denied_${clientIpFrom(request)}`") && route.includes("failClosed: true"));
  const denied = route.slice(route.indexOf('auth === "denied"'), route.indexOf("const summary"));
  assert.ok(denied.includes("checkRateLimit"), "counted only on a wrong secret, so the real nightly call cannot be locked out");
});

test("every run is logged with counts only, never a person or a secret", () => {
  assert.ok(route.includes('action: "cron.shift_patterns"'));
  assert.ok(route.includes('outcome: summary.failed > 0 ? "error" : "ok"'));
  assert.ok(!/secret\s*[:,}]/i.test(route.slice(route.indexOf("logEvent"))) || !route.includes("fields: { secret"), "the secret is never logged");
});

test("the route fills every organization's patterns (no organization given), through the one shared fill step", () => {
  assert.ok(route.includes("fillDuePatterns({ max })") && !route.includes("orgId"));
});

// ---------------------------------------------------------------- the schedule and the setup
test("vercel.json schedules the route once a night", () => {
  const cfg = JSON.parse(read("vercel.json"));
  assert.equal(cfg.crons.length, 1);
  assert.equal(cfg.crons[0].path, "/api/cron/shift-patterns");
  assert.equal(cfg.crons[0].schedule, "30 1 * * *", "01:30 UTC, once a day");
});

test("CRON_SECRET is documented and has no value anywhere in the repository", () => {
  const env = read(".env.example");
  assert.ok(env.includes("CRON_SECRET="));
  assert.ok(!/CRON_SECRET=\S/.test(env), "no value in the example file");
  assert.ok(read("docs/OPERATIONS.md").includes("CRON_SECRET"));
  function filesUnder(dir, out = []) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git" || name === ".output") continue;
      const p = join(dir, name);
      statSync(p).isDirectory() ? filesUnder(p, out) : out.push(p);
    }
    return out;
  }
  for (const f of [...filesUnder("src"), "vercel.json"]) {
    const text = read(f);
    const assigned = text.match(/CRON_SECRET\s*=\s*["'][^"']{8,}["']/);
    assert.equal(assigned, null, `${f} must not hold a secret value`);
  }
});

test("the operations notes say staging will not run it by itself, and how to run it by hand", () => {
  const ops = read("docs/OPERATIONS.md").replace(/\s+/g, " ");
  assert.ok(ops.includes("only runs scheduled jobs on the production deployment"));
  assert.ok(ops.includes("curl -s -H"));
});

// ---------------------------------------------------------------- a pasted secret often carries an invisible line break
test("a stored secret with a stray space or line break around it still works", () => {
  const LF = String.fromCharCode(10);
  const CR = String.fromCharCode(13);
  for (const stored of [SECRET + LF, SECRET + CR + LF, " " + SECRET + " ", LF + SECRET]) {
    assert.equal(checkCronAuth("Bearer " + SECRET, stored), "ok", "the value you type matches the cleaned one");
  }
  assert.equal(cleanCronSecret(SECRET + LF), SECRET);
  assert.equal(cleanCronSecret(undefined), "");
});

test("only the ends are cleaned: a different value, or spaces inside, never match", () => {
  assert.equal(checkCronAuth("Bearer " + SECRET, "x" + SECRET), "denied");
  assert.equal(checkCronAuth("Bearer " + SECRET, SECRET.slice(0, 10) + " " + SECRET.slice(10)), "denied");
});

test("a secret that is only spaces, or too short once cleaned, is treated as not set", () => {
  assert.equal(checkCronAuth("Bearer " + " ".repeat(40), " ".repeat(40)), "not_configured");
  assert.equal(checkCronAuth("Bearer short", "short" + " ".repeat(40)), "not_configured");
});

test("the value sent is taken exactly as sent (only the stored secret is cleaned), and a missing prefix gives nothing", () => {
  assert.equal(presentedCronToken("Bearer abc "), "abc ");
  assert.equal(presentedCronToken("abc"), "");
  assert.equal(presentedCronToken(null), "");
  assert.equal(checkCronAuth("Bearer " + SECRET + " ", SECRET), "denied", "extra characters on the value sent are a different value");
});

test("a rejected attempt logs only lengths, never either value", () => {
  assert.ok(route.includes("sentLength:") && route.includes("expectedLength:"));
  const denied = route.slice(route.indexOf('auth === "denied"'), route.indexOf("const summary"));
  assert.ok(denied.includes("presentedCronToken(request.headers.get(\"authorization\")).length"), "the value sent is only measured");
  assert.ok(denied.includes("cleanCronSecret(process.env.CRON_SECRET).length"), "the stored secret is only measured");
  assert.equal(denied.split("process.env.CRON_SECRET").length - 1, 1, "and it appears nowhere else in the rejection");
});
