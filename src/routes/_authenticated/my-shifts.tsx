import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays } from "@/lib/attendance-today";
import { describeAllowedTime, describeAssignment, formatDayHeader, type RotaAssignment } from "@/lib/shift-rota";
import { useAuth } from "@/lib/auth";
import { authedFetch, type ShiftContext, type SwapListData } from "@/components/shifts/shiftApi";
import { ProposeSwapDialog } from "@/components/shifts/ProposeSwapDialog";
import { SwapList } from "@/components/shifts/SwapList";

export const Route = createFileRoute("/_authenticated/my-shifts")({
  head: () => ({ meta: [{ title: "My shifts — ChecIN" }] }),
  component: MyShiftsPage,
});

const DAYS_AHEAD = 30;

function MyShiftsPage() {
  const { user } = useAuth();
  const [context, setContext] = useState<ShiftContext | null>(null);
  const [mine, setMine] = useState<RotaAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const ctx = await authedFetch<ShiftContext>("/api/shifts/settings");
    if (!ctx.ok) return setError(ctx.error);
    setContext(ctx.data);
    // Only the signed-in person's own shifts come back: the server decides that from their login.
    const result = await authedFetch<{ assignments: RotaAssignment[] }>(
      `/api/shifts/assignments?from=${ctx.data.today}&to=${addDays(ctx.data.today, DAYS_AHEAD)}`,
    );
    if (!result.ok) return setError(result.error);
    setMine([...result.data.assignments].sort((a, b) => a.dayKey.localeCompare(b.dayKey)));
  }, []);

  // Shift swaps: the list of my swaps, and whether the organization allows them at all.
  const [swaps, setSwaps] = useState<SwapListData | null>(null);
  const [swapsError, setSwapsError] = useState<string | null>(null);
  const [swapDay, setSwapDay] = useState<{ dayKey: string; shiftLabel: string } | null>(null);

  const loadSwaps = useCallback(async () => {
    setSwapsError(null);
    const result = await authedFetch<SwapListData>("/api/shifts/swaps");
    if (!result.ok) return setSwapsError(result.error);
    setSwaps(result.data);
  }, []);

  useEffect(() => {
    void load();
    void loadSwaps();
  }, [load, loadSwaps]);

  // An approved swap changes my shifts too, so both lists reload after any swap action.
  const reloadAll = useCallback(() => {
    void load();
    void loadSwaps();
  }, [load, loadSwaps]);

  const today = context?.today ?? "";
  const tomorrow = today ? addDays(today, 1) : "";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">My shifts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your planned shifts for the next {DAYS_AHEAD} days.</p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Upcoming</CardTitle>
          <CardDescription className="text-xs">
            {context?.shiftsEnabled
              ? describeAllowedTime(context.shiftWindowMinutes)
              : "Your organization has not switched on shifts yet. Check in as you normally do."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && mine === null ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm font-medium text-[#0E2322]">Couldn't load your shifts</p>
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="text-xs">
                Try again
              </Button>
            </div>
          ) : mine === null ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading your shifts">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : mine.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CalendarClock className="size-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm font-medium text-[#0E2322]">No shifts planned</p>
              <p className="text-xs text-muted-foreground">
                If your organization uses shifts, your manager will assign them and they will show here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {mine.map((a) => (
                <li key={a.dayKey} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0E2322]">
                      {a.dayKey === today ? "Today" : a.dayKey === tomorrow ? "Tomorrow" : formatDayHeader(a.dayKey)}
                    </p>
                    <p className="text-xs text-muted-foreground">{describeAssignment(a.shift)}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {a.dayKey === today && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#CBEED3] text-[#0E2322]">
                        Today
                      </span>
                    )}
                    {swaps?.enabled && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSwapDay({ dayKey: a.dayKey, shiftLabel: describeAssignment(a.shift) })}
                        className="h-10 border-slate-200 text-xs"
                        aria-label={`Ask to swap your shift on ${formatDayHeader(a.dayKey)}`}
                      >
                        <ArrowLeftRight className="size-4 mr-1.5" /> Swap
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(swaps?.enabled || (swaps?.swaps.length ?? 0) > 0 || swapsError) && (
        <SwapList
          title="Shift swaps"
          description="Swaps you asked for and swaps colleagues asked you for. A swap only changes your shifts once a manager approves it."
          viewerId={user?.id ?? ""}
          data={swaps}
          error={swapsError}
          onRetry={() => void loadSwaps()}
          onChanged={reloadAll}
          emptyText="To ask a colleague to swap, press Swap next to one of your shifts."
        />
      )}

      <ProposeSwapDialog day={swapDay} onOpenChange={(open) => !open && setSwapDay(null)} onProposed={() => void loadSwaps()} />

      <p className="text-xs text-muted-foreground">
        A shift that runs past midnight belongs to the day it starts. If a shift looks wrong, tell your manager.
      </p>
    </div>
  );
}
