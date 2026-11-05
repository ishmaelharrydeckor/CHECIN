import { Button } from "@/components/ui/button";
import { CalendarClock, CalendarDays, Check, FileText, Megaphone, UserCog, type LucideIcon } from "lucide-react";
import type { NotificationItem as Item, NotificationType } from "@/lib/notifications";

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  ANNOUNCEMENT: Megaphone,
  LEAVE: CalendarDays,
  REPORT: FileText,
  SHIFT: CalendarClock,
  ACCOUNT: UserCog,
};

/**
 * One notification row. Unread rows have a dot, bold title and darker text;
 * read rows are quieter. `compact` (the bell) keeps the body to two lines.
 */
export function NotificationItem({
  item,
  onOpen,
  onMarkRead,
  compact = false,
}: {
  item: Item;
  onOpen: (item: Item) => void;
  onMarkRead?: (id: string) => void;
  compact?: boolean;
}) {
  const Icon = TYPE_ICONS[item.type] ?? Megaphone;
  const unread = !item.isRead;

  return (
    <li className="flex items-start gap-2 py-1">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2322]/30"
      >
        <span className={`mt-0.5 shrink-0 rounded-xl p-2 ${unread ? "bg-[#CBEED3] text-[#0E2322]" : "bg-slate-50 text-slate-500"}`}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-center gap-2">
            {unread && <span className="size-2 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />}
            <span className={`truncate text-sm ${unread ? "font-semibold text-[#0E2322]" : "font-medium text-slate-700"}`}>
              {item.title}
            </span>
            <span className="sr-only">{unread ? "(unread)" : "(read)"}</span>
          </span>
          <span
            className={`break-words text-xs ${unread ? "text-slate-700" : "text-muted-foreground"} ${compact ? "line-clamp-2" : "block"}`}
          >
            {item.body}
          </span>
          <span className="block text-[11px] text-slate-500">{item.createdAtLabel}</span>
        </span>
      </button>
      {onMarkRead && unread && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Mark "${item.title}" as read`}
          onClick={() => onMarkRead(item.id)}
          className="mt-1.5 size-10 shrink-0 text-slate-500"
        >
          <Check className="size-4" />
        </Button>
      )}
    </li>
  );
}
