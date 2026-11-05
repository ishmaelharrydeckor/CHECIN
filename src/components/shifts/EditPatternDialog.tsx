import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { parsePatternEdit } from "@/lib/shift-patterns";
import { describeFillSkips } from "@/lib/shift-rota";
import { PatternFields, draftToRule, ruleToDraft, type RuleDraft } from "./PatternFields";
import { authedFetch, type PatternRow, type PatternRuleData, type ShiftRow } from "./shiftApi";

/** Two rules are the same when they give the same shifts on the same weekdays (weekday order does not matter). */
function sameRuleAs(a: PatternRuleData, b: PatternRuleData): boolean {
  const norm = (r: PatternRuleData) => JSON.stringify({ ...r, weekdays: [...r.weekdays].sort((x, y) => x - y) });
  return norm(a) === norm(b);
}

interface EditPatternDialogProps {
  pattern: PatternRow | null;
  onOpenChange: (open: boolean) => void;
  shifts: ShiftRow[];
  /** The organization's today (never the device's clock). */
  today: string;
  onDone: () => void;
}

/** Change a pattern's rule or end date. A new rule applies from tomorrow; today never changes. */
export function EditPatternDialog({ pattern, onOpenChange, shifts, today, onDone }: EditPatternDialogProps) {
  const [rule, setRule] = useState<RuleDraft | null>(null);
  const [endDay, setEndDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pattern) return;
    setRule(ruleToDraft(pattern.rule, shifts));
    setEndDay(pattern.endDay ?? "");
    setError(null);
    setSaving(false);
  }, [pattern, shifts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern || !rule) return;
    setError(null);

    // Send only what changed: a new rule rebuilds the days from tomorrow, a new end date only trims or extends.
    const newRule = draftToRule(rule);
    const sameRule = sameRuleAs(newRule, pattern.rule);
    const newEnd = endDay || null;
    const changes: { rule?: PatternRuleData; endDay?: string | null } = {};
    if (!sameRule) changes.rule = newRule;
    if (newEnd !== pattern.endDay) changes.endDay = newEnd;
    if (Object.keys(changes).length === 0) {
      setError("Nothing has changed yet.");
      return;
    }
    const checked = parsePatternEdit(changes, today);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    if (endDay && endDay < pattern.startDay) {
      setError("The end date cannot be before the pattern's start date.");
      return;
    }

    setSaving(true);
    const result = await authedFetch<{ removed: number; written: number; skipped: Record<string, number> }>(
      "/api/shifts/patterns",
      { method: "PATCH", body: JSON.stringify({ id: pattern.id, ...changes }) },
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const note = describeFillSkips(result.data.skipped);
    toast.success(`Pattern updated for ${pattern.employeeName}.${note ? ` ${note}` : ""}`);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={pattern !== null} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change pattern</DialogTitle>
          <DialogDescription className="text-xs">
            {pattern ? `${pattern.employeeName}. ` : ""}
            Changes apply from tomorrow. Today's shift and days assigned by hand stay as they are.
          </DialogDescription>
        </DialogHeader>

        {rule && pattern && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <PatternFields
              value={rule}
              onChange={(next) => {
                setRule(next);
                setError(null);
              }}
              shifts={shifts}
              disabled={saving}
            />

            <div className="space-y-1.5">
              <Label htmlFor="pattern-end" className="text-xs font-medium text-[#0E2322]">
                Ends (optional)
              </Label>
              <Input
                id="pattern-end"
                type="date"
                min={pattern.startDay > today ? pattern.startDay : today}
                value={endDay}
                onChange={(e) => {
                  setEndDay(e.target.value);
                  setError(null);
                }}
                className="h-10 text-sm"
                disabled={saving}
              />
              {!endDay && <p className="text-xs text-muted-foreground">Leave empty to keep going.</p>}
            </div>

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
                  "Save changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
