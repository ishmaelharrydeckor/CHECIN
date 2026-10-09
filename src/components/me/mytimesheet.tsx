import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Loader2 } from "lucide-react";
import { authedGet } from "./api";

interface ClockRecord {
  id: string;
  employeeId?: string;
  type: "in" | "out";
  timestamp: string;
  locationName?: string;
  late?: boolean;
  earlyDeparture?: boolean;
}

interface DayRow {
  key: string;
  label: string;
  events: ClockRecord[];
  hours: number | null;
}

const MAX_DAYS = 7;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function MyTimesheet({ uid }: { uid: string }) {
  const [records, setRecords] = useState<ClockRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authedGet<{ records: ClockRecord[] }>("/api/attendance/history")
      .then((d) => active && setRecords(d.records ?? []))
      .catch((e) => active && setError(e.message || "Could not load your timesheet."));
    return () => {
      active = false;
    };
  }, [uid]);

  const days = useMemo<DayRow[]>(() => {
    if (!records) return [];
    // Defence in depth: the server already scopes by role, but this page is
    // "my" data, so only ever show events belonging to the signed-in user.
    const mine = records.filter((r) => r.employeeId === uid);
    const byDay = new Map<string, ClockRecord[]>();
    for (const r of mine) {
      const d = new Date(r.timestamp);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }
    return Array.from(byDay.entries())
      .map(([key, events]) => {
        events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const firstIn = events.find((e) => e.type === "in");
        const lastOut = [...events].reverse().find((e) => e.type === "out");
        const hours =
          firstIn && lastOut && new Date(lastOut.timestamp) > new Date(firstIn.timestamp)
            ? (new Date(lastOut.timestamp).getTime() - new Date(firstIn.timestamp).getTime()) /
              3_600_000
            : null;
        return {
          key,
          label: new Date(events[0].timestamp).toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
          events,
          hours,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.events[0].timestamp).getTime() - new Date(a.events[0].timestamp).getTime(),
      )
      .slice(0, MAX_DAYS);
  }, [records, uid]);

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Clock className="size-4" /> My Timesheet
        </CardTitle>
        <CardDescription className="text-xs">Your last {MAX_DAYS} days of check-ins and check-outs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : records === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : days.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No check-ins yet. Scan the entrance tablet to record your first one.
          </p>
        ) : (
          days.map((day) => (
            <div key={day.key} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-[#0E2322]">{day.label}</span>
                <span className="text-xs text-muted-foreground">
                  {day.hours !== null ? `${day.hours.toFixed(1)} hrs` : "In progress / no check-out"}
                </span>
              </div>
              <ul className="space-y-1.5">
                {day.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      className={`border-none font-medium ${
                        e.type === "in" ? "bg-[#E8FCE4] text-[#122300]" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {e.type === "in" ? "In" : "Out"}
                    </Badge>
                    <span className="font-mono text-slate-800">{fmtTime(e.timestamp)}</span>
                    {e.locationName && <span className="text-muted-foreground">· {e.locationName}</span>}
                    {e.late && <Badge className="bg-amber-100 text-amber-900 border-none">Late</Badge>}
                    {e.earlyDeparture && (
                      <Badge className="bg-amber-100 text-amber-900 border-none">Early departure</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        {records === null && !error && (
          <Loader2 className="size-4 animate-spin mx-auto text-slate-400" aria-label="Loading" />
        )}
      </CardContent>
    </Card>
  );
}