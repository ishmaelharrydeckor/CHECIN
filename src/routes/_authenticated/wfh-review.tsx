import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Laptop } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { authedFetch } from "@/components/shifts/shiftApi";
import { DiaryDayDialog } from "@/components/wfh/diary/DiaryDayDialog";
import { DiaryReviewList } from "@/components/wfh/diary/DiaryReviewList";
import { DiarySettingsCard } from "@/components/wfh/diary/DiarySettingsCard";
import { useAuth } from "@/lib/auth";
import { formatMinutes } from "@/lib/wfh-diary-ui";
import { isDayKey, shiftDay, teamTotals, type TeamDay, type TeamReply } from "@/lib/wfh-diary-review";

export const Route = createFileRoute("/_authenticated/wfh-review")({
  head: () => ({ meta: [{ title: "Work diary review — ChecIN" }] }),
  component: WorkDiaryReviewPage,
});

function WorkDiaryReviewPage() {
  const { isOrgAdmin, isManager } = useAuth();
  const [day, setDay] = useState<string | null>(null); // null until the server says which day "today" is
  const [data, setData] = useState<TeamReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<TeamDay | null>(null);

  const load = useCallback(async (chosen: string | null) => {
    setError(null);
    const q = new URLSearchParams({ view: "team" });
    if (chosen) q.set("day", chosen);
    const result = await authedFetch<TeamReply>(`/api/wfh-diary?${q.toString()}`);
    if (!result.ok) return setError(result.error);
    setData(result.data);
    setDay(result.data.day);
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  async function decide(d: TeamDay, decision: "approve" | "flag") {
    setBusyId(d.employeeId);
    const result = await authedFetch<{ status: string }>("/api/wfh-diary", {
      method: "POST",
      body: JSON.stringify({ action: "decide", employeeId: d.employeeId, dayKey: d.dayKey, decision }),
    });
    if (!result.ok) {
      setBusyId(null);
      return toast.error(result.error);
    }
    await load(d.dayKey);
    setBusyId(null);
    toast.success(decision === "approve" ? `${d.employeeName || "The day"} approved.` : `${d.employeeName || "The day"} flagged.`);
  }

  // Anyone else is sent away by the app shell; show nothing meanwhile.
  if (!isOrgAdmin && !isManager) return null;

  const totals = data ? teamTotals(data.days) : null;
  const changeDay = (next: string) => {
    if (!isDayKey(next)) return;
    setData(null);
    void load(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Work diary review</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Review the work-from-home days of your {isOrgAdmin ? "organization" : "team"}. A day's hours count only after you approve it.
        </p>
      </div>

      {isOrgAdmin && <DiarySettingsCard />}

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">Days to review</CardTitle>
              <CardDescription className="text-xs">Choose a day. People with something to look at come first.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-10 w-10 border-slate-200" disabled={!day} onClick={() => day && changeDay(shiftDay(day, -1))} aria-label="Previous day">
                <ChevronLeft className="size-4" />
              </Button>
              <Input
                type="date"
                aria-label="Day to review"
                className="h-10 w-40"
                value={day ?? ""}
                onChange={(e) => changeDay(e.target.value)}
              />
              <Button type="button" variant="outline" size="icon" className="h-10 w-10 border-slate-200" disabled={!day} onClick={() => day && changeDay(shiftDay(day, 1))} aria-label="Next day">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && data === null ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm font-medium text-[#0E2322]">Couldn't load the diary days</p>
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load(day)} className="text-xs">
                Try again
              </Button>
            </div>
          ) : data === null ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading the diary days">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : data.days.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Laptop className="size-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm font-medium text-[#0E2322]">No work sessions on {data.day}</p>
              <p className="text-xs text-muted-foreground">
                People appear here after they run a work-diary session on a work-from-home day. Try another day, or check that the diary is switched on.
              </p>
            </div>
          ) : (
            <>
              {totals && (
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Total label="People" value={String(totals.people)} />
                  <Total label="Waiting for you" value={String(totals.waiting)} />
                  <Total label="Approved" value={String(totals.approved)} />
                  <Total label="Approved hours" value={formatMinutes(totals.approvedMinutes)} />
                </dl>
              )}
              <DiaryReviewList days={data.days} busyId={busyId} onOpen={setOpen} onDecide={(d, decision) => void decide(d, decision)} />
              {data.capped && (
                <p className="text-xs text-muted-foreground">
                  Showing the first people only. Choose another day or ask an administrator if someone is missing.
                </p>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" /> Hours count only for approved days. Flagged days are never counted.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {open && (
        <DiaryDayDialog
          employeeId={open.employeeId}
          dayKey={open.dayKey}
          name={open.employeeName}
          open
          busy={busyId === open.employeeId}
          onClose={() => setOpen(null)}
          onDecide={(decision) => void decide(open, decision)}
        />
      )}
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-lg font-bold text-[#0E2322]">{value}</dd>
    </div>
  );
}
