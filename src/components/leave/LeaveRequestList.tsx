import { useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LEAVE_TYPE_LABELS,
  countDays,
  formatRange,
  type LeaveRequest,
  type LeaveStatus,
} from "@/lib/leave";

type Decision = Exclude<LeaveStatus, "pending">;

interface Props {
  requests: LeaveRequest[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  emptyHint?: string;
  /** Show Approve / Deny on pending requests (manager and org admin). */
  canReview?: boolean;
  /** Show who the request belongs to (manager and org admin views). */
  showEmployee?: boolean;
  onReview?: (id: string, decision: Decision) => Promise<void>;
  onRetry?: () => void;
}

const PILL_BASE =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold";

function StatusPill({ status }: { status: LeaveStatus }) {
  if (status === "approved") {
    return (
      <span className={`${PILL_BASE} bg-[#CBEED3] text-[#0E2322]`}>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Approved
      </span>
    );
  }
  if (status === "denied") {
    return <span className={`${PILL_BASE} bg-slate-100 text-destructive`}>Denied</span>;
  }
  return <span className={`${PILL_BASE} bg-amber-100 text-amber-900`}>Pending</span>;
}

export function LeaveRequestList({
  requests,
  loading,
  error,
  emptyMessage,
  emptyHint,
  canReview = false,
  showEmployee = false,
  onReview,
  onRetry,
}: Props) {
  const [busy, setBusy] = useState<{ id: string; decision: Decision } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleReview(id: string, decision: Decision) {
    if (!onReview) return;
    setActionError(null);
    setBusy({ id, decision });
    try {
      await onReview(id, decision);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't update the request. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="space-y-3 py-12 text-center">
        <p className="text-sm text-destructive">{error}</p>
        {onRetry && (
          <Button variant="outline" className="border-slate-200 text-xs" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="space-y-3 py-12 text-center">
        <CalendarDays className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-medium">{emptyMessage}</p>
        {emptyHint && <p className="text-xs text-muted-foreground">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <p role="alert" className="text-xs text-destructive">
          {actionError}
        </p>
      )}

      <ul className="divide-y divide-border/70">
        {requests.map((r) => {
          const days = countDays(r.startDate, r.endDate);
          const rowBusy = busy?.id === r.id;
          return (
            <li
              key={r.id}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium">{LEAVE_TYPE_LABELS[r.type]}</p>
                <p className="text-xs text-muted-foreground">
                  {formatRange(r.startDate, r.endDate)} · {days} {days === 1 ? "day" : "days"}
                </p>
                {showEmployee && (
                  <p className="truncate text-xs text-muted-foreground">
                    Employee ID: {r.employeeId.slice(0, 8)}…
                  </p>
                )}
                {r.note && <p className="truncate text-xs text-slate-500">{r.note}</p>}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <StatusPill status={r.status} />
                {canReview && r.status === "pending" && (
                  <>
                    <Button
                      disabled={rowBusy}
                      onClick={() => handleReview(r.id, "approved")}
                      className="h-10 bg-[#0E2322] text-xs font-medium text-white hover:bg-[#163331] sm:h-9"
                    >
                      {rowBusy && busy?.decision === "approved" && (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      disabled={rowBusy}
                      onClick={() => handleReview(r.id, "denied")}
                      className="h-10 border-slate-200 text-xs text-destructive hover:text-destructive sm:h-9"
                    >
                      {rowBusy && busy?.decision === "denied" && (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      )}
                      Deny
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}