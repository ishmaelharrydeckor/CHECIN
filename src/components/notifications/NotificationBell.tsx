import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BELL_LIST_SIZE,
  bellAriaLabel,
  safeNotificationUrl,
  unreadBadgeLabel,
  type NotificationItem,
} from "@/lib/notifications";
import { NotificationList } from "./NotificationList";
import { useNotifications, type NotificationsData } from "./useNotifications";

/**
 * The bell for the top bar (task 2.6). The integrator mounts it in AppShell.
 * Opening it refreshes the list; there is no timer.
 */
export function NotificationBell() {
  const data = useNotifications({ pageSize: BELL_LIST_SIZE });
  const router = useRouter();
  return (
    <NotificationBellView
      data={data}
      onNavigate={(url) => router.history.push(url)}
    />
  );
}

/** The bell drawn from data passed in, so every state can be previewed. */
export function NotificationBellView({
  data,
  onNavigate,
  defaultOpen = false,
}: {
  data: NotificationsData;
  onNavigate: (url: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { items, unreadCount, loading, error, markRead, markAllRead, refresh } = data;
  const badge = unreadBadgeLabel(unreadCount);

  const openItem = (item: NotificationItem) => {
    markRead(item.id);
    setOpen(false);
    onNavigate(safeNotificationUrl(item.url));
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) refresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={bellAriaLabel(unreadCount)} className="relative size-10">
          <Bell className="size-5 text-[#0E2322]" />
          {badge && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-amber-100 px-1 text-center text-[11px] font-semibold leading-5 text-amber-900"
            >
              {badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0E2322]">Notifications</p>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're up to date"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={markAllRead}
            disabled={unreadCount === 0 || loading}
            className="h-9 text-xs"
          >
            Mark all read
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-2">
          <NotificationList
            items={items.slice(0, BELL_LIST_SIZE)}
            loading={loading}
            error={error}
            onRetry={refresh}
            onOpen={openItem}
            compact
          />
        </div>
        <div className="border-t border-slate-200 p-2">
          <Button asChild variant="ghost" className="h-10 w-full text-xs font-medium">
            <Link to="/notifications" onClick={() => setOpen(false)}>
              See all
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
