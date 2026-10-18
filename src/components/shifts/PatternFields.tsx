import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_ROTATION_STEPS, MAX_STEP_WEEKS } from "@/lib/shift-patterns";
import { WEEKDAY_NAMES } from "@/lib/shift-rota";
import { describeShiftTimes } from "@/lib/shift-ui";
import type { PatternRuleData, ShiftRow } from "./shiftApi";

/** What the form holds while someone edits a pattern's rule. */
export interface RuleDraft {
  kind: "weekly" | "rotation";
  shiftId: string;
  steps: { shiftId: string; weeks: number }[];
  weekdays: number[];
}

export const WORKDAYS = [0, 1, 2, 3, 4];

export function newRuleDraft(shifts: ShiftRow[], weekdays: number[] = WORKDAYS): RuleDraft {
  const first = shifts[0]?.id ?? "";
  const second = shifts[1]?.id ?? first;
  return {
    kind: "weekly",
    shiftId: first,
    steps: [
      { shiftId: first, weeks: 2 },
      { shiftId: second, weeks: 2 },
    ],
    weekdays,
  };
}

export function ruleToDraft(rule: PatternRuleData, shifts: ShiftRow[]): RuleDraft {
  const base = newRuleDraft(shifts, rule.weekdays);
  return rule.kind === "weekly"
    ? { ...base, kind: "weekly", shiftId: rule.shiftId }
    : { ...base, kind: "rotation", steps: rule.steps.map((s) => ({ ...s })) };
}

/** The rule to send. The server checks it again; the screen checks first so it can explain. */
export function draftToRule(d: RuleDraft): PatternRuleData {
  return d.kind === "weekly"
    ? { kind: "weekly", shiftId: d.shiftId, weekdays: [...d.weekdays] }
    : { kind: "rotation", weekdays: [...d.weekdays], steps: d.steps.map((s) => ({ ...s })) };
}

const ACTIVE = "h-9 bg-[#0E2322] hover:bg-[#163331] text-white text-xs";
const IDLE = "h-9 border-slate-200 text-xs";

/** Seven day buttons, Monday first. */
export function WeekdayPicker({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-[#0E2322]">Days of the week</Label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
        {WEEKDAY_NAMES.map((name, i) => {
          const on = value.includes(i);
          return (
            <Button
              key={name}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i])}
              className={`w-12 ${on ? ACTIVE : IDLE}`}
            >
              {name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function ShiftSelect({
  id,
  value,
  onChange,
  shifts,
  disabled,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  shifts: ShiftRow[];
  disabled?: boolean;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label} className="h-10 w-full min-w-0 text-sm [&>span]:truncate">
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
  );
}

/** Same shift every week, or a rotation of shifts lasting whole weeks; then the weekdays. */
export function PatternFields({
  value,
  onChange,
  shifts,
  disabled,
}: {
  value: RuleDraft;
  onChange: (next: RuleDraft) => void;
  shifts: ShiftRow[];
  disabled?: boolean;
}) {
  const set = (patch: Partial<RuleDraft>) => onChange({ ...value, ...patch });
  const setStep = (i: number, patch: Partial<RuleDraft["steps"][number]>) =>
    set({ steps: value.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-[#0E2322]">How it repeats</Label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="How it repeats">
          {(["weekly", "rotation"] as const).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={value.kind === k ? "default" : "outline"}
              aria-pressed={value.kind === k}
              disabled={disabled}
              onClick={() => set({ kind: k })}
              className={`px-3 ${value.kind === k ? ACTIVE : IDLE}`}
            >
              {k === "weekly" ? "Same shift every week" : "Rotation"}
            </Button>
          ))}
        </div>
      </div>

      {value.kind === "weekly" ? (
        <div className="space-y-1.5">
          <Label htmlFor="pattern-shift" className="text-xs font-medium text-[#0E2322]">
            Shift
          </Label>
          <ShiftSelect
            id="pattern-shift"
            label="Shift"
            value={value.shiftId}
            onChange={(v) => set({ shiftId: v })}
            shifts={shifts}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#0E2322]">Rotation, in order</Label>
          <p className="text-xs text-muted-foreground">
            Weeks run Monday to Sunday and count from the week the pattern starts. After the last step it starts again.
          </p>
          <ol className="space-y-2">
            {value.steps.map((step, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
                {/* On a phone the shift takes the first line and weeks + remove wrap under it. */}
                <div className="min-w-0 flex-1 basis-48">
                  <ShiftSelect
                    id={`pattern-step-${i}`}
                    label={`Shift for step ${i + 1}`}
                    value={step.shiftId}
                    onChange={(v) => setStep(i, { shiftId: v })}
                    shifts={shifts}
                    disabled={disabled}
                  />
                </div>
                <div className="ml-7 flex items-center gap-2 sm:ml-0">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_STEP_WEEKS}
                    value={step.weeks}
                    aria-label={`Weeks for step ${i + 1}`}
                    onChange={(e) => setStep(i, { weeks: Number(e.target.value) })}
                    className="h-10 w-16 text-sm"
                    disabled={disabled}
                  />
                  <span className="text-xs text-muted-foreground">{step.weeks === 1 ? "week" : "weeks"}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove step ${i + 1}`}
                    disabled={disabled || value.steps.length <= 2}
                    onClick={() => set({ steps: value.steps.filter((_, j) => j !== i) })}
                    className="h-10 w-10 shrink-0 text-destructive hover:text-destructive"
                  >
                    <Minus className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          {value.steps.length < MAX_ROTATION_STEPS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => set({ steps: [...value.steps, { shiftId: shifts[0]?.id ?? "", weeks: 1 }] })}
              className={IDLE}
            >
              <Plus className="size-3.5 mr-1.5" /> Add a step
            </Button>
          )}
        </div>
      )}

      <WeekdayPicker value={value.weekdays} onChange={(w) => set({ weekdays: w })} disabled={disabled} />
    </div>
  );
}
