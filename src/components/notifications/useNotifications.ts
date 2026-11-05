import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INBOX_PAGE_SIZE,
  markAllItemsRead,
  markItemRead,
  notificationFromRow,
  prefsFromServer,
  prefsToServer,
  sortNewestFirst,
  type NotificationCategory,
  type NotificationItem,
  type NotificationPrefs,
} from "@/lib/notifications";
import { authHeaders } from "@/lib/push-client";

/**
 * The only place the notification screens get their data (task 2.6).
 *
 * It reads the signed-in person's own inbox and preferences. Who is asking comes from the token
 * `authHeaders()` adds; no user id is ever sent. No timers and no polling: `refresh()` runs when
 * the page opens, when the bell opens, and when the window regains focus (at most every 30 seconds).
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

/** Focus and "tab visible again" refreshes are skipped if the list is younger than this. */
const MIN_REFRESH_GAP_MS = 30_000;

export function useNotifications({ pageSize = INBOX_PAGE_SIZE }: { pageSize?: number } = {}): NotificationsData {
  const [all, setAll] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(pageSize);
  const lastLoadedAt = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/push/notifications", { headers: await authHeaders() });
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      const rows: Record<string, unknown>[] = Array.isArray(data?.notifications) ? data.notifications : [];
      const items = rows.map((row) => notificationFromRow(row, "UTC")).filter((i): i is NotificationItem => i !== null);
      lastLoadedAt.current = Date.now();
      setError(null);
      setAll(sortNewestFirst(items));
    } catch {
      setError("We couldn't load your notifications. Please try again.");
    }
  }, []);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void load();
    const soon = () => {
      if (Date.now() - lastLoadedAt.current >= MIN_REFRESH_GAP_MS) void load();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    window.addEventListener("focus", soon);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", soon);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const res = await fetch("/api/push/notifications", {
          method: "POST",
          headers: await authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("bad status");
      } catch {
        // The screen already shows it as read; load again so it shows what the server really holds.
        void load();
      }
    },
    [load],
  );

  const markRead = useCallback(
    (id: string) => {
      setAll((current) => (current ? markItemRead(current, id) : current));
      void send({ notificationId: id });
    },
    [send],
  );

  const markAllRead = useCallback(() => {
    setAll((current) => (current ? markAllItemsRead(current) : current));
    void send({ markAllRead: true });
  }, [send]);

  const loadMore = useCallback(() => setShown((n) => n + pageSize), [pageSize]);

  return useMemo(() => {
    const list = all ?? [];
    return {
      items: list.slice(0, shown),
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
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/push/preferences", { headers: await authHeaders() });
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      setError(null);
      setPrefs(prefsFromServer(data?.preferences));
    } catch {
      setError("We couldn't load your notification settings. Please try again.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setPref = useCallback(
    (key: "pushEnabled" | NotificationCategory, value: boolean) => {
      if (!prefs) return;
      const next = { ...prefs, [key]: value };
      setPrefs(next);
      setSaving(true);
      void (async () => {
        try {
          const res = await fetch("/api/push/preferences", {
            method: "POST",
            headers: await authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ preferences: prefsToServer(next) }),
          });
          if (!res.ok) throw new Error("bad status");
          setError(null);
        } catch {
          setPrefs(prefs); // put the switch back: it was not saved
          setError("We couldn't save that change. Please try again.");
        } finally {
          setSaving(false);
        }
      })();
    },
    [prefs],
  );

  return { prefs, loading: prefs === null && !error, error, saving, setPref, refresh: () => void refresh() };
}
