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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SHIFT_TYPES, parseShiftInput, type ShiftType } from "@/lib/shift-engine";
import { SHIFT_TYPE_LABELS, expectedMinutesToHours, hoursToExpectedMinutes } from "@/lib/shift-ui";
import { authedFetch, type ShiftRow } from "./shiftApi";

interface ShiftFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The shift being edited, or null to create a new one. */
  editing: ShiftRow | null;
  onSaved: () => void;
}

export function ShiftFormDialog({ open, onOpenChange, editing, onSaved }: ShiftFormDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ShiftType>("day");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [grace, setGrace] = useState("0");
  const [hours, setHours] = useState("8");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fill the form each time it opens: the shift being edited, or sensible defaults for a new one.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setStart(editing.start ?? "09:00");
      setEnd(editing.end ?? "17:00");
      setGrace(String(editing.graceMinutes));
      setHours(expectedMinutesToHours(editing.expectedMinutes) || "8");
    } else {
      setName("");
      setType("day");
      setStart("09:00");
      setEnd("17:00");
      setGrace("0");
      setHours("8");
    }
  }, [open, editing]);

  const isFlex = type === "flex";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Exactly what will be sent. The same rules the server applies are checked first, so a mistake is
    // explained here in plain words instead of coming back as a refusal.
    const graceNumber = grace.trim() === "" ? 0 : Number(grace);
    const payload: Record<string, unknown> = { name, type, graceMinutes: graceNumber };
    if (isFlex) {
      payload.expectedMinutes = hoursToExpectedMinutes(Number(hours));
    } else {
      payload.start = start;
      payload.end = end;
    }
    const checked = parseShiftInput(payload);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }

    setSaving(true);
    const result = await authedFetch<{ ok: true }>("/api/shifts", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(editing ? "Shift updated" : "Shift created");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit shift" : "New shift"}</DialogTitle>
          <DialogDescription className="text-xs">
            {editing
              ? "People already assigned to this shift keep the times they were given. Your change applies to shifts you assign from now on."
              : "A shift is a pattern of working hours you can assign to people."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="shift-name" className="text-xs font-medium text-[#0E2322]">
              Name
            </Label>
            <Input
              id="shift-name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Night"
              className="h-10 text-sm"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shift-type" className="text-xs font-medium text-[#0E2322]">
              Type
            </Label>
            <Select value={type} onValueChange={(v) => setType(v as ShiftType)} disabled={saving}>
              <SelectTrigger id="shift-type" className="h-10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHIFT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {SHIFT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isFlex ? (
            <div className="space-y-1.5">
              <Label htmlFor="shift-hours" className="text-xs font-medium text-[#0E2322]">
                Expected hours per day
              </Label>
              <Input
                id="shift-hours"
                type="number"
                inputMode="decimal"
                min={1}
                max={24}
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="h-10 text-sm"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                A flexible shift has no fixed start, so nobody is marked late. This is the time you expect them to
                work.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="shift-start" className="text-xs font-medium text-[#0E2322]">
                    Starts
                  </Label>
                  <Input
                    id="shift-start"
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="h-10 text-sm"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shift-end" className="text-xs font-medium text-[#0E2322]">
                    Ends
                  </Label>
                  <Input
                    id="shift-end"
                    type="time"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="h-10 text-sm"
                    disabled={saving}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                If the end is earlier than the start, the shift runs past midnight.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="shift-grace" className="text-xs font-medium text-[#0E2322]">
              Grace minutes
            </Label>
            <Input
              id="shift-grace"
              type="number"
              inputMode="numeric"
              min={0}
              max={120}
              value={grace}
              onChange={(e) => setGrace(e.target.value)}
              className="h-10 text-sm"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              How many minutes after the start someone can arrive before they are marked late.
            </p>
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
              disabled={saving}
              className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving...
                </>
              ) : editing ? (
                "Save changes"
              ) : (
                "Create shift"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
