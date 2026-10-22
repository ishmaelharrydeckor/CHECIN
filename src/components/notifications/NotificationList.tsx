import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BellOff } from "lucide-react";
import type { NotificationItem as Item } from "@/lib/notifications";
import { NotificationItem } from "./NotificationItem";

/** A list of notifications with its loading, empty and error states. */
export function NotificationList({
  items,
  loading,
  error,
  onRetry,
  onOpen,
  onMarkRead,
  compact = false,
}: {
  items: Item[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (item: Item) => void;
  onMarkRead?: (id: string) => void;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2 py-2" aria-busy="true">
        <span className="sr-only">Loading your notifications…</span>
        {Array.from({ length: compact ? 3 : 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${compact ? "py-6" : "py-12"} text-center space-y-3`}>
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
        <Button type="button" variant="outline" onClick={onRetry} className="h-10 border-slate-200 text-xs">
          Try again
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`${compact ? "py-6" : "py-12"} text-center space-y-3`}>
        <BellOff className="mx-auto size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">No notifications yet</p>
        <p className="text-xs text-muted-foreground">
          Leave decisions, shift changes, announcements and reports will show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/70">
      {items.map((item) => (
        <NotificationItem key={item.id} item={item} onOpen={onOpen} onMarkRead={onMarkRead} compact={compact} />
      ))}
    </ul>
  );
}
