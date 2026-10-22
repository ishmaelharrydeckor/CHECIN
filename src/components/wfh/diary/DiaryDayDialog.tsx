import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { authedFetch } from "@/components/shifts/shiftApi";
import {
  blockRange,
  checksLine,
  decisionState,
  intervalStateLabel,
  managerStatusLabel,
  minutesIntoSession,
  reasonLines,
  totalEvents,
  type DetailReply,
} from "@/lib/wfh-diary-review";
import { formatMinutes } from "@/lib/wfh-diary-ui";

/**
 * One person's day: the figures, what was flagged and why, every 10-minute block (counts only, never content)
 * and the still-here checks. Approve and flag are here too.
 */
export function DiaryDayDialog({
  employeeId,
  dayKey,
  name,
  open,
  busy,
  onClose,
  onDecide,
}: {
  employeeId: string;
  dayKey: string;
  name: string;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onDecide: (decision: "approve" | "flag") => void;
}) {
  const [data, setData] = useState<DetailReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const q = new URLSearchParams({ view: "detail", employeeId, day: dayKey });
    const result = await authedFetch<DetailReply>(`/api/wfh-diary?${q.toString()}`);
    if (!result.ok) return setError(result.error);
    setData(result.data);
  }, [employeeId, dayKey]);

  // Fetched when the dialog opens, and again after a decision (busy goes back to false).
  useEffect(() => {
    if (open && !busy) void load();
  }, [open, busy, load]);

  const summary = data?.summary ?? null;
  const status = summary ? managerStatusLabel(summary.status) : null;
  const can = summary ? decisionState(summary) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.employeeName || name || "Work day"}</DialogTitle>
          <DialogDescription>
            {dayKey}. Hours come from the session and the still-here answers. Key presses and clicks are shown for context only.
          </DialogDescription>
        </DialogHeader>

        {error && data === null ? (
          <div className="py-6 text-center space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="text-xs">
              Try again
            </Button>
          </div>
        ) : data === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading the day">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            {summary && (
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Figure label="Counted" value={formatMinutes(summary.verifiedMinutes)} />
                <Figure label="Not counted" value={formatMinutes(summary.unverifiedMinutes)} />
                <Figure label="Paused" value={formatMinutes(summary.pausedMinutes)} />
                <Figure label="Waiting" value={formatMinutes(summary.pendingMinutes)} />
              </dl>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {status && <span className={status.className}>{status.text}</span>}
              <span className="text-xs text-muted-foreground">{checksLine(data.checks)}</span>
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-[#0E2322]">Worth a look</h3>
              {data.flags.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing unusual was found in this day.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.flags.map((f) => (
                    <li key={f.code} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <span
                        className={`mr-2 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          f.severity === "review" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {f.severity === "review" ? "Look at this" : "For information"}
                      </span>
                      <span className="text-[#0E2322]">{f.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                These are prompts for you, not findings. Nothing here changes anyone's hours until you decide the day.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-[#0E2322]">Blocks of 10 minutes</h3>
              {data.intervals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No blocks have been reported for this day.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {data.intervals.map((i) => {
                    const state = intervalStateLabel(i.state);
                    const why = reasonLines(i.reasons);
                    return (
                      <li key={i.index} className="flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-24 shrink-0 font-medium text-[#0E2322]">{blockRange(i.index)}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${state.className}`}>{state.text}</span>
                        </div>
                        <div className="text-muted-foreground">
                          {i.counts ? (
                            <>
                              {totalEvents(i.counts)} events · {i.activeMinutes ?? 0} active min · page visible {Math.round((i.visibleSeconds ?? 0) / 60)} min
                            </>
                          ) : (
                            "No figures"
                          )}
                          {why.length > 0 && <> · {why.join(", ")}</>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {data.checks.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-[#0E2322]">Still-here checks</h3>
                <ul className="flex flex-wrap gap-2">
                  {data.checks.map((c) => (
                    <li
                      key={c.index}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        c.answeredAtMs !== null ? "bg-[#CBEED3] text-[#0E2322]" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {minutesIntoSession(c.dueAtMs, data.session.startedAtMs)} · {c.answeredAtMs !== null ? "answered" : "missed"}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {can && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                {can.note && <p className="text-xs text-muted-foreground">{can.note}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={!can.approve || busy}
                    onClick={() => onDecide("approve")}
                    className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                  >
                    {busy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                    Approve this day
                  </Button>
                  <Button type="button" variant="outline" disabled={!can.flag || busy} onClick={() => onDecide("flag")} className="h-10 border-slate-200 text-xs">
                    Flag this day
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-base font-bold text-[#0E2322]">{value}</dd>
    </div>
  );
}
