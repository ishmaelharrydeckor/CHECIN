import { useCallback, useEffect, useMemo, useState } from "react";
import {
  INBOX_PAGE_SIZE,
  markAllItemsRead,
  markItemRead,
  sortNewestFirst,
  type NotificationCategory,
  type NotificationItem,
  type NotificationPrefs,
} from "@/lib/notifications";
import { SAMPLE_NOTIFICATIONS, SAMPLE_PREFS } from "@/lib/notifications-sample";

/**
 * The only place the notification screens get their data (task 2.6).
 *
 * For now it reads the sample file. The integrator swaps in the real inbox
 * and preferences routes here and nowhere else. No timers and no polling:
 * `refresh()` runs when the bell opens and when the tab regains focus.
 */
export interface NotificationsData {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  refresh: () => void;
}

export function useNotifications({ pageSize = INBOX_PAGE_SIZE }: { pageSize?: number } = {}): NotificationsData {
  const [all, setAll] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(pageSize);

  const refresh = useCallback(() => {
    setError(null);
    // Real data later: read the inbox here. Sample data keeps what was marked read.
    setAll((current) => current ?? sortNewestFirst(SAMPLE_NOTIFICATIONS));
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const markRead = useCallback((id: string) => {
    setAll((current) => (current ? markItemRead(current, id) : current));
  }, []);

  const markAllRead = useCallback(() => {
    setAll((current) => (current ? markAllItemsRead(current) : current));
  }, []);

  const loadMore = useCallback(() => setShown((n) => n + pageSize), [pageSize]);

  return useMemo(() => {
    const list = all ?? [];
    return {
      items: list.slice(0, shown),
      // Real data later: this number comes from the server (notification_state), not from the list.
      unreadCount: list.filter((item) => !item.isRead).length,
      loading: all === null && !error,
      error,
      hasMore: list.length > shown,
      loadMore,
      markRead,
      markAllRead,
      refresh,
    };
  }, [all, error, shown, loadMore, markRead, markAllRead, refresh]);
}

export interface NotificationPrefsData {
  prefs: NotificationPrefs | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  setPref: (key: "pushEnabled" | NotificationCategory, value: boolean) => void;
  refresh: () => void;
}

export function useNotificationPrefs(): NotificationPrefsData {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    setPrefs((current) => current ?? { ...SAMPLE_PREFS });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setPref = useCallback((key: "pushEnabled" | NotificationCategory, value: boolean) => {
    // Real data later: save on the server, then update.
    setPrefs((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  return { prefs, loading: prefs === null && !error, error, saving: false, setPref, refresh };
}
