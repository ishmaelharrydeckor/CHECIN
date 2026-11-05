/**
 * Types and small display rules for the notification screens (task 2.6).
 *
 * Pure: no Firebase, no fetch, no clock reads, so it can be unit tested.
 * The design is docs/NOTIFICATIONS-DESIGN.md (sections 4.5, 4.6 and 5).
 */

export type NotificationType = "ANNOUNCEMENT" | "LEAVE" | "REPORT" | "SHIFT" | "ACCOUNT";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Where the notification leads inside the app, for example "/leave". */
  url: string;
  /** ISO time, used only for ordering. */
  createdAt: string;
  /**
   * The time as the server formatted it in the organization's timezone
   * (style guide: never format times on the device).
   */
  createdAtLabel: string;
  isRead: boolean;
}

export interface NotificationPrefs {
  pushEnabled: boolean;
  announcements: boolean;
  leave: boolean;
  shifts: boolean;
  account: boolean;
}

/** The categories a person can switch off, in the order the card shows them. */
export type NotificationCategory = Exclude<keyof NotificationPrefs, "pushEnabled">;

export const NOTIFICATION_CATEGORIES: { key: NotificationCategory; label: string; note: string }[] = [
  { key: "announcements", label: "Announcements", note: "New posts for your team or the whole organization." },
  { key: "leave", label: "Leave", note: "Requests waiting for you, and decisions on your own requests." },
  { key: "shifts", label: "Shifts", note: "A shift assigned to you or changed." },
  { key: "account", label: "Account", note: "Changes to your manager or your role." },
];

/** This device's push state, as the Account page card shows it. */
export type DevicePushState = "on" | "off" | "blocked" | "ios_needs_home_screen" | "unsupported";

/** How many items the bell shows. */
export const BELL_LIST_SIZE = 5;
/** How many items the inbox page shows at a time ("Load more" adds the next page). */
export const INBOX_PAGE_SIZE = 20;

/** The unread badge text: nothing at 0, the number up to 9, then "9+". */
export function unreadBadgeLabel(count: unknown): string | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1) return null;
  return count > 9 ? "9+" : String(Math.floor(count));
}

/** The words a screen reader hears for the bell. */
export function bellAriaLabel(count: unknown): string {
  const label = unreadBadgeLabel(count);
  return label ? `Notifications, ${label === "9+" ? "more than 9" : label} unread` : "Notifications";
}

/**
 * Maps what the browser reports (the statuses in src/lib/push-client.ts) and
 * whether this device has a subscription to the card's state.
 */
export function devicePushStateFrom(permission: string, subscribed: boolean): DevicePushState {
  if (permission === "unsupported") return "unsupported";
  if (permission === "ios_pwa_required") return "ios_needs_home_screen";
  if (permission === "denied") return "blocked";
  if (permission === "granted" && subscribed) return "on";
  return "off";
}

/** Newest first; never changes the list it is given. */
export function sortNewestFirst(items: readonly NotificationItem[]): NotificationItem[] {
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** The list with one item marked read; never changes the list it is given. */
export function markItemRead(items: readonly NotificationItem[], id: string): NotificationItem[] {
  return items.map((item) => (item.id === id && !item.isRead ? { ...item, isRead: true } : item));
}

/** The list with every item marked read; never changes the list it is given. */
export function markAllItemsRead(items: readonly NotificationItem[]): NotificationItem[] {
  return items.map((item) => (item.isRead ? item : { ...item, isRead: true }));
}

/** Only links inside the app are followed; anything else goes to the inbox. */
export function safeNotificationUrl(url: unknown): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return "/notifications";
  return url;
}
