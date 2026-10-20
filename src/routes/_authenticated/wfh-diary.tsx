import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Laptop, Loader2, Pause, Play, Square } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { authedFetch } from "@/components/shifts/shiftApi";
import { DiaryConsentCard } from "@/components/wfh/diary/DiaryConsentCard";
import { StillHereDialog } from "@/components/wfh/diary/StillHereDialog";
import { useDiaryRecorder } from "@/components/wfh/diary/useDiaryRecorder";
import {
  storeKey,
  storedKey,
  type DiaryChangeReply,
  type DiaryCheck,
  type DiaryMe,
  type DiarySessionView,
  type DiarySummaryView,
} from "@/components/wfh/diary/diaryApi";
import { dayStatusLabel, flagLines, formatMinutes, sessionStateLabel } from "@/lib/wfh-diary-ui";

export const Route = createFileRoute("/_authenticated/wfh-diary")({
  head: () => ({ meta: [{ title: "Work diary — ChecIN" }] }),
  component: WorkDiaryPage,
});

/** A fresh id per start, so a retried start (a lost reply) gets the same session back. */
function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function WorkDiaryPage() {
  const [me, setMe] = useState<DiaryMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<DiarySessionView | null>(null);
  const [summary, setSummary] = useState<DiarySummaryView | null>(null);
  const [checks, setChecks] = useState<DiaryCheck[]>([]);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [busy, setBusy] = useState<"start" | "pause" | "resume" | "stop" | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [activeCheck, setActiveCheck] = useState<DiaryCheck | null>(null);
  const handled = useRef(new Set<number>());
  const requestId = useRef(newRequestId());

  const applyReply = useCallback((reply: DiaryChangeReply) => {
    setSession(reply.session);
    setOffsetMs(reply.session.serverNowMs - Date.now());
    if (reply.summary) setSummary(reply.summary);
    setChecks(reply.checks);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const result = await authedFetch<DiaryMe>("/api/wfh-diary");
    if (!result.ok) return setError(result.error);
    setMe(result.data);
    setOffsetMs(result.data.serverNowMs - Date.now());
    setSession(result.data.session);
    setSummary(result.data.summary);
    setChecks(result.data.checks);
    setSessionKey(result.data.session ? storedKey(result.data.session.sessionId) : null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (body: Record<string, unknown>) => authedFetch<DiaryChangeReply>("/api/wfh-diary", { method: "POST", body: JSON.stringify(body) }),
    [],
  );

  // Reports each finished 10-minute block. A failed report is tried again on the next tick.
  const sendReport = useCallback(
    async (report: Record<string, unknown>) => {
      const result = await post({ action: "interval", report });
      if (!result.ok) return false;
      applyReply(result.data);
      return true;
    },
    [post, applyReply],
  );
  const { flush } = useDiaryRecorder({ session, sessionKey, offsetMs, send: sendReport });

  // Opens each still-here check when it falls due (by the server's clock), once.
  useEffect(() => {
    if (!session || session.status === "ended") return;
    const timers = checks
      .filter((c) => !handled.current.has(c.index))
      .map((c) => window.setTimeout(() => setActiveCheck((cur) => cur ?? c), Math.max(0, c.dueAtMs - (Date.now() + offsetMs))));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [checks, session, offsetMs]);

  async function answerCheck(check: DiaryCheck): Promise<string | null> {
    const result = await post({ action: "answer", check: check.index, code: check.code });
    handled.current.add(check.index);
    setActiveCheck(null);
    if (!result.ok) {
      toast.error(result.error);
      return null;
    }
    applyReply(result.data);
    toast.success("Thanks, that's confirmed.");
    return null;
  }

  const expireCheck = useCallback(() => {
    setActiveCheck((cur) => {
      if (cur) handled.current.add(cur.index);
      return null;
    });
  }, []);

  async function agree(): Promise<string | null> {
    if (!me) return null;
    const result = await post({ action: "consent", version: me.consent.version });
    if (!result.ok) return result.error;
    await load();
    return null;
  }

  async function start() {
    setBusy("start");
    const result = await post({ action: "start", requestId: requestId.current });
    setBusy(null);
    if (!result.ok) return toast.error(result.error);
    if (result.data.key) {
      storeKey(result.data.session.sessionId, result.data.key);
      setSessionKey(result.data.key);
    }
    applyReply(result.data);
    toast.success("Your work session has started.");
  }

  async function change(action: "pause" | "resume" | "stop") {
    setBusy(action);
    // Stopping: first report the block that has just finished, so its minutes are not lost.
    if (action === "stop") await flush();
    const result = await post({ action });
    setBusy(null);
    setConfirmStop(false);
    if (!result.ok) return toast.error(result.error);
    applyReply(result.data);
    if (action === "stop") await load();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Work diary</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          For a work-from-home day: start a session, keep this page open, and answer the occasional "still here?" check.
        </p>
      </div>

      {error && me === null ? (
        <Card className="border-border/80 shadow-sm">
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-sm font-medium text-[#0E2322]">Couldn't load your work diary</p>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="text-xs">
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : me === null ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your work diary">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !me.enabled ? (
        <Notice title="The work diary is not switched on" text="Your organization has not switched on the work-from-home diary. You don't need to do anything." />
      ) : !session && !me.wfhToday ? (
        <Notice
          title="Today is not a work-from-home day"
          text="The diary runs only on a day you have declared as work from home."
          action={
            <Button asChild variant="outline" className="h-10 border-slate-200 text-xs">
              <Link to="/me">Declare work from home on My page</Link>
            </Button>
          }
        />
      ) : !me.consent.agreed ? (
        <DiaryConsentCard text={me.consent.text} onAgree={agree} />
      ) : !session ? (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Start your work session</CardTitle>
            <CardDescription className="text-xs">One session a day. Use Pause for breaks; Stop ends the day's session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PhoneWarning />
            <Button
              type="button"
              disabled={busy !== null}
              onClick={() => void start()}
              className="h-10 w-full sm:w-auto bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
            >
              {busy === "start" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Play className="size-4 mr-1.5" />}
              Start session
            </Button>
          </CardContent>
        </Card>
      ) : (
        <SessionCard
          session={session}
          summary={summary}
          offsetMs={offsetMs}
          hasKey={sessionKey !== null}
          busy={busy}
          onPause={() => void change("pause")}
          onResume={() => void change("resume")}
          onStop={() => setConfirmStop(true)}
        />
      )}

      <StillHereDialog check={activeCheck} offsetMs={offsetMs} onAnswer={answerCheck} onExpired={expireCheck} />

      <AlertDialog open={confirmStop} onOpenChange={(open) => busy === null && setConfirmStop(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop for today?</AlertDialogTitle>
            <AlertDialogDescription>
              This ends today's session and it cannot be started again today. For a break, use Pause instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Keep going</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              onClick={(e) => {
                e.preventDefault();
                void change("stop");
              }}
            >
              {busy === "stop" && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Stop for today
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Notice({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="py-10 text-center space-y-3">
        <Laptop className="size-8 mx-auto text-muted-foreground/60" />
        <p className="text-sm font-medium text-[#0E2322]">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
        {action}
      </CardContent>
    </Card>
  );
}

function PhoneWarning() {
  return (
    <p className="rounded-xl border border-[#F5E6B0] bg-[#FCF2CB] px-4 py-3 text-xs text-[#854D0E]">
      Keep this page open and in front while you work. Phones and some browsers put background tabs to sleep, and time
      while this page is asleep or closed is not counted. A laptop or desktop works best.
    </p>
  );
}

function SessionCard(props: {
  session: DiarySessionView;
  summary: DiarySummaryView | null;
  offsetMs: number;
  hasKey: boolean;
  busy: string | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  const { session, summary, offsetMs, hasKey, busy, onPause, onResume, onStop } = props;
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    // Only the clock on screen moves; nothing is read from the server here.
    const t = window.setInterval(() => setNow(Date.now() + offsetMs), 30_000);
    return () => window.clearInterval(t);
  }, [offsetMs]);

  const ended = session.status === "ended";
  const elapsed = ((session.endedAtMs ?? now) - session.startedAtMs) / 60_000;
  const status = summary ? dayStatusLabel(summary.status) : null;
  const flags = summary ? flagLines(summary.flags) : [];

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold">Today's session</CardTitle>
          <span
            className={
              ended
                ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700"
                : session.status === "paused"
                  ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900"
                  : "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#CBEED3] text-[#0E2322]"
            }
            role="status"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${ended ? "bg-slate-400" : session.status === "paused" ? "bg-amber-600" : "bg-emerald-600"}`}
            />
            {sessionStateLabel(session.status)}
          </span>
        </div>
        <CardDescription className="text-xs">
          {ended ? `Your session lasted ${formatMinutes(elapsed)}.` : `Running for ${formatMinutes(elapsed)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ended && !hasKey && (
          <p role="alert" className="rounded-xl border border-[#F5E6B0] bg-[#FCF2CB] px-4 py-3 text-xs text-[#854D0E]">
            This tab did not start the session, so it cannot record it. Go back to the tab or device where you pressed
            Start. Time from this tab is not counted.
          </p>
        )}
        {!ended && <PhoneWarning />}

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <Figure label="Counted" value={formatMinutes(summary?.verifiedMinutes ?? 0)} />
          <Figure label="Waiting for a check" value={formatMinutes(summary?.pendingMinutes ?? 0)} />
          <Figure label="Not counted" value={formatMinutes((summary?.unverifiedMinutes ?? 0) + (summary?.pausedMinutes ?? 0))} />
        </dl>
        <p className="text-xs text-muted-foreground">
          Time counts in 10-minute blocks once each block ends. Paused time and blocks with a missed "still here?" check
          are not counted. Your manager reviews the day.
        </p>

        {ended && status && (
          <div className="space-y-2">
            <span className={status.className}>{status.text}</span>
            {flags.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-[#0E2322]">Shown to your manager for a look:</p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {flags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!ended && (
          <div className="flex flex-wrap gap-2">
            {session.status === "paused" ? (
              <Button type="button" disabled={busy !== null} onClick={onResume} className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium">
                {busy === "resume" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Play className="size-4 mr-1.5" />}
                Resume
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled={busy !== null} onClick={onPause} className="h-10 border-slate-200 text-xs">
                {busy === "pause" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Pause className="size-4 mr-1.5" />}
                Pause
              </Button>
            )}
            <Button type="button" variant="outline" disabled={busy !== null} onClick={onStop} className="h-10 border-slate-200 text-xs">
              <Square className="size-4 mr-1.5" /> Stop for today
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 sm:block sm:p-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-base sm:text-lg font-bold text-[#0E2322]">{value}</dd>
    </div>
  );
}
