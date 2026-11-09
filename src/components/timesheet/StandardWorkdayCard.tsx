import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { authedFetch } from "@/components/shifts/shiftApi";
import { DEFAULT_WORK_DAYS, workdaySummary, type StandardWorkday } from "@/lib/standard-workday";

const DAYS = [
  { n: 0, short: "Mon", long: "Monday" },
  { n: 1, short: "Tue", long: "Tuesday" },
  { n: 2, short: "Wed", long: "Wednesday" },
  { n: 3, short: "Thu", long: "Thursday" },
  { n: 4, short: "Fri", long: "Friday" },
  { n: 5, short: "Sat", long: "Saturday" },
  { n: 6, short: "Sun", long: "Sunday" },
] as const;

/** Minutes written as hours for the box: 480 gives "8", 450 gives "7.5". */
function hoursText(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

/**
 * Org admins only: how long a day is, and which weekdays, for people who have no shift. It gives them an expected time
 * on the timesheet. Optional: until it is set they show hours only. The server checks every value.
 */
export function StandardWorkdayCard() {
  const [current, setCurrent] = useState<StandardWorkday | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hours, setHours] = useState("8");
  const [days, setDays] = useState<number[]>([...DEFAULT_WORK_DAYS]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const result = await authedFetch<{ workday: StandardWorkday | null }>("/api/organization/workday");
    if (!result.ok) return setLoadError(result.error);
    setCurrent(result.data.workday);
    if (result.data.workday) {
      setHours(hoursText(result.data.workday.minutes));
      setDays(result.data.workday.workDays);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (n: number) => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort((a, b) => a - b)));

  async function save(body: Record<string, unknown>, done: string) {
    setSaving(true);
    setError(null);
    const result = await authedFetch<{ workday: StandardWorkday | null }>("/api/organization/workday", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setCurrent(result.data.workday);
    toast.success(done);
  }

  const onSave = () => {
    const minutes = Math.round(Number.parseFloat(hours) * 60);
    if (!Number.isFinite(minutes)) return setError("Write how many hours a day is, for example 8 or 7.5.");
    void save({ minutes, workDays: days }, "Saved. Press Show timesheet again to see it.");
  };

  return (
    <details className="rounded-2xl border border-border/70 bg-white shadow-sm [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-[#0E2322]">
        <span>Expected time for people with no shift</span>
        <span className="text-xs font-normal text-muted-foreground">
          {current === undefined ? "Loading…" : current ? workdaySummary(current) : "Not set: they show hours only"}
        </span>
      </summary>
      <div className="space-y-4 border-t border-border/70 p-4">
        {loadError ? (
          <div className="space-y-2 text-center">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="text-xs">
              Try again
            </Button>
          </div>
        ) : current === undefined ? (
          <Skeleton className="h-24 w-full" aria-busy="true" aria-label="Loading the standard workday" />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              People who have a shift are measured against it. For everyone else, a work day expects this many hours, and
              other days expect nothing. Leave it unset to show their hours only.
            </p>
            <div className="space-y-1.5 max-w-[10rem]">
              <Label htmlFor="wd-hours" className="text-xs font-medium">
                Hours in a day
              </Label>
              <Input id="wd-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className="h-10 text-sm" />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium">Work days</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <button
                    key={d.n}
                    type="button"
                    aria-pressed={days.includes(d.n)}
                    aria-label={d.long}
                    onClick={() => toggle(d.n)}
                    className={`h-10 min-w-12 rounded-md border px-3 text-xs font-medium ${
                      days.includes(d.n) ? "border-[#0E2322] bg-[#0E2322] text-white" : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {d.short}
                  </button>
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={saving} onClick={onSave} className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium">
                {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Save
              </Button>
              {current && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void save({ clear: true }, "Removed. People with no shift show hours only.")}
                  className="h-10 border-slate-200 text-xs font-medium"
                >
                  Remove
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
