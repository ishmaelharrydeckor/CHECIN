import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyDay } from "@/lib/my-days";
import { authedGet } from "./api";

function dateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Whole minutes as "8h 48m". The number itself is worked out on the server. */
function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const PILL = "inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold";

/** The signed-in person's last seven days. Every figure comes from /api/attendance/me. */
export function MyTimesheet({ uid }: { uid: string }) {
  const [days, setDays] = useState<MyDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setDays(null);
    setError(null);
    authedGet<{ days: MyDay[] }>("/api/attendance/me")
      .then((d) => active && setDays(d.days ?? []))
      .catch(() => active && setError("Couldn't load your timesheet."));
    return () => {
      active = false;
    };
  }, [uid, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Clock className="size-4" aria-hidden="true" /> My timesheet
        </CardTitle>
        <CardDescription className="text-xs">Your last 7 days of check-ins and check-outs.</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div role="alert" className="space-y-3 py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" className="border-slate-200 text-xs" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : days === null ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : days.length === 0 ? (
          <div className="space-y-3 py-12 text-center">
            <Clock className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm font-medium">No check-ins in the last 7 days</p>
            <p className="text-xs text-muted-foreground">Scan the entrance tablet to record your first one.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {days.map((d) => (
              <li key={d.dayKey} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{dateLabel(d.dayKey)}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.firstIn ? `In ${d.firstIn}` : "No check-in"}
                    {d.lastOut ? ` · Out ${d.lastOut}` : ""}
                    {d.minutesWorked > 0 ? ` · ${duration(d.minutesWorked)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {d.stillIn && <span className={`${PILL} bg-[#CBEED3] text-[#0E2322]`}>Checked in now</span>}
                  {d.noCheckOut && <span className={`${PILL} bg-amber-100 text-amber-900`}>No check-out</span>}
                  {d.late && <span className={`${PILL} bg-amber-100 text-amber-900`}>Late</span>}
                  {d.earlyDeparture && <span className={`${PILL} bg-amber-100 text-amber-900`}>Left early</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
