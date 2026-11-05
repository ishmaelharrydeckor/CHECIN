import { useEffect, useMemo, useRef, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { MAX_PEOPLE_PER_REQUEST, parseAssignRequest } from "@/lib/shift-requests";
import { MAX_PATTERN_PEOPLE_PER_REQUEST, parsePatternCreate } from "@/lib/shift-patterns";
import { describeFillSkips, describePatternRule, formatDayMonth, weekdaysLabel } from "@/lib/shift-rota";
import { describeShiftTimes } from "@/lib/shift-ui";
import { authedFetch, type RotaMember, type ShiftRow } from "./shiftApi";
import { PatternFields, WeekdayPicker, draftToRule, newRuleDraft, type RuleDraft } from "./PatternFields";
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
  /** Called after a repeating pattern is saved, so the patterns list can reload. */
  onPatternSaved?: () => void;
}

const WORKDAYS = [0, 1, 2, 3, 4];

/** A fresh id per distinct pattern request: a resend of the same form reuses it, so no duplicate. */
function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function AssignShiftsDialog({
  open,
  onOpenChange,
  shifts,
  members,
  today,
  weekStart,
  preset,
  onDone,
  onPatternSaved,
}: AssignShiftsDialogProps) {
  const [shiftId, setShiftId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [weekdays, setWeekdays] = useState<number[]>(WORKDAYS);
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [rule, setRule] = useState<RuleDraft>(() => newRuleDraft(shifts));
  const [endDay, setEndDay] = useState("");
  const lastRequest = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setSearch("");
    setShiftId(shifts[0]?.id ?? "");
    setRepeat(false);
    setRule(newRuleDraft(shifts));
    setEndDay("");
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
  const maxPeople = repeat ? MAX_PATTERN_PEOPLE_PER_REQUEST : MAX_PEOPLE_PER_REQUEST;
  const tooMany = selected.size > maxPeople;
  const nameOf = (id: string) => shifts.find((s) => s.id === id)?.name ?? "a shift";

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
    if (repeat) {
      await submitPattern();
      return;
    }

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

  async function submitPattern() {
    const base = {
      action: "create",
      employeeIds: [...selected],
      rule: draftToRule(rule),
      startDay: fromDay,
      endDay: endDay || null,
    };
    const key = JSON.stringify(base);
    if (lastRequest.current?.key !== key) lastRequest.current = { key, id: newRequestId() };
    const payload = { ...base, requestId: lastRequest.current.id };

    const checked = parsePatternCreate(payload, today);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }

    setSaving(true);
    const result = await authedFetch<{ written: number; skipped: Record<string, number> }>("/api/shifts/patterns", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    lastRequest.current = null;
    const note = describeFillSkips(result.data.skipped);
    toast.success(
      `Pattern saved. ${result.data.written} ${result.data.written === 1 ? "day was" : "days were"} filled for the next 9 weeks; it keeps going after that.` +
        (note ? ` ${note}` : ""),
    );
    onOpenChange(false);
    onDone();
    onPatternSaved?.();
  }

  const people = `${selected.size} ${selected.size === 1 ? "person" : "people"}`;
  const summary = repeat
    ? selected.size > 0 && fromDay
      ? `${people}, ${describePatternRule(draftToRule(rule), nameOf)}, from ${formatDayMonth(fromDay)}${endDay ? ` to ${formatDayMonth(endDay)}` : ", until further notice"}.`
      : null
    : chosenShift && selected.size > 0 && fromDay && toDay
      ? `${people}, ${chosenShift.name}, ${weekdaysLabel(weekdays)}, ${formatDayMonth(fromDay)} to ${formatDayMonth(toDay)}.`
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign shifts</DialogTitle>
          <DialogDescription className="text-xs">
            {repeat
              ? "Save a pattern that keeps going: the same shift every week, or a rotation. The shifts are filled about 9 weeks ahead and kept topped up. Days already assigned by hand are never changed."
              : "Choose a shift, the people, the days of the week and the dates. A day that already has a shift is replaced. You can assign from today onwards, up to 62 days at a time."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
            <Label htmlFor="assign-repeat" className="min-w-0 cursor-pointer font-normal">
              <span className="block text-sm font-medium text-[#0E2322]">Repeat</span>
              <span className="block text-xs text-muted-foreground">Keep assigning this every week, with no end date needed.</span>
            </Label>
            <Switch
              id="assign-repeat"
              checked={repeat}
              disabled={saving}
              onCheckedChange={(v) => {
                setRepeat(v);
                setError(null);
              }}
            />
          </div>

          {!repeat && (
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
          )}

          {repeat && (
            <PatternFields
              value={rule}
              onChange={(next) => {
                setRule(next);
                setError(null);
              }}
              shifts={shifts}
              disabled={saving}
            />
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-[#0E2322]">People</Label>
              <span className={`text-xs ${tooMany ? "text-destructive" : "text-muted-foreground"}`}>
                {selected.size} chosen (up to {maxPeople})
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

          {!repeat && (
            <WeekdayPicker
              value={weekdays}
              onChange={(w) => {
                setWeekdays(w);
                setError(null);
              }}
              disabled={saving}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-from" className="text-xs font-medium text-[#0E2322]">
                {repeat ? "Starts" : "From"}
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
                {repeat ? "Ends (optional)" : "To"}
              </Label>
              <Input
                id="assign-to"
                type="date"
                min={fromDay || today}
                value={repeat ? endDay : toDay}
                onChange={(e) => {
                  if (repeat) setEndDay(e.target.value);
                  else setToDay(e.target.value);
                  setError(null);
                }}
                className="h-10 text-sm"
                disabled={saving}
              />
              {repeat && !endDay && <p className="text-xs text-muted-foreground">Leave empty to keep going.</p>}
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
              ) : repeat ? (
                "Save pattern"
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
