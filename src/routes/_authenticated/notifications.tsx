import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCheck } from "lucide-react";
import { NotificationList } from "@/components/notifications/NotificationList";
import { useNotifications } from "@/components/notifications/useNotifications";
import { safeNotificationUrl, type NotificationItem } from "@/lib/notifications";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — ChecIN" },
      { name: "description", content: "Everything ChecIN has told you, newest first." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const router = useRouter();
  const { items, unreadCount, loading, error, hasMore, loadMore, markRead, markAllRead, refresh } = useNotifications();

  const openItem = (item: NotificationItem) => {
    markRead(item.id);
    router.history.push(safeNotificationUrl(item.url));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading || error
              ? "Everything ChecIN has told you, newest first."
              : unreadCount > 0
                ? `${unreadCount} unread. Newest first.`
                : "You're up to date. Newest first."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={markAllRead}
          disabled={loading || unreadCount === 0}
          className="h-10 border-slate-200 text-xs self-start sm:self-auto"
        >
          <CheckCheck className="size-4 mr-1.5" /> Mark all read
        </Button>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="px-3 py-2 sm:px-4">
          <NotificationList
            items={items}
            loading={loading}
            error={error}
            onRetry={refresh}
            onOpen={openItem}
            onMarkRead={markRead}
          />
        </CardContent>
      </Card>

      {!loading && !error && items.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Showing {items.length}
            {hasMore ? ", with older ones below" : ", that's everything"}
          </p>
          {hasMore && (
            <Button type="button" variant="outline" onClick={loadMore} className="h-10 border-slate-200 text-xs">
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
