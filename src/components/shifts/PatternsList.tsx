import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil, Repeat, Square } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { describeFillSkips, describePatternDates, describePatternRule, formatDayMonthYear } from "@/lib/shift-rota";
import { EditPatternDialog } from "./EditPatternDialog";
import { authedFetch, type PatternRow, type ShiftRow } from "./shiftApi";

const PAGE = 20;

interface PatternsListProps {
  /** Whether the signed-in person may change patterns (an admin, or a manager an admin has allowed). */
  canAssign: boolean;
  /** Active shifts, for names and for editing. */
  shifts: ShiftRow[];
  /** The organization's today (never the device's clock). */
  today: string;
  /** Changes when a pattern is saved elsewhere (the Assign dialog), to reload the list. */
  reloadKey: number;
  /** Called when the rota's days may have changed (a top-up, an edit or an end). */
  onRotaChanged: () => void;
}

/** The repeating patterns in the caller's scope, with Change and End. Keeps them topped up on open. */
export function PatternsList({ canAssign, shifts, today, reloadKey, onRotaChanged }: PatternsListProps) {
  const [patterns, setPatterns] = useState<PatternRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState<PatternRow | null>(null);
  const [ending, setEnding] = useState<PatternRow | null>(null);
  const [endDay, setEndDay] = useState(today);
  const [endError, setEndError] = useState<string | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  const toppedUp = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const result = await authedFetch<{ patterns: PatternRow[]; truncated: boolean }>("/api/shifts/patterns");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPatterns(result.data.patterns);
    setTruncated(result.data.truncated);
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // Once per visit: ask the server to fill any due patterns a little further. It is quiet on purpose;
  // the nightly job does the same, so a failure here needs no message.
  useEffect(() => {
    if (!canAssign || toppedUp.current) return;
    toppedUp.current = true;
    void authedFetch<{ written: number }>("/api/shifts/patterns", {
      method: "POST",
      body: JSON.stringify({ action: "topup" }),
    }).then((r) => {
      if (r.ok && r.data.written > 0) {
        onRotaChanged();
        void load();
      }
    });
  }, [canAssign, load, onRotaChanged]);

  const names = useMemo(() => new Map(shifts.map((s) => [s.id, s.name])), [shifts]);
  const nameOf = (id: string) => names.get(id) ?? "an archived shift";

  function openEnd(p: PatternRow) {
    setEnding(p);
    setEndDay(today);
    setEndError(null);
  }

  async function confirmEnd() {
    if (!ending) return;
    if (!endDay || endDay < today) {
      setEndError("Choose today or a later day.");
      return;
    }
    setEndBusy(true);
    const result = await authedFetch<{ removed: number }>("/api/shifts/patterns", {
      method: "DELETE",
      body: JSON.stringify({ id: ending.id, endDay }),
    });
    setEndBusy(false);
    if (!result.ok) {
      setEndError(result.error);
      return;
    }
    toast.success(
      endDay === today || endDay < ending.startDay
        ? `Pattern ended for ${ending.employeeName}.`
        : `Pattern for ${ending.employeeName} will end after ${formatDayMonthYear(endDay)}.`,
    );
    setEnding(null);
    onRotaChanged();
    void load();
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Repeating patterns</CardTitle>
        <CardDescription className="text-xs">
          Patterns keep the rota filled about 9 weeks ahead. To make one, use Assign shifts and turn on Repeat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && patterns === null ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm font-medium text-[#0E2322]">Couldn't load the patterns</p>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="text-xs">
              Try again
            </Button>
          </div>
        ) : patterns === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading the patterns">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : patterns.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Repeat className="size-8 text-muted-foreground/60 mx-auto" />
            <p className="text-sm font-medium text-[#0E2322]">No repeating patterns yet</p>
            <p className="text-xs text-muted-foreground">
              {canAssign
                ? "Use Assign shifts and turn on Repeat to set one up."
                : "An administrator, or a manager they have allowed, can set them up."}
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border/70">
              {patterns.slice(0, shown).map((p) => {
                const note = describeFillSkips(p.lastFill?.skipped);
                return (
                  <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0E2322] truncate">{p.employeeName}</p>
                      <p className="text-xs text-slate-600">{describePatternRule(p.rule, nameOf)}</p>
                      <p className="text-xs text-muted-foreground">
                        {describePatternDates(p.startDay, p.endDay)}
                        {p.filledThrough && p.filledThrough >= today
                          ? `. Filled to ${formatDayMonthYear(p.filledThrough)}.`
                          : "."}
                      </p>
                      {note && <p className="text-xs text-amber-900">{note}</p>}
                    </div>
                    {canAssign && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Change the pattern for ${p.employeeName}`}
                          onClick={() => setEditing(p)}
                          className="h-10 w-10"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`End the pattern for ${p.employeeName}`}
                          onClick={() => openEnd(p)}
                          className="h-10 w-10 text-destructive hover:text-destructive"
                        >
                          <Square className="size-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {(patterns.length > shown || truncated) && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3">
                <p className="text-xs text-muted-foreground">
                  Showing {Math.min(shown, patterns.length)} of {patterns.length}
                  {truncated ? " (the newest are not listed)" : ""}.
                </p>
                {patterns.length > shown && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-200 text-xs self-start"
                    onClick={() => setShown((n) => n + PAGE)}
                  >
                    Show more
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>

      {canAssign && (
        <EditPatternDialog
          pattern={editing}
          onOpenChange={(open) => !open && setEditing(null)}
          shifts={shifts}
          today={today}
          onDone={() => {
            onRotaChanged();
            void load();
          }}
        />
      )}

      <AlertDialog open={ending !== null} onOpenChange={(open) => !endBusy && !open && setEnding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this pattern?</AlertDialogTitle>
            <AlertDialogDescription>
              {ending
                ? ending.startDay > today
                  ? `${ending.employeeName}'s pattern has not started yet. Ending it removes its shifts. Shifts assigned by hand stay.`
                  : `${ending.employeeName} keeps their pattern's shifts up to the last day you choose. Later ones are removed. Shifts assigned by hand stay.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {ending && ending.startDay <= today && (
            <div className="space-y-1.5">
              <Label htmlFor="pattern-last-day" className="text-xs font-medium text-[#0E2322]">
                Last day
              </Label>
              <Input
                id="pattern-last-day"
                type="date"
                min={today}
                value={endDay}
                onChange={(e) => {
                  setEndDay(e.target.value);
                  setEndError(null);
                }}
                className="h-10 text-sm"
                disabled={endBusy}
              />
            </div>
          )}
          {endError && (
            <p role="alert" className="text-xs text-destructive">
              {endError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endBusy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={endBusy}
              onClick={(e) => {
                e.preventDefault();
                void confirmEnd();
              }}
            >
              {endBusy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              End pattern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
