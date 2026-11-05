import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  BELL_LIST_SIZE,
  INBOX_PAGE_SIZE,
  NOTIFICATION_CATEGORIES,
  bellAriaLabel,
  devicePushStateFrom,
  markAllItemsRead,
  markItemRead,
  safeNotificationUrl,
  sortNewestFirst,
  unreadBadgeLabel,
} from "../../src/lib/notifications.ts";

test("the badge: nothing at 0, the number up to 9, then 9+", () => {
  const cases = [
    [0, null],
    [1, "1"],
    [9, "9"],
    [10, "9+"],
    [250, "9+"],
    [-1, null],
    [Number.NaN, null],
    ["3", null],
    [undefined, null],
  ];
  for (const [input, expected] of cases) assert.equal(unreadBadgeLabel(input), expected, String(input));
  assert.equal(bellAriaLabel(0), "Notifications");
  assert.equal(bellAriaLabel(3), "Notifications, 3 unread");
  assert.equal(bellAriaLabel(12), "Notifications, more than 9 unread");
});

test("this device's state comes from the browser status and the subscription", () => {
  assert.equal(devicePushStateFrom("granted", true), "on");
  assert.equal(devicePushStateFrom("granted", false), "off");
  assert.equal(devicePushStateFrom("prompt", false), "off");
  assert.equal(devicePushStateFrom("denied", false), "blocked");
  assert.equal(devicePushStateFrom("denied", true), "blocked");
  assert.equal(devicePushStateFrom("ios_pwa_required", false), "ios_needs_home_screen");
  assert.equal(devicePushStateFrom("unsupported", false), "unsupported");
  assert.equal(devicePushStateFrom("something new", true), "off");
});

const SAMPLE_NOTIFICATIONS = [
  { id: "a", type: "ANNOUNCEMENT", title: "A", body: "a", url: "/announcements", createdAt: "2026-11-05T09:00:00.000Z", createdAtLabel: "5 Nov, 09:00", isRead: false },
  { id: "b", type: "LEAVE", title: "B", body: "b", url: "/leave", createdAt: "2026-11-04T09:00:00.000Z", createdAtLabel: "4 Nov, 09:00", isRead: false },
  { id: "c", type: "SYSTEM", title: "C", body: "c", url: "/notifications", createdAt: "2026-11-03T09:00:00.000Z", createdAtLabel: "3 Nov, 09:00", isRead: true },
];

test("marking read never changes the list it is given", () => {
  const items = Object.freeze(SAMPLE_NOTIFICATIONS.map((i) => Object.freeze({ ...i })));
  const unreadId = items.find((i) => !i.isRead).id;
  const one = markItemRead(items, unreadId);
  assert.equal(one.find((i) => i.id === unreadId).isRead, true);
  assert.equal(one.filter((i) => !i.isRead).length, items.filter((i) => !i.isRead).length - 1);
  assert.equal(items.find((i) => i.id === unreadId).isRead, false);
  assert.deepEqual(markItemRead(items, "no-such-id"), [...items]);
  assert.ok(markAllItemsRead(items).every((i) => i.isRead));
  assert.deepEqual(markAllItemsRead([]), []);
});

test("newest first", () => {
  const shuffled = [...SAMPLE_NOTIFICATIONS].reverse();
  const sorted = sortNewestFirst(shuffled);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].createdAt >= sorted[i].createdAt);
  assert.equal(shuffled[0].id, SAMPLE_NOTIFICATIONS.at(-1).id, "the input is untouched");
});

test("only links inside the app are followed", () => {
  assert.equal(safeNotificationUrl("/leave"), "/leave");
  assert.equal(safeNotificationUrl("https://evil.example"), "/notifications");
  assert.equal(safeNotificationUrl("//evil.example"), "/notifications");
  assert.equal(safeNotificationUrl("javascript:alert(1)"), "/notifications");
  assert.equal(safeNotificationUrl(undefined), "/notifications");
});

test("the card lists the four categories and the sizes stay small", () => {
  assert.deepEqual(NOTIFICATION_CATEGORIES.map((c) => c.key), ["announcements", "leave", "shifts", "account"]);
  assert.equal(BELL_LIST_SIZE, 5);
  assert.ok(INBOX_PAGE_SIZE <= 20, "style guide 7b: at most 20 rows at a time");
});

const read = (p) => readFileSync(p, "utf8");
const files = [
  "src/lib/notifications.ts",
  "src/components/notifications/useNotifications.ts",
  "src/components/notifications/NotificationBell.tsx",
  "src/components/notifications/NotificationItem.tsx",
  "src/components/notifications/NotificationList.tsx",
  "src/components/notifications/NotificationPreferencesCard.tsx",
  "src/components/notifications/DevicePushCard.tsx",
  "src/routes/_authenticated/notifications.tsx",
];

test("the screens exist", () => {
  for (const f of files) assert.ok(existsSync(f), f);
});

test("only the hook fetches; the screens use no Firebase, no timers and no device time formatting", () => {
  for (const f of files) {
    const src = read(f);
    if (!f.endsWith("useNotifications.ts")) assert.doesNotMatch(src, /\bfetch\(/, `${f} must not fetch`);
    assert.doesNotMatch(src, /from\s+["'][^"']*firebase/i, `${f} must not import Firebase`);
    assert.doesNotMatch(src, /setInterval|setTimeout/, `${f} must not use timers`);
    assert.doesNotMatch(src, /toLocale(Time|Date)?String/, `${f} must not format times on the device`);
  }
});

test("data comes only from the hook, which refreshes on bell open and tab focus", () => {
  const hook = read("src/components/notifications/useNotifications.ts");
  assert.match(hook, /\/api\/push\/notifications/);
  assert.match(hook, /"focus"/);
  assert.match(hook, /visibilitychange/);
  for (const f of files.filter((f) => f.includes("/components/") && !f.endsWith("useNotifications.ts"))) {
    assert.doesNotMatch(read(f), /notifications-sample/, `${f} must get its data from the hook`);
  }
  assert.match(read("src/components/notifications/NotificationBell.tsx"), /refresh\(\)/);
});

test("every device state is built, and email and SMS are shown as not yet available", () => {
  const card = read("src/components/notifications/DevicePushCard.tsx");
  for (const s of ["on", "off", "blocked", "ios_needs_home_screen", "unsupported"]) assert.ok(card.includes(`${s}:`), s);
  assert.match(card, /Send me a test/);
  const prefs = read("src/components/notifications/NotificationPreferencesCard.tsx");
  assert.match(prefs, /Email/);
  assert.match(prefs, /SMS/);
  assert.match(prefs, /Coming later/);
});
