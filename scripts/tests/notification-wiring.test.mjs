import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  screenTypeFrom,
  formatNotificationTime,
  notificationFromRow,
  prefsFromServer,
  prefsToServer,
} from "../../src/lib/notifications.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ---- what the server saved becomes what the screens show --------------------------------------

test("server types become screen types; anything unknown is a plain system notice", () => {
  assert.equal(screenTypeFrom("ANNOUNCEMENT"), "ANNOUNCEMENT");
  assert.equal(screenTypeFrom("ATTENDANCE"), "SYSTEM");
  assert.equal(screenTypeFrom("TEST"), "SYSTEM");
  assert.equal(screenTypeFrom("SYSTEM"), "SYSTEM");
  assert.equal(screenTypeFrom("LEAVE"), "LEAVE");
  assert.equal(screenTypeFrom("SHIFT"), "SHIFT");
  assert.equal(screenTypeFrom("REPORT"), "REPORT");
  assert.equal(screenTypeFrom("ACCOUNT"), "ACCOUNT");
  assert.equal(screenTypeFrom("<script>"), "SYSTEM");
  assert.equal(screenTypeFrom(undefined), "SYSTEM");
});

test("times are written in the organization's timezone, never the device's", () => {
  const iso = "2026-11-05T23:30:00.000Z";
  assert.equal(formatNotificationTime(iso, "UTC"), "5 Nov, 23:30");
  assert.equal(formatNotificationTime(iso, "Africa/Accra"), "5 Nov, 23:30");
  assert.equal(formatNotificationTime(iso, "Africa/Lagos"), "6 Nov, 00:30");
  assert.equal(formatNotificationTime(iso, "Not/AZone"), "5 Nov, 23:30", "a bad timezone falls back to UTC");
  assert.equal(formatNotificationTime("garbage", "UTC"), "");
  assert.equal(formatNotificationTime(undefined, "UTC"), "");
});

test("a saved row becomes a screen item, with safe defaults", () => {
  const item = notificationFromRow(
    { id: "n1", type: "ANNOUNCEMENT", title: "Hello", body: "World", url: "/announcements", isRead: false, createdAt: "2026-11-05T08:00:00.000Z" },
    "UTC",
  );
  assert.deepEqual(item, {
    id: "n1",
    type: "ANNOUNCEMENT",
    title: "Hello",
    body: "World",
    url: "/announcements",
    createdAt: "2026-11-05T08:00:00.000Z",
    createdAtLabel: "5 Nov, 08:00",
    isRead: false,
  });
  const bare = notificationFromRow({ id: "n2" }, "UTC");
  assert.equal(bare.title, "Notification");
  assert.equal(bare.body, "");
  assert.equal(bare.url, "/notifications");
  assert.equal(bare.isRead, false);
  assert.equal(notificationFromRow({ title: "no id" }, "UTC"), null, "a row with no id is dropped");
});

test("a link that leaves the app is never kept", () => {
  assert.equal(notificationFromRow({ id: "x", url: "https://evil.example" }, "UTC").url, "/notifications");
  assert.equal(notificationFromRow({ id: "x", url: "//evil.example" }, "UTC").url, "/notifications");
});

// ---- preferences: the screen's switches and the server's saved keys ---------------------------

test("saved preferences become the card's switches, with everything on by default", () => {
  assert.deepEqual(prefsFromServer(undefined), { pushEnabled: true, announcements: true, leave: true, shifts: true, account: true });
  assert.deepEqual(
    prefsFromServer({ pushEnabled: false, announcements: false, leave: false, shifts: true, account: false, attendance: false, system: false }),
    { pushEnabled: false, announcements: false, leave: false, shifts: true, account: false },
  );
  assert.equal(prefsFromServer({ announcements: "no" }).announcements, true, "only real false switches off");
});

test("only the card's own keys are sent back to be saved", () => {
  assert.deepEqual(prefsToServer({ pushEnabled: true, announcements: false, leave: true, shifts: true, account: true, userId: "x", evil: 1 }), {
    pushEnabled: true,
    announcements: false,
    leave: true,
    shifts: true,
    account: true,
  });
});

// ---- the wiring itself ------------------------------------------------------------------------

test("the screens read real data and the sample file is gone from the hook", () => {
  const hook = read("src/components/notifications/useNotifications.ts");
  assert.ok(!/notifications-sample/.test(hook));
  assert.ok(hook.includes("/api/push/notifications"));
  assert.ok(hook.includes("/api/push/preferences"));
  assert.ok(hook.includes("authHeaders"), "every call carries the signed-in person's token");
  assert.ok(!/userId/.test(hook), "no user id is sent");
  assert.ok(!/setInterval/.test(hook), "no timer");
});

test("both temporary notification previews are gone", () => {
  assert.ok(!existsSync("src/routes/notifications-preview.tsx"));
  assert.ok(!existsSync("src/lib/notifications-sample.ts"));
});

test("the shell has the new bell, a menu entry and no old bell", () => {
  const shell = read("src/components/AppShell.tsx");
  assert.ok(shell.includes("<NotificationBell"));
  assert.ok(!shell.includes("InAppNotificationCenter"));
  assert.ok(shell.includes('to: "/notifications"'));
});

test("the Account page has the new cards and no old push card", () => {
  const acc = read("src/routes/_authenticated/account.tsx");
  assert.ok(acc.includes("<NotificationPreferencesCard"));
  assert.ok(acc.includes("<ThisDeviceCard"));
  assert.ok(!acc.includes("<PushNotificationManager"));
});

test("the inbox list route returns times already written in the organization's timezone", () => {
  const route = read("src/routes/api/push/notifications.ts");
  assert.ok(route.includes("formatNotificationTime"));
  assert.ok(route.includes("timezone"));
});

test("a person can send a test to their own devices only", () => {
  const route = read("src/routes/api/push/test.ts");
  assert.ok(route.includes("verifyCallerToken"));
  assert.ok(route.includes("checkRateLimit"));
  assert.ok(route.includes("sendNotificationToUser(caller.uid"));
  assert.ok(!/request\.json\(\)/.test(route), "nothing is read from the request body");
});
