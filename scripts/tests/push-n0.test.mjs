import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pushConfigProblem, subscriptionOwnerFromClaims } from "../../src/lib/push-rules.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ---- configuration ----------------------------------------------------------------------------

test("push is reported as not set up when a key is missing", () => {
  assert.match(pushConfigProblem({}), /VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY/);
  assert.match(pushConfigProblem({ VAPID_PUBLIC_KEY: "a" }), /VAPID_PRIVATE_KEY/);
  assert.match(pushConfigProblem({ VAPID_PRIVATE_KEY: "b" }), /VAPID_PUBLIC_KEY/);
  assert.match(pushConfigProblem({ VAPID_PUBLIC_KEY: "  ", VAPID_PRIVATE_KEY: "b" }), /VAPID_PUBLIC_KEY/);
});

test("push is fine with both keys, with or without a contact subject", () => {
  assert.equal(pushConfigProblem({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" }), null);
  assert.equal(
    pushConfigProblem({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: "mailto:ops@example.com" }),
    null,
  );
});

test("a contact subject that is not mailto: or https:// is refused", () => {
  assert.match(
    pushConfigProblem({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: "ops@example.com" }),
    /VAPID_SUBJECT/,
  );
});

// ---- who a subscription belongs to ------------------------------------------------------------

test("the owner of a subscription comes from the token claims", () => {
  assert.deepEqual(
    subscriptionOwnerFromClaims({ uid: "u1", role: "manager", orgId: "orgA", managerId: "u1" }),
    { userId: "u1", userRole: "manager", orgId: "orgA", managerId: "u1" },
  );
});

test("an unknown or missing role is treated as employee, never as staff", () => {
  assert.equal(subscriptionOwnerFromClaims({ uid: "u", role: "superadmin" }).userRole, "employee");
  assert.equal(subscriptionOwnerFromClaims({ uid: "u" }).userRole, "employee");
});

test("claims that are not text are ignored", () => {
  const o = subscriptionOwnerFromClaims({ uid: "u", orgId: { $ne: 1 }, managerId: 7 });
  assert.equal(o.orgId, null);
  assert.equal(o.managerId, null);
});

// ---- the server routes ------------------------------------------------------------------------

const subscribe = read("src/routes/api/push/subscribe.ts");
const service = read("src/lib/push-service.server.ts");

test("unsubscribing passes the endpoint first and the caller second", () => {
  assert.ok(subscribe.includes("removePushSubscription(endpoint, caller.uid)"));
  assert.ok(!subscribe.includes("removePushSubscription(caller.uid, endpoint)"), "the swapped call is gone");
});

test("an unsubscribe that is not the caller's own is refused, not reported as success", () => {
  const del = subscribe.slice(subscribe.indexOf("DELETE:"));
  assert.ok(/if \(!removed\)[\s\S]{0,200}403/.test(del));
});

test("subscribing takes orgId and managerId from the token, not from the request", () => {
  assert.ok(subscribe.includes("subscriptionOwnerFromClaims(caller)"));
  const post = subscribe.slice(subscribe.indexOf("POST:"), subscribe.indexOf("DELETE:"));
  assert.ok(!/device\??\.(orgId|managerId)/.test(post), "no org or manager read from the device object");
  assert.ok(!post.includes("userContext"), "no identity read from userContext");
});

test("subscribing is limited per signed-in person, not per shared office address", () => {
  assert.ok(subscribe.includes("push_sub_${caller.uid}"));
  assert.ok(!subscribe.includes("clientIpFrom"));
});

test("the device details type no longer carries orgId or managerId", () => {
  const deviceInfo = service.slice(service.indexOf("deviceInfo: {"), service.indexOf("} = {},"));
  assert.ok(!/orgId|managerId/.test(deviceInfo));
});

test("a server without push keys says so plainly instead of staying quiet", () => {
  assert.ok(service.includes("pushConfigProblem"));
  assert.ok(subscribe.includes("pushNotConfigured"));
  assert.ok(read("src/routes/api/push/vapid-key.ts").includes("pushNotConfigured"));
});

// ---- announcements are sent in the background, safely ------------------------------------------

test("announcement sends are kept alive until they finish", () => {
  const ann = read("src/routes/api/announcements/index.ts");
  assert.ok(ann.includes("runInBackground("));
  assert.ok(!/sendNotificationTo(Org|Team)\([^)]*\)\.catch\(\(\) => \{\}\)/.test(ann), "no fire-and-forget send");
  const helper = read("src/lib/background.server.ts");
  assert.ok(helper.includes("waitUntil"));
  assert.ok(helper.includes("console.error"), "a failed send is logged, not swallowed");
});

// ---- the browser side -------------------------------------------------------------------------

test("every browser call to a push route sends the signed-in person's token", () => {
  for (const file of ["src/lib/push-client.ts", "src/components/PushNotificationManager.tsx"]) {
    const src = read(file);
    const parts = src.split("fetch(");
    let checked = 0;
    for (let i = 1; i < parts.length; i++) {
      const call = parts[i];
      if (!/^\s*[`"']\/api\/push\//.test(call)) continue;
      // The public key is deliberately open (it is not secret); every other push route needs the token.
      if (/^\s*[`"']\/api\/push\/vapid-key/.test(call)) continue;
      // The token may be built just before the call (`headers`) or inline in it.
      const around = parts[i - 1].slice(-500) + call.slice(0, 600);
      assert.ok(around.includes("authHeaders"), `${file}: a push call is missing the token`);
      checked++;
    }
    assert.ok(checked > 0, `${file} calls a push route`);
  }
});

test("the browser no longer sends a user id to the inbox or preferences routes", () => {
  const mgr = read("src/components/PushNotificationManager.tsx");
  assert.ok(!mgr.includes("?userId="), "no userId in query strings");
  const calls = mgr
    .split("fetch(")
    .slice(1)
    .filter((c) => /^\s*"\/api\/push\/(notifications|preferences)"/.test(c));
  assert.ok(calls.length >= 4, "the inbox and preferences calls are all checked");
  for (const c of calls) {
    const body = c.slice(0, 400).match(/body: JSON\.stringify\(([^)]*)\)/);
    if (body) assert.ok(!body[1].includes("userId"), "no userId sent to the inbox or preferences routes");
  }
});

test("signing out switches this phone off for that person first", () => {
  const shell = read("src/components/AppShell.tsx");
  const out = shell.slice(shell.indexOf("const handleSignOut"), shell.indexOf("const handleSignOut") + 500);
  assert.ok(out.indexOf("deactivateThisDeviceOnServer") > -1);
  assert.ok(out.indexOf("deactivateThisDeviceOnServer") < out.indexOf("fbSignOut"));

  const account = read("src/routes/_authenticated/account.tsx");
  const acct = account.slice(account.indexOf("const handleSignOut"), account.indexOf("const handleSignOut") + 300);
  assert.ok(acct.indexOf("deactivateThisDeviceOnServer") > -1);
  assert.ok(acct.indexOf("deactivateThisDeviceOnServer") < acct.indexOf("fbSignOut"));
});

test("signing in re-attaches an already-allowed phone to the new person", () => {
  const shell = read("src/components/AppShell.tsx");
  assert.ok(shell.includes("syncPushSubscriptionOnLogin"));
});

test("employees can reach the switch: the Account page offers notifications", () => {
  const account = read("src/routes/_authenticated/account.tsx");
  assert.ok(account.includes("<PushNotificationManager"));
});
