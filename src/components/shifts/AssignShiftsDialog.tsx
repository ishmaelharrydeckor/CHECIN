import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_PEOPLE_PER_REQUEST, parseAssignRequest } from "@/lib/shift-requests";
import { WEEKDAY_NAMES, formatDayMonth, weekdaysLabel } from "@/lib/shift-rota";
import { describeShiftTimes } from "@/lib/shift-ui";
import { authedFetch, type RotaMember, type ShiftRow } from "./shiftApi";
import { addDays } from "@/lib/attendance-today";

/** What to start the form with when it is opened from a cell or from the week. */
export interface AssignPreset {
  employeeIds: string[];
  fromDay: string;
  toDay: string;
}

interface AssignShiftsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shifts that can be assigned (not archived). */
  shifts: ShiftRow[];
  /** The people the caller may assign (the server decides; this only lists them). */
  members: RotaMember[];
  /** The organization's today (never the device's clock). */
  today: string;
  /** The Monday of the week on screen, used for the default dates. */
  weekStart: string;
  preset: AssignPreset | null;
  onDone: () => void;
}

const WORKDAYS = [0, 1, 2, 3, 4];

export function AssignShiftsDialog({
  open,
  onOpenChange,
  shifts,
  members,
  today,
  weekStart,
  preset,
  onDone,
}: AssignShiftsDialogProps) {
  const [shiftId, setShiftId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [weekdays, setWeekdays] = useState<number[]>(WORKDAYS);
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setSearch("");
    setShiftId(shifts[0]?.id ?? "");
    if (preset) {
      setSelected(new Set(preset.employeeIds));
      setFromDay(preset.fromDay);
      setToDay(preset.toDay);
      // A single day from a cell: allow every weekday so that day is always included.
      setWeekdays(preset.fromDay === preset.toDay ? [0, 1, 2, 3, 4, 5, 6] : WORKDAYS);
    } else {
      const start = weekStart < today ? today : weekStart;
      setSelected(new Set());
      setFromDay(start);
      setToDay(addDays(start, 13));
      setWeekdays(WORKDAYS);
    }
  }, [open, preset, shifts, today, weekStart]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...members]
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [members, search]);

  const chosenShift = shifts.find((s) => s.id === shiftId) ?? null;
  const tooMany = selected.size > MAX_PEOPLE_PER_REQUEST;

  function toggleWeekday(w: number) {
    setWeekdays((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]));
    setError(null);
  }

  function toggleMember(uid: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(uid);
      else next.delete(uid);
      return next;
    });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // The same checks the server makes, so a mistake is explained here in plain words.
    const payload = { shiftId, employeeIds: [...selected], fromDay, toDay, weekdays };
    const checked = parseAssignRequest(payload, today);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }

    setSaving(true);
    const result = await authedFetch<{ written: number; skipped: { employeeId: string; dayKey: string }[] }>(
      "/api/shifts/assignments",
      { method: "POST", body: JSON.stringify(payload) },
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const skipped = result.data.skipped.length;
    toast.success(
      `Saved ${result.data.written} ${result.data.written === 1 ? "day" : "days"}.` +
        (skipped > 0
          ? ` ${skipped} ${skipped === 1 ? "day was" : "days were"} skipped because attendance is already recorded for today.`
          : ""),
    );
    onOpenChange(false);
    onDone();
  }

  const summary =
    chosenShift && selected.size > 0 && fromDay && toDay
      ? `${selected.size} ${selected.size === 1 ? "person" : "people"}, ${chosenShift.name}, ${weekdaysLabel(weekdays)}, ${formatDayMonth(fromDay)} to ${formatDayMonth(toDay)}.`
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign shifts</DialogTitle>
          <DialogDescription className="text-xs">
            Choose a shift, the people, the days of the week and the dates. A day that already has a shift is replaced.
            You can assign from today onwards, up to 62 days at a time.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="assign-shift" className="text-xs font-medium text-[#0E2322]">
              Shift
            </Label>
            <Select value={shiftId} onValueChange={setShiftId} disabled={saving}>
              <SelectTrigger id="assign-shift" className="h-10 text-sm">
                <SelectValue placeholder="Choose a shift" />
              </SelectTrigger>
              <SelectContent>
                {shifts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}, {describeShiftTimes(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-[#0E2322]">People</Label>
              <span className={`text-xs ${tooMany ? "text-destructive" : "text-muted-foreground"}`}>
                {selected.size} chosen (up to {MAX_PEOPLE_PER_REQUEST})
              </span>
            </div>
            <div className="relative">
              <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
                aria-label="Search people to assign"
                className="h-10 pl-9 text-sm"
                disabled={saving}
              />
            </div>
            <ul className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-border/70">
              {shown.length === 0 ? (
                <li className="py-4 text-center text-xs text-muted-foreground">No one matches your search.</li>
              ) : (
                shown.map((m) => (
                  <li key={m.uid} className="flex items-center gap-3 px-3 py-2.5">
                    <Checkbox
                      id={`assign-${m.uid}`}
                      checked={selected.has(m.uid)}
                      disabled={saving}
                      onCheckedChange={(v) => toggleMember(m.uid, v === true)}
                    />
                    <Label htmlFor={`assign-${m.uid}`} className="min-w-0 flex-1 cursor-pointer font-normal">
                      <span className="block text-sm font-medium text-[#0E2322] truncate">{m.displayName}</span>
                      {m.department && <span className="block text-xs text-muted-foreground truncate">{m.department}</span>}
                    </Label>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#0E2322]">Days of the week</Label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
              {WEEKDAY_NAMES.map((name, i) => (
                <Button
                  key={name}
                  type="button"
                  size="sm"
                  variant={weekdays.includes(i) ? "default" : "outline"}
                  aria-pressed={weekdays.includes(i)}
                  disabled={saving}
                  onClick={() => toggleWeekday(i)}
                  className={
                    weekdays.includes(i)
                      ? "h-9 w-12 bg-[#0E2322] hover:bg-[#163331] text-white text-xs"
                      : "h-9 w-12 border-slate-200 text-xs"
                  }
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-from" className="text-xs font-medium text-[#0E2322]">
                From
              </Label>
              <Input
                id="assign-from"
                type="date"
                min={today}
                value={fromDay}
                onChange={(e) => {
                  setFromDay(e.target.value);
                  setError(null);
                }}
                className="h-10 text-sm"
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-to" className="text-xs font-medium text-[#0E2322]">
                To
              </Label>
              <Input
                id="assign-to"
                type="date"
                min={fromDay || today}
                value={toDay}
                onChange={(e) => {
                  setToDay(e.target.value);
                  setError(null);
                }}
                className="h-10 text-sm"
                disabled={saving}
              />
            </div>
          </div>

          {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 text-xs"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || shifts.length === 0}
              className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving...
                </>
              ) : (
                "Assign"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
