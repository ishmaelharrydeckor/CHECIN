import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { describeRefusal, formatDayHeader, type RefusedNote } from "@/lib/shift-rota";
import { dayKey } from "@/lib/attendance-day";
import { authedFetch } from "./shiftApi";

interface Page {
  notes: RefusedNote[];
  hasMore: boolean;
  nextCursor: string | null;
  timezone: string;
}

/**
 * The check-ins that were turned away for being outside someone's allowed time. These are short notes,
 * not attendance records: nothing here changes anyone's hours. Admins see everyone, managers their team.
 */
export function RefusedScansTab() {
  const [notes, setNotes] = useState<RefusedNote[] | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (cursor: string | null) => {
    setError(null);
    const url = cursor ? `/api/shifts/refused-scans?cursor=${encodeURIComponent(cursor)}` : "/api/shifts/refused-scans";
    const result = await authedFetch<Page>(url);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTimezone(result.data.timezone);
    setNextCursor(result.data.hasMore ? result.data.nextCursor : null);
    setNotes((prev) => (cursor && prev ? [...prev, ...result.data.notes] : result.data.notes));
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    await load(nextCursor);
    setLoadingMore(false);
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Refused check-ins</CardTitle>
        <CardDescription className="text-xs">
          Check-ins turned away because they were outside someone's allowed time. If the same person appears more
          than once, check that their shift is right on the Rota tab. This list does not change anyone's hours.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && notes === null ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm font-medium text-[#0E2322]">Couldn't load refused check-ins</p>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load(null)} className="text-xs">
              Try again
            </Button>
          </div>
        ) : notes === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading refused check-ins">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : notes.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <ShieldAlert className="size-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm font-medium text-[#0E2322]">No refused check-ins</p>
            <p className="text-xs text-muted-foreground">Nobody has been turned away. That's a good sign.</p>
          </div>
        ) : (
          <>
            {error && (
              <p role="alert" className="text-xs text-destructive mb-2">
                {error}
              </p>
            )}
            <ul className="divide-y divide-border/70">
              {notes.map((n) => (
                <li key={n.id} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0E2322] truncate">{n.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{describeRefusal(n, timezone)}</p>
                  </div>
                  <p className="text-xs text-slate-500 shrink-0 flex items-center gap-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        n.recorded ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {n.recorded ? "Recorded, not counted" : "Turned away"}
                    </span>
                    {(() => {
                      const day = dayKey(n.at, timezone);
                      return day ? formatDayHeader(day) : "";
                    })()}
                  </p>
                </li>
              ))}
            </ul>
            {nextCursor && (
              <div className="pt-3 mt-1 border-t border-border/70">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  className="text-xs border-slate-200"
                >
                  {loadingMore && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
