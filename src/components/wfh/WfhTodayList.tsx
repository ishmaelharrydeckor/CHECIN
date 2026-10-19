// src/components/wfh/WfhTodayList.tsx
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { WfhTodayPerson } from "@/lib/wfh-types";

const SHOW_LIMIT = 20;

export interface WfhTodayListProps {
  people: WfhTodayPerson[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Managers and admins can remove a team member's day. Omit to hide the action. */
  onRemove?: (employeeId: string) => Promise<void>;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0].toUpperCase()).join("") || "?";
}

function messageOf(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function WfhTodayList({ people, loading, error, onRetry, onRemove }: WfhTodayListProps) {
  const [removing, setRemoving] = useState<WfhTodayPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function confirmRemove() {
    if (!removing || !onRemove) return;
    setBusy(true);
    setActionError(null);
    try {
      await onRemove(removing.employeeId);
    } catch (e) {
      setActionError(messageOf(e, "Could not remove that day. Try again."));
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  const shown = people.slice(0, SHOW_LIMIT);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">Working from home today</CardTitle>
            <CardDescription className="text-[13px]">
              Self-declared. Not checked at the entrance.
            </CardDescription>
          </div>
          {!loading && !error && (
            <span className="shrink-0 text-[13px] font-semibold text-slate-600">
              {people.length} {people.length === 1 ? "person" : "people"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button variant="outline" className="text-[13px] border-slate-200" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : people.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium">Nobody has said they are working from home today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {actionError && (
              <p role="alert" className="text-[13px] text-destructive">
                {actionError}
              </p>
            )}
            <ul className="divide-y divide-border/70">
              {shown.map((p) => (
                <li key={p.employeeId} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 shrink-0 rounded-full bg-[#0E2322] text-[#C0FD9B] font-extrabold flex items-center justify-center text-[13px]">
                      {initials(p.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-[13px] text-muted-foreground truncate">{p.department}</p>
                    </div>
                  </div>
                  {onRemove && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 text-destructive hover:text-destructive"
                      aria-label={`Remove ${p.name} from today's list`}
                      disabled={busy}
                      onClick={() => setRemoving(p)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {people.length > SHOW_LIMIT && (
              <p className="text-[13px] text-muted-foreground">
                Showing the first {SHOW_LIMIT} of {people.length}
              </p>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove today's day?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.name} will no longer be shown as working from home today.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmRemove();
              }}
            >
              {busy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}