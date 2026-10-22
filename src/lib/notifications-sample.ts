import type { NotificationItem, NotificationPrefs } from "./notifications.ts";

/**
 * Sample data for the notification screens (task 2.6). The integrator
 * replaces it with the real inbox and preferences routes.
 * A mix of read and unread, short and long text.
 */
export const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "leave_lr1_u1",
    type: "LEAVE",
    title: "Leave approved",
    body: "Your annual leave from 3 to 7 November was approved by Kofi Boateng.",
    url: "/leave",
    createdAt: "2026-10-22T09:14:00Z",
    createdAtLabel: "Today, 09:14",
    isRead: false,
  },
  {
    id: "shift_s9_u1",
    type: "SHIFT",
    title: "Your shift changed",
    body: "Monday 27 October is now the Night shift (22:00 to 06:00).",
    url: "/my-shifts",
    createdAt: "2026-10-22T08:02:00Z",
    createdAtLabel: "Today, 08:02",
    isRead: false,
  },
  {
    id: "announcement_a12",
    type: "ANNOUNCEMENT",
    title: "Office closed on Friday afternoon",
    body:
      "The building will close at 13:00 on Friday 24 October for electrical maintenance. Please plan to leave by then. " +
      "If you are on the late shift, your manager will contact you about working from home or moving your hours. " +
      "The kiosk tablets will be switched off from 12:45, so check out before then.",
    url: "/announcements",
    createdAt: "2026-10-21T16:30:00Z",
    createdAtLabel: "Yesterday, 16:30",
    isRead: false,
  },
  {
    id: "report_r4_u1",
    type: "REPORT",
    title: "Your report is ready",
    body: "Attendance register, September 2026.",
    url: "/reports",
    createdAt: "2026-10-21T11:05:00Z",
    createdAtLabel: "Yesterday, 11:05",
    isRead: true,
  },
  {
    id: "account_u1_1",
    type: "ACCOUNT",
    title: "New manager",
    body: "Your manager is now Efua Owusu.",
    url: "/account",
    createdAt: "2026-10-20T07:45:00Z",
    createdAtLabel: "Mon 20 Oct, 07:45",
    isRead: true,
  },
  {
    id: "leave_lr2_u1",
    type: "LEAVE",
    title: "Leave request waiting",
    body: "Yaw Asante asked for sick leave on 17 October.",
    url: "/leave",
    createdAt: "2026-10-17T06:50:00Z",
    createdAtLabel: "Fri 17 Oct, 06:50",
    isRead: true,
  },
  {
    id: "announcement_a11",
    type: "ANNOUNCEMENT",
    title: "Welcome to ChecIN",
    body: "Scan the code at the entrance when you arrive and when you leave.",
    url: "/announcements",
    createdAt: "2026-10-13T08:00:00Z",
    createdAtLabel: "Mon 13 Oct, 08:00",
    isRead: true,
  },
];

export const SAMPLE_PREFS: NotificationPrefs = {
  pushEnabled: true,
  announcements: true,
  leave: true,
  shifts: true,
  account: false,
};
