// src/components/wfh/MyWfhCard.tsx
import { useState } from "react";
import { CalendarDays, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { MyWfh, WfhDay } from "@/lib/wfh-types";

const MAX_ADD_AT_ONCE = 14;
const COLLAPSED_COUNT = 5;

export interface MyWfhCardProps {
  data: MyWfh | null;
  loading: boolean;
  error: string | null;
  onDeclare: (days: string[]) => Promise<void>;
  onCancel: (dayKey: string) => Promise<void>;
  onRetry: () => void;
  /** Today as YYYY-MM-DD. Defaults to the device date; the preview page pins it. */
  today?: string;
}

type BusyKind = "today" | "queue" | "cancel" | null;

// Local-date helpers. Keys are YYYY-MM-DD; they are parsed as local midnight.
function keyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayKeyDefault(): string {
  return keyFromDate(new Date());
}

function addDaysToKey(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return keyFromDate(d);
}

function isWeekend(key: string): boolean {
  const w = new Date(`${key}T00:00:00`).getDay();
  return w === 0 || w === 6;
}

function formatDay(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDeclared(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Returns a plain-language reason the day can't be added, or null if it can. */
function checkDay(
  key: string,
  today: string,
  maxAhead: number,
  taken: string[],
): string | null {
  if (!key) return "Pick a date first.";
  if (key < today) return "That day has already passed. Pick today or a later weekday.";
  if (key > addDaysToKey(today, maxAhead)) {
    return `You can declare up to ${maxAhead} days ahead. Pick an earlier day.`;
  }
  if (isWeekend(key)) return "Weekends are not needed. Pick a weekday.";
  if (taken.includes(key)) return `${formatDay(key)} is already in your list.`;
  return null;
}

function messageOf(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function MyWfhCard({
  data,
  loading,
  error,
  onDeclare,
  onCancel,
  onRetry,
  today: todayProp,
}: MyWfhCardProps) {
  const today = todayProp ?? todayKeyDefault();
  const [pickerValue, setPickerValue] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [cancelKey, setCancelKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const days: WfhDay[] = data?.days ?? [];
  const maxAhead = data?.maxAheadDays ?? 30;
  const declaredKeys = days.map((d) => d.dayKey);
  const declaredToday = declaredKeys.includes(today);
  const maxKey = addDaysToKey(today, maxAhead);

  // Newest declaration last.
  const sorted = [...days].sort((a, b) => a.declaredAt.localeCompare(b.declaredAt));
  const visible = showAll ? sorted : sorted.slice(-COLLAPSED_COUNT);

  function addToQueue() {
    setFormError(null);
    if (queue.length >= MAX_ADD_AT_ONCE) {
      setFormError(`You can add up to ${MAX_ADD_AT_ONCE} days at once.`);
      return;
    }
    const problem = checkDay(pickerValue, today, maxAhead, [...declaredKeys, ...queue]);
    if (problem) {
      setFormError(problem);
      return;
    }
    setQueue([...queue, pickerValue].sort());
    setPickerValue("");
  }

  async function runDeclare(keys: string[], kind: Exclude<BusyKind, null | "cancel">) {
    setBusy(kind);
    setFormError(null);
    try {
      await onDeclare(keys);
      setQueue([]);
      setPickerValue("");
    } catch (e) {
      setFormError(messageOf(e, "Could not save those days. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function declareToday() {
    setFormError(null);
    if (declaredToday) return;
    const problem = checkDay(today, today, maxAhead, declaredKeys);
    if (problem) {
      setFormError(problem);
      return;
    }
    await runDeclare([today], "today");
  }

  async function declareQueue() {
    if (queue.length === 0) return;
    await runDeclare(queue, "queue");
  }

  async function confirmCancel() {
    if (!cancelKey) return;
    setBusy("cancel");
    setFormError(null);
    try {
      await onCancel(cancelKey);
    } catch (e) {
      setFormError(messageOf(e, "Could not cancel that day. Try again."));
    } finally {
      setBusy(null);
      setCancelKey(null);
    }
  }

  const busyNow = busy !== null;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Working from home</CardTitle>
        <CardDescription className="text-xs">
          Choose the days you will work from home.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          This is your own declaration. Check-ins at the entrance tablet are separate.
        </p>

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error && !data ? (
          <div className="py-8 text-center space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button variant="outline" className="text-xs border-slate-200" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            {error && data && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="space-y-2">
              <Button
                className="h-10 w-full sm:w-auto bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                disabled={busyNow || declaredToday}
                onClick={declareToday}
              >
                {busy === "today" ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CalendarDays className="size-4 mr-1.5" />
                )}
                Working from home today
              </Button>
              {declaredToday && (
                <p className="text-xs text-muted-foreground">You have already declared today.</p>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <Label htmlFor="wfh-date" className="text-xs font-medium text-[#0E2322]">
                Add other days
              </Label>
              <div className="flex gap-2">
                <Input
                  id="wfh-date"
                  type="date"
                  className="h-10 text-sm"
                  min={today}
                  max={maxKey}
                  value={pickerValue}
                  disabled={busyNow}
                  onChange={(e) => {
                    setPickerValue(e.target.value);
                    setFormError(null);
                  }}
                />
                <Button
                  variant="outline"
                  className="h-10 shrink-0 border-slate-200 text-xs"
                  disabled={busyNow}
                  onClick={addToQueue}
                >
                  <Plus className="size-4 mr-1" />
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Weekdays only, from today to {maxAhead} days ahead. Up to {MAX_ADD_AT_ONCE} at once.
              </p>

              {formError && (
                <p role="alert" className="text-xs text-destructive">
                  {formError}
                </p>
              )}

              {queue.length > 0 && (
                <div className="space-y-3">
                  <ul className="flex flex-wrap gap-2">
                    {queue.map((k) => (
                      <li
                        key={k}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                      >
                        {formatDay(k)}
                        <button
                          type="button"
                          aria-label={`Remove ${formatDay(k)} from the list`}
                          disabled={busyNow}
                          onClick={() => setQueue(queue.filter((x) => x !== k))}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-slate-200"
                        >
                          <X className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                    disabled={busyNow}
                    onClick={declareQueue}
                  >
                    {busy === "queue" && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                    Declare {queue.length} {queue.length === 1 ? "day" : "days"}
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium text-[#0E2322]">Your declared days</h3>

              {sorted.length === 0 ? (
                <div className="py-8 text-center space-y-1">
                  <CalendarDays className="mx-auto size-8 text-muted-foreground/60" />
                  <p className="text-sm font-medium">No days declared yet.</p>
                  <p className="text-xs text-muted-foreground">
                    Add a day above, or use the button for today.
                  </p>
                </div>
              ) : (
                <>
                  {!showAll && sorted.length > COLLAPSED_COUNT && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2"
                      onClick={() => setShowAll(true)}
                    >
                      Show {sorted.length - COLLAPSED_COUNT} earlier
                    </button>
                  )}
                  <ul className="divide-y divide-border/70">
                    {visible.map((d) => (
                      <li key={d.dayKey} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {formatDay(d.dayKey)}
                            {d.dayKey === today && " (today)"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Declared {formatDeclared(d.declaredAt)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="h-8 shrink-0 border-slate-200 text-xs"
                          aria-label={`Cancel ${formatDay(d.dayKey)}`}
                          disabled={busyNow}
                          onClick={() => setCancelKey(d.dayKey)}
                        >
                          Cancel
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {showAll && sorted.length > COLLAPSED_COUNT && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2"
                      onClick={() => setShowAll(false)}
                    >
                      Show fewer
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog
        open={cancelKey !== null}
        onOpenChange={(open) => {
          if (!open) setCancelKey(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this day?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelKey ? formatDay(cancelKey) : ""} will no longer be marked as working from
              home.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep day</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === "cancel"}
              onClick={(e) => {
                e.preventDefault();
                void confirmCancel();
              }}
            >
              Cancel day
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}