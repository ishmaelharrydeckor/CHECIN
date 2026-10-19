import { useState } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDayMonthYear } from "@/lib/shift-rota";
import {
  SWAP_LIST_SHOWN,
  confirmSwapAction,
  describeSwapFor,
  groupSwaps,
  swapActionLabel,
  swapStatusFor,
} from "@/lib/shift-swap-ui";
import { authedFetch, type SwapListData, type SwapRowData } from "./shiftApi";

interface Props {
  title: string;
  description: string;
  /** The signed-in person, so each swap reads from their side. */
  viewerId: string;
  data: SwapListData | null;
  error: string | null;
  onRetry: () => void;
  /** Called after an action succeeds, so the page reloads the list (and the rota, if it shows one). */
  onChanged: () => void;
  emptyText: string;
}

/**
 * A card listing shift swaps: the ones waiting on the viewer first, then their own requests, then the
 * rest they can see. The buttons on each row are exactly the moves the server said this viewer may make.
 */
export function SwapList({ title, description, viewerId, data, error, onRetry, onChanged, emptyText }: Props) {
  const [pending, setPending] = useState<{ row: SwapRowData; action: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    const result = await authedFetch<{ ok: true; status: string }>("/api/shifts/swaps", {
      method: "POST",
      body: JSON.stringify({ swapId: pending.row.id, action: pending.action }),
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      // The swap may have moved on meanwhile (someone else acted); show its current state.
      setPending(null);
      onChanged();
      return;
    }
    toast.success(successText(pending.action));
    setPending(null);
    onChanged();
  }

  const groups = data ? groupSwaps(data.swaps, viewerId) : null;
  const sentence = pending ? confirmSwapAction(pending.action, pending.row) : null;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && data === null ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm font-medium text-[#0E2322]">Couldn't load shift swaps</p>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry} className="text-xs">
              Try again
            </Button>
          </div>
        ) : groups === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading shift swaps">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : groups.waitingTotal + groups.mineTotal + groups.othersTotal === 0 ? (
          <div className="py-10 text-center space-y-2">
            <ArrowLeftRight className="size-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm font-medium text-[#0E2322]">No shift swaps yet</p>
            <p className="text-xs text-muted-foreground">{emptyText}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <Section
              heading="Waiting for you"
              rows={groups.waiting}
              total={groups.waitingTotal}
              viewerId={viewerId}
              onAction={(row, action) => setPending({ row, action })}
            />
            <Section
              heading="Your swaps"
              rows={groups.mine}
              total={groups.mineTotal}
              viewerId={viewerId}
              onAction={(row, action) => setPending({ row, action })}
            />
            <Section
              heading="Other swaps"
              rows={groups.others}
              total={groups.othersTotal}
              viewerId={viewerId}
              onAction={(row, action) => setPending({ row, action })}
            />
          </div>
        )}
      </CardContent>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !busy && !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{sentence?.title}</AlertDialogTitle>
            <AlertDialogDescription>{sentence?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Go back</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              {busy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              {sentence?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function successText(action: string): string {
  switch (action) {
    case "accept":
      return "Accepted. A manager will now decide.";
    case "decline":
      return "Swap declined.";
    case "cancel":
      return "Request cancelled.";
    case "approve":
      return "Swap approved. Both rotas are updated.";
    case "reject":
      return "Swap rejected.";
    default:
      return "Saved.";
  }
}

function Section({
  heading,
  rows,
  total,
  viewerId,
  onAction,
}: {
  heading: string;
  rows: SwapRowData[];
  total: number;
  viewerId: string;
  onAction: (row: SwapRowData, action: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{heading}</h3>
      <ul className="divide-y divide-border/70">
        {rows.map((row) => {
          const status = swapStatusFor(row, viewerId);
          return (
            <li key={row.id} className="py-3 space-y-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-medium text-[#0E2322]">{formatDayMonthYear(row.dayKey)}</p>
                  <span className={status.className}>{status.text}</span>
                </div>
                <p className="text-xs text-muted-foreground break-words">{describeSwapFor(row, viewerId)}</p>
                {row.note && <p className="text-xs text-slate-500 break-words">Note: {row.note}</p>}
              </div>
              {row.actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {row.actions.map((action) => (
                    <Button
                      key={action}
                      type="button"
                      variant={action === "accept" || action === "approve" ? "default" : "outline"}
                      onClick={() => onAction(row, action)}
                      className={
                        action === "accept" || action === "approve"
                          ? "h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                          : "h-10 border-slate-200 text-xs"
                      }
                    >
                      {swapActionLabel(action)}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {total > rows.length && (
        <p className="text-xs text-muted-foreground">
          Showing the latest {SWAP_LIST_SHOWN} of {total}.
        </p>
      )}
    </section>
  );
}
