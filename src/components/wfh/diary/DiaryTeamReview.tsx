import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { authedFetch } from "@/components/shifts/shiftApi";
import { formatMinutes, reviewStatusLabel } from "@/lib/wfh-diary-ui";
import { DiaryDayDialog } from "./DiaryDayDialog";
import type { DiaryTeamData } from "./diaryApi";

/** Shown at most, as the style guide asks. The list says when there are more. */
const SHOWN = 20;

/**
 * Managers and admins: the team's work-diary days for one day (a manager sees their team, an admin the
 * organization, decided by the server). Open a day to see its blocks and approve or flag it.
 */
export function DiaryTeamReview({ today }: { today: string }) {
  const [day, setDay] = useState(today);
  const [data, setData] = useState<DiaryTeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ employeeId: string; dayKey: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    const result = await authedFetch<DiaryTeamData>(`/api/wfh-diary?view=team&day=${encodeURIComponent(day)}`);
    if (!result.ok) return setError(result.error);
    setData(result.data);
  }, [day]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.days ?? [];
  const waiting = rows.filter((r) => r.status === "pending").length;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Team review</CardTitle>
        <CardDescription className="text-xs">
          Work-diary days for your team. Diary hours count only once you approve the day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 max-w-[12rem]">
          <Label htmlFor="diary-review-day" className="text-xs font-medium text-[#0E2322]">
            Day
          </Label>
          <Input
            id="diary-review-day"
            type="date"
            max={today}
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="h-10 text-sm"
          />
        </div>

        {error && data === null ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm font-medium text-[#0E2322]">Couldn't load the team's days</p>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="text-xs">
              Try again
            </Button>
          </div>
        ) : data === null ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading the team's days">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Users className="size-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm font-medium text-[#0E2322]">No work-diary sessions on {data.day}</p>
            <p className="text-xs text-muted-foreground">Days appear here once someone in your team starts a session.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? "person" : "people"} on {data.day}
              {waiting > 0 ? `, ${waiting} waiting for your decision` : ""}.
            </p>
            <ul className="divide-y divide-border/70">
              {rows.slice(0, SHOWN).map((r) => {
                const status = reviewStatusLabel(r.status);
                return (
                  <li key={r.employeeId}>
                    <button
                      type="button"
                      onClick={() => setOpen({ employeeId: r.employeeId, dayKey: r.dayKey, name: r.employeeName })}
                      className="w-full py-3 flex items-center justify-between gap-3 text-left min-h-10"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-medium text-[#0E2322] truncate">{r.employeeName}</p>
                          <span className={status.className}>{status.text}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Counted {formatMinutes(r.verifiedMinutes)} · not counted {formatMinutes(r.unverifiedMinutes + r.pausedMinutes)}
                          {r.reviewFlags > 0 ? ` · ${r.reviewFlags} ${r.reviewFlags === 1 ? "thing" : "things"} to look at` : ""}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {(rows.length > SHOWN || data.capped) && (
              <p className="text-xs text-muted-foreground">Showing the first {Math.min(SHOWN, rows.length)} of {rows.length}{data.capped ? "+" : ""}.</p>
            )}
          </>
        )}
      </CardContent>
      <DiaryDayDialog target={open} onClose={() => setOpen(null)} onDecided={() => void load()} />
    </Card>
  );
}
