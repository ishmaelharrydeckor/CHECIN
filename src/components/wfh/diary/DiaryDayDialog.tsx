import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { authedFetch } from "@/components/shifts/shiftApi";
import { LIVENESS_RESPONSE_MS } from "@/lib/wfh-diary";
import { blockLook, checkTally, formatMinutes, reviewStatusLabel } from "@/lib/wfh-diary-ui";
import type { DiaryDayDetail } from "./diaryApi";

/**
 * One person's diary day for their manager: the 10-minute blocks, the flags, the still-here checks,
 * and Approve or Flag. Counts and timings only. The server decides who may decide, and when.
 */
export function DiaryDayDialog(input: {
  target: { employeeId: string; dayKey: string; name: string } | null;
  onClose: () => void;
  onDecided: () => void;
}) {
  const { target, onClose, onDecided } = input;
  const [detail, setDetail] = useState<DiaryDayDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "flag" | null>(null);

  const load = useCallback(async () => {
    if (!target) return;
    setError(null);
    setDetail(null);
    const q = `view=detail&employeeId=${encodeURIComponent(target.employeeId)}&day=${encodeURIComponent(target.dayKey)}`;
    const result = await authedFetch<DiaryDayDetail>(`/api/wfh-diary?${q}`);
    if (!result.ok) return setError(result.error);
    setDetail(result.data);
  }, [target]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(decision: "approve" | "flag") {
    if (!target) return;
    setBusy(decision);
    const result = await authedFetch<{ ok: true; status: string }>("/api/wfh-diary", {
      method: "POST",
      body: JSON.stringify({ action: "decide", employeeId: target.employeeId, dayKey: target.dayKey, decision }),
    });
    setBusy(null);
    if (!result.ok) return toast.error(result.error);
    toast.success(decision === "approve" ? "Day approved. Its diary hours now count." : "Day flagged. Its diary hours do not count.");
    onDecided();
    onClose();
  }

  const s = detail?.summary;
  const running = detail ? detail.session.status !== "ended" : false;
  const tally = detail ? checkTally(detail.checks, detail.session.serverNowMs, LIVENESS_RESPONSE_MS) : null;
  const status = s ? reviewStatusLabel(s.status) : null;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && busy === null && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{target?.name}</DialogTitle>
          <DialogDescription>
            {detail
              ? `Work diary, ${detail.dayKey}. Started ${detail.startedLabel}${detail.endedLabel ? `, ended ${detail.endedLabel}` : ", still running"} (${detail.timezone}).`
              : "Work diary"}
          </DialogDescription>
        </DialogHeader>

        {error && detail === null ? (
          <div className="py-6 text-center space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="text-xs">
              Try again
            </Button>
          </div>
        ) : detail === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading the day">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Fig label="Counted" value={formatMinutes(s?.verifiedMinutes ?? 0)} />
              <Fig label="Not counted" value={formatMinutes(s?.unverifiedMinutes ?? 0)} />
              <Fig label="Paused" value={formatMinutes(s?.pausedMinutes ?? 0)} />
              <Fig label="Waiting" value={formatMinutes(s?.pendingMinutes ?? 0)} />
            </dl>
            {status && <span className={status.className}>{status.text}</span>}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">10-minute blocks</h3>
              {detail.intervals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No blocks were reported.</p>
              ) : (
                <ul className="flex flex-wrap gap-1" aria-label="10-minute blocks">
                  {detail.intervals.map((b) => {
                    const look = blockLook(b.state);
                    const counts = b.counts
                      ? `${b.counts.keys} keys, ${b.counts.clicks} clicks, ${b.counts.scrolls} scrolls, ${b.counts.moves} moves; ${b.activeMinutes ?? 0} active min`
                      : "";
                    const text = `${b.startLabel}: ${look.label}${counts ? `. ${counts}` : ""}`;
                    return (
                      <li key={b.index} title={text} aria-label={text} className={`h-6 w-6 rounded border ${look.className}`} />
                    );
                  })}
                </ul>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                {(["verified", "unverified", "paused", "pending"] as const).map((st) => (
                  <span key={st} className="inline-flex items-center gap-1.5">
                    <span className={`inline-block size-3 rounded border ${blockLook(st).className}`} />
                    {blockLook(st).label}
                  </span>
                ))}
              </div>
            </section>

            {tally && (
              <p className="text-xs text-muted-foreground">
                Still-here checks: {tally.answered} answered, {tally.missed} missed{tally.open > 0 ? `, ${tally.open} still open` : ""}.
              </p>
            )}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">For a look</h3>
              {detail.flags.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing unusual was noticed.</p>
              ) : (
                <ul className="space-y-1.5">
                  {detail.flags.map((f) => (
                    <li key={f.code} className="text-xs">
                      <span className={f.severity === "review" ? "font-medium text-amber-900" : "text-slate-600"}>{f.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                These are hints, not proof. Nothing is decided automatically: approving or flagging is your call.
              </p>
            </section>

            {detail.canDecide && (
              <DialogFooter className="gap-2 sm:gap-0">
                {running && <p className="text-xs text-muted-foreground sm:mr-auto">You can decide once the session has ended.</p>}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null || running}
                  onClick={() => void decide("flag")}
                  className="h-10 border-slate-200 text-xs"
                >
                  {busy === "flag" && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                  Flag
                </Button>
                <Button
                  type="button"
                  disabled={busy !== null || running}
                  onClick={() => void decide("approve")}
                  className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                >
                  {busy === "approve" && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                  Approve
                </Button>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-base font-bold text-[#0E2322]">{value}</dd>
    </div>
  );
}
