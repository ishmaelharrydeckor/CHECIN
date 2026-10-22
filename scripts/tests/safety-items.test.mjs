import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDefaultTimezone, timezoneNeedsConfirmation, timezoneNoticeText } from "../../src/lib/timezone-check.ts";
import { ALERT_REPEAT_WINDOW_MS, buildAlertBody, parseAlertUrl, sendAlert, shouldAlert } from "../../src/lib/alert.server.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ---------------------------------------------------------------- timezone confirmation (issue #25)
test("a missing or plain-UTC timezone that nobody confirmed needs confirming", () => {
  for (const tz of [undefined, null, "", "  ", "UTC", "utc", "Etc/UTC", "GMT", "Etc/GMT", 42]) {
    assert.equal(timezoneNeedsConfirmation(tz, undefined), true, String(tz));
    assert.equal(timezoneNeedsConfirmation(tz, false), true, `${String(tz)} with confirmed=false`);
  }
});

test("a timezone someone chose never needs confirming, even one that matches UTC today", () => {
  for (const tz of ["Africa/Accra", "Africa/Lagos", "Europe/London", "America/New_York", "Asia/Kolkata"]) {
    assert.equal(timezoneNeedsConfirmation(tz, undefined), false, tz);
  }
});

test("once an admin has confirmed UTC, the warning is gone for good", () => {
  assert.equal(timezoneNeedsConfirmation("UTC", true), false);
  assert.equal(timezoneNeedsConfirmation(undefined, true), false);
  assert.equal(timezoneNeedsConfirmation("UTC", "true"), true, "only a real true counts");
});

test("the notice names the timezone and says what goes wrong", () => {
  const text = timezoneNoticeText("UTC");
  assert.ok(text.includes("UTC") && /late/.test(text) && /today/.test(text) && /report/.test(text));
  assert.ok(timezoneNoticeText(undefined).includes("UTC"));
  assert.equal(isDefaultTimezone("Africa/Accra"), false);
});

const orgRoute = read("src/routes/api/organization/index.ts");
const signup = read("src/routes/api/auth/register-org.ts");
const settings = read("src/routes/_authenticated/settings.tsx");
const dash = read("src/routes/_authenticated/dashboard.tsx");

test("the organization answer says whether the timezone needs confirming, using the shared rule", () => {
  assert.ok(orgRoute.includes("timezoneNeedsConfirmation(data?.timezone, data?.timezoneConfirmed)"));
});

test("only an admin saving a valid timezone confirms it, on the server", () => {
  assert.ok(orgRoute.includes('caller.role !== "org_admin"'), "the update is admin only");
  const patch = orgRoute.slice(orgRoute.indexOf("PATCH:"));
  assert.ok(patch.indexOf("isValidTimezone(timezone)") < patch.indexOf("updates.timezoneConfirmed = true"), "only after the zone is checked");
  assert.ok(!/body\??\.timezoneConfirmed/.test(orgRoute), "the client cannot send the confirmation flag itself");
});

test("a timezone chosen at sign-up counts as confirmed; the default UTC does not", () => {
  assert.ok(signup.includes('timezoneConfirmed: Boolean(String(body?.timezone || "").trim())'));
});

test("admins see the warning on the dashboard and in Settings, and nobody else", () => {
  assert.ok(dash.includes("{isOrgAdmin && timezoneToConfirm && <TimezoneNotice"));
  assert.ok(dash.includes("orgData.organization.timezoneNeedsConfirmation === true"));
  assert.ok(settings.includes("isOrgAdmin && orgDetails.timezoneNeedsConfirmation"));
  assert.ok(settings.includes("onConfirm={() => void confirmTimezone()}"));
});

// ---------------------------------------------------------------- error alerts (issue #24)
test("only a valid https address turns alerts on", () => {
  assert.equal(parseAlertUrl("https://hooks.example.com/services/abc"), "https://hooks.example.com/services/abc");
  for (const bad of ["", "   ", undefined, null, "http://hooks.example.com/x", "ftp://x.y/z", "javascript:alert(1)", "not a url", "//hooks.example.com"]) {
    assert.equal(parseAlertUrl(bad), null, String(bad));
  }
});

test("the same kind of error is reported once per window, a different kind at once, and again after the window", () => {
  const seen = new Map();
  assert.equal(shouldAlert(seen, "scan.record", 1_000), true);
  assert.equal(shouldAlert(seen, "scan.record", 2_000), false);
  assert.equal(shouldAlert(seen, "kiosk.token", 2_000), true);
  assert.equal(shouldAlert(seen, "scan.record", 1_000 + ALERT_REPEAT_WINDOW_MS - 1), false);
  assert.equal(shouldAlert(seen, "scan.record", 1_000 + ALERT_REPEAT_WINDOW_MS), true);
});

test("the memory of what was reported cannot grow without limit", () => {
  const seen = new Map();
  for (let i = 0; i < 500; i++) shouldAlert(seen, `action.${i}`, i);
  shouldAlert(seen, "one.more", 10 * ALERT_REPEAT_WINDOW_MS);
  assert.ok(seen.size <= 201);
});

test("the message says what failed and how to find it, and nothing secret", () => {
  const body = buildAlertBody(
    { action: "scan.record", correlationId: "iad1::abc-123", orgId: "org_9", fields: { reason: "read_error", count: 3, kioskSecret: "hunter2", idToken: "abc", email: "a@b.c", dayKey: "2026-10-22" } },
    "production",
  );
  assert.ok(body.text.startsWith("[ChecIN production] error in scan.record"));
  assert.ok(body.text.includes("organization org_9") && body.text.includes("iad1::abc-123"));
  assert.ok(body.text.includes("reason=read_error") && body.text.includes("count=3"));
  for (const secret of ["hunter2", "abc\"", "a@b.c", "idToken", "kioskSecret", "dayKey"]) assert.ok(!body.text.includes(secret), `no ${secret}`);
  assert.equal(body.content, body.text, "Discord reads content, Slack and Teams read text");
});

test("the message is cut to a fixed length", () => {
  const body = buildAlertBody({ action: "x", correlationId: "c", fields: { reason: "y".repeat(5000) } }, "preview");
  assert.ok(body.text.length <= 800);
});

test("sending never throws: a failing, slow or refused webhook only returns false", async () => {
  const msg = { text: "t", content: "t" };
  assert.equal(await sendAlert("https://h.example/x", msg, async () => ({ ok: true })), true);
  assert.equal(await sendAlert("https://h.example/x", msg, async () => ({ ok: false })), false);
  assert.equal(await sendAlert("https://h.example/x", msg, async () => { throw new Error("network"); }), false);
  const slow = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  assert.equal(await sendAlert("https://h.example/x", msg, slow, 20), false, "a hung webhook is given up on");
});

const logSrc = read("src/lib/log.server.ts");
const alertSrc = read("src/lib/alert.server.ts");

test("every logged error reaches the alert, and a normal line never does", () => {
  const fn = logSrc.slice(logSrc.indexOf("export function logEvent"));
  assert.ok(fn.includes('if (entry.outcome === "error") {') && fn.includes("alertOnError(entry);"));
  assert.ok(fn.indexOf("alertOnError") < fn.indexOf("else console.log(line)"), "only in the error branch");
});

test("alerts are off unless the setting is a valid https address, and are fire-and-forget", () => {
  const fn = alertSrc.slice(alertSrc.indexOf("export function alertOnError"));
  assert.ok(fn.includes("parseAlertUrl(process.env.ALERT_WEBHOOK_URL)") && fn.includes("if (!url) return;"));
  assert.ok(fn.includes("void sendAlert(") && !/await sendAlert/.test(fn), "the request never waits for the alert");
  assert.ok(fn.includes("catch {"), "and an alert can never break the request that caused it");
});

test("the setting is documented, empty by default, and holds no value in the repository", () => {
  const env = read(".env.example");
  assert.ok(env.includes("ALERT_WEBHOOK_URL="));
  assert.ok(!/ALERT_WEBHOOK_URL=\S/.test(env), "empty means off");
});

test("the runbook says how to turn on backups, check usage, run the load test and set the alert", () => {
  const ops = read("docs/OPERATIONS.md");
  for (const text of ["--enable-pitr", "backups schedules create", "Usage tab", "scripts/load-test.mjs", "ALERT_WEBHOOK_URL", "timezoneConfirmed"]) {
    assert.ok(ops.includes(text), text);
  }
});

test("backups and the budget alert are in the backlog with when to do them, and the runbook points to it", () => {
  const backlog = read("docs/BACKLOG.md");
  assert.ok(backlog.includes("### B4. Backups, point-in-time recovery and a budget alert"));
  assert.ok(/B4[\s\S]*Do it when:\*\* before the first paying customer/.test(backlog));
  assert.ok(read("docs/OPERATIONS.md").includes("in the backlog as B4"));
});
