import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  EXCUSE_WINDOW_DAYS,
  REASON_MAX,
  describeExcuseResult,
  groupRowsByDay,
  parseReason,
  tickByCutoff,
  tickableIds,
  toggleId,
  type ReviewRow,
} from "@/lib/late-excuse";
import { authedFetch } from "@/components/shifts/shiftApi";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface ReviewData {
  rows: ReviewRow[];
  from: string;
  to: string;
  today: string;
  windowStart: string;
  truncated: boolean;
}

type Period = 7 | 14;

function dayLabel(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function addDaysKey(dayKey: string, n: number): string {
  const d = new Date(`${dayKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The late-arrivals review screen for managers and administrators (docs/LATE-EXCUSE-DESIGN.md).
 * People are ticked one by one, or with "arrived by HH:MM"; there is deliberately no "tick everyone".
 * It only asks the server; every rule is decided there.
 */
export function LateReviewPanel() {
  const { user, role } = useAuth();
  const viewer = useMemo(() => ({ uid: user?.id ?? "", role: role ?? null }), [user?.id, role]);

  const [period, setPeriod] = useState<Period>(7);
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** dayKey -> ticked employee ids */
  const [ticked, setTicked] = useState<Record<string, string[]>>({});
  const [cutoffs, setCutoffs] = useState<Record<string, string>>({});

  const [excuseOpen, setExcuseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [undoRow, setUndoRow] = useState<ReviewRow | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [undoError, setUndoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const from = data ? addDaysKey(data.today, -(period - 1)) : "";
    const qs = from ? `?from=${from}&to=${data!.today}` : "";
    const result = await authedFetch<ReviewData>(`/api/attendance/late-review${qs}`);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
  }, [data, period]);

  // First load uses the server's default (last 7 days); a change of period reloads with dates.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const days = useMemo(() => groupRowsByDay(data?.rows ?? []), [data]);
  const tickedTotal = Object.values(ticked).reduce((n, ids) => n + ids.length, 0);

  function toggle(day: string, id: string) {
    setTicked((t) => ({ ...t, [day]: toggleId(t[day] ?? [], id) }));
  }

  function tickCutoff(day: string, rows: ReviewRow[]) {
    const cutoff = cutoffs[day] ?? "";
    const ids = tickByCutoff(rows, cutoff, viewer);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) {
      toast.error("Enter a time like 08:40.");
      return;
    }
    setTicked((t) => ({ ...t, [day]: ids }));
    if (ids.length === 0) toast.info("Nobody arrived by that time.");
  }

  async function confirmExcuse() {
    const parsed = parseReason(reason);
    if (!parsed.ok) {
      setReasonError(parsed.error);
      return;
    }
    setSaving(true);
    setReasonError(null);
    let excused = 0;
    const notes: string[] = [];
    for (const [day, ids] of Object.entries(ticked)) {
      if (ids.length === 0) continue;
      const result = await authedFetch<{ excused: number; skipped: { reason: string }[] }>(
        "/api/attendance/late-excuse",
        { method: "POST", body: JSON.stringify({ dayKey: day, employeeIds: ids, reason: parsed.value }) },
      );
      if (!result.ok) {
        setSaving(false);
        setReasonError(result.error);
        void load();
        return;
      }
      excused += result.data.excused;
      if (result.data.skipped.length > 0) notes.push(describeExcuseResult(result.data));
    }
    setSaving(false);
    setExcuseOpen(false);
    setReason("");
    setTicked({});
    toast.success(excused === 1 ? "1 late mark excused." : `${excused} late marks excused.`);
    if (notes.length > 0) toast.info(notes[0]);
    void load();
  }

  async function confirmUndo() {
    if (!undoRow) return;
    const parsed = parseReason(undoReason);
    if (!parsed.ok) {
      setUndoError(parsed.error);
      return;
    }
    setSaving(true);
    setUndoError(null);
    const result = await authedFetch<{ ok: true }>("/api/attendance/late-excuse", {
      method: "DELETE",
      body: JSON.stringify({ dayKey: undoRow.dayKey, employeeId: undoRow.employeeId, reason: parsed.value }),
    });
    setSaving(false);
    if (!result.ok) {
      setUndoError(result.error);
      return;
    }
    toast.success("Excuse taken back.");
    setUndoRow(null);
    setUndoReason("");
    void load();
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">Late arrivals</CardTitle>
              <CardDescription className="text-xs">
                Tick the people who were late for a reason that was not their fault, then excuse them with a reason.
                You can excuse late marks from the last {EXCUSE_WINDOW_DAYS} days. The scan itself is never changed.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label="Period">
              {([7, 14] as Period[]).map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={period === p ? "default" : "outline"}
                  aria-pressed={period === p}
                  disabled={loading}
                  onClick={() => setPeriod(p)}
                  className={period === p ? "bg-[#0E2322] hover:bg-[#163331] text-white text-xs" : "border-slate-200 text-xs"}
                >
                  Last {p} days
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      {loading && !data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading late arrivals">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error && !data ? (
        <Card className="border-border/80 shadow-sm">
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm font-medium text-[#0E2322]">Couldn't load late arrivals</p>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => void load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : days.length === 0 ? (
        <Card className="border-border/80 shadow-sm">
          <CardContent className="py-12 text-center space-y-2">
            <CheckCircle2 className="size-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm font-medium text-[#0E2322]">No late arrivals in this period</p>
            <p className="text-xs text-muted-foreground">Late check-ins will appear here for you to review.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {data?.truncated && (
            <p role="status" className="text-xs font-semibold text-amber-800">
              Showing partial results. Choose a shorter period.
            </p>
          )}

          {days.map((group) => {
            const mine = ticked[group.dayKey] ?? [];
            const available = tickableIds(group.rows, viewer).length;
            return (
              <Card key={group.dayKey} className="border-border/80 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">{dayLabel(group.dayKey)}</CardTitle>
                  <CardDescription className="text-xs">
                    {group.rows.length} late {group.rows.length === 1 ? "arrival" : "arrivals"}
                    {mine.length > 0 ? `, ${mine.length} ticked` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {available > 0 && (
                    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 p-3">
                      <div className="space-y-1">
                        <Label htmlFor={`cutoff-${group.dayKey}`} className="text-xs font-medium text-[#0E2322]">
                          Tick everyone who arrived by
                        </Label>
                        <Input
                          id={`cutoff-${group.dayKey}`}
                          type="time"
                          className="h-10 w-32 text-sm"
                          value={cutoffs[group.dayKey] ?? ""}
                          onChange={(e) => setCutoffs((c) => ({ ...c, [group.dayKey]: e.target.value }))}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-10 border-slate-200 text-xs"
                        onClick={() => tickCutoff(group.dayKey, group.rows)}
                      >
                        Tick
                      </Button>
                      {mine.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-10 text-xs"
                          onClick={() => setTicked((t) => ({ ...t, [group.dayKey]: [] }))}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  )}

                  <ul className="divide-y divide-border/70">
                    {group.rows.map((row) => {
                      const ownLate = viewer.role === "manager" && row.employeeId === viewer.uid;
                      const checkId = `late-${row.dayKey}-${row.employeeId}`;
                      return (
                        <li key={row.employeeId} className="py-3 flex items-start gap-3">
                          {row.excused ? (
                            <CheckCircle2 className="size-5 mt-0.5 shrink-0 text-[#0E2322]" aria-hidden />
                          ) : (
                            <Checkbox
                              id={checkId}
                              className="mt-0.5 size-5"
                              checked={mine.includes(row.employeeId)}
                              disabled={ownLate}
                              onCheckedChange={() => toggle(row.dayKey, row.employeeId)}
                              aria-label={`Tick ${row.name}`}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <label htmlFor={checkId} className="text-sm font-medium text-[#0E2322] break-words">
                                {row.name}
                              </label>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-amber-100 text-amber-900">
                                <Clock className="size-3" aria-hidden />
                                {row.arrivedAt}
                              </span>
                              {row.excused && (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#CBEED3] text-[#0E2322]">
                                  Excused
                                </span>
                              )}
                            </div>
                            {row.department && <p className="text-xs text-muted-foreground">{row.department}</p>}
                            {row.note && (
                              <p className="text-xs text-slate-700 mt-1 break-words">
                                <span className="font-semibold">Their note:</span> {row.note}
                              </p>
                            )}
                            {row.excused && (
                              <p className="text-xs text-slate-700 mt-1 break-words">
                                <span className="font-semibold">Reason:</span> {row.reason}
                                {row.decidedByName ? ` (${row.decidedByName})` : ""}
                              </p>
                            )}
                            {ownLate && !row.excused && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Only an administrator can excuse your own late mark.
                              </p>
                            )}
                          </div>
                          {row.excused && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-9 shrink-0 text-xs"
                              onClick={() => {
                                setUndoRow(row);
                                setUndoReason("");
                                setUndoError(null);
                              }}
                            >
                              <Undo2 className="size-3.5 mr-1" /> Undo
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}

          <div className="sticky bottom-3 flex justify-end">
            <Button
              type="button"
              disabled={tickedTotal === 0}
              onClick={() => {
                setReason("");
                setReasonError(null);
                setExcuseOpen(true);
              }}
              className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium shadow-lg"
            >
              Excuse {tickedTotal > 0 ? tickedTotal : ""} selected
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={excuseOpen} onOpenChange={(open) => !saving && setExcuseOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excuse {tickedTotal} late {tickedTotal === 1 ? "mark" : "marks"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The reason is kept with each person's record. The scan and the time they arrived do not change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="excuse-reason" className="text-xs font-medium text-[#0E2322]">
              Reason
            </Label>
            <Textarea
              id="excuse-reason"
              value={reason}
              maxLength={REASON_MAX}
              placeholder="For example: the tablet was switched on late"
              onChange={(e) => setReason(e.target.value)}
              className="text-sm"
              rows={3}
            />
            {reasonError && (
              <p role="alert" className="text-xs text-destructive">
                {reasonError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void confirmExcuse();
              }}
            >
              {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Excuse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={undoRow !== null} onOpenChange={(open) => !saving && !open && setUndoRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take back this excuse?</AlertDialogTitle>
            <AlertDialogDescription>
              {undoRow?.name} will be counted as late again for {undoRow ? dayLabel(undoRow.dayKey) : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="undo-reason" className="text-xs font-medium text-[#0E2322]">
              Why are you taking it back?
            </Label>
            <Textarea
              id="undo-reason"
              value={undoReason}
              maxLength={REASON_MAX}
              onChange={(e) => setUndoReason(e.target.value)}
              className="text-sm"
              rows={2}
            />
            {undoError && (
              <p role="alert" className="text-xs text-destructive">
                {undoError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep the excuse</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void confirmUndo();
              }}
            >
              {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Take back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
