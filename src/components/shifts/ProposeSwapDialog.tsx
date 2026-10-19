import { useCallback, useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDayMonthYear } from "@/lib/shift-rota";
import { SWAP_NOTE_MAX_LENGTH } from "@/lib/shift-swaps";
import { validateSwapProposal } from "@/lib/shift-swap-ui";
import { authedFetch, type SwapCandidateRow } from "./shiftApi";

interface Props {
  /** The day and the caller's own shift on it; null closes the dialog. */
  day: { dayKey: string; shiftLabel: string } | null;
  onOpenChange: (open: boolean) => void;
  onProposed: () => void;
}

/** A fresh id per proposal: a resend of the same form reuses it, so the server makes no duplicate. */
function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Ask a colleague in your team to swap shifts with you on one day. */
export function ProposeSwapDialog({ day, onOpenChange, onProposed }: Props) {
  const [candidates, setCandidates] = useState<SwapCandidateRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [colleagueId, setColleagueId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);

  const load = useCallback(async (dayKey: string) => {
    setLoadError(null);
    setCandidates(null);
    const result = await authedFetch<{ candidates: SwapCandidateRow[] }>(
      `/api/shifts/swaps?candidates=${encodeURIComponent(dayKey)}`,
    );
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setCandidates(result.data.candidates);
  }, []);

  // Each time the dialog opens for a day: a clean form, a new request id, and that day's colleagues.
  useEffect(() => {
    if (!day) return;
    setColleagueId("");
    setNote("");
    setError(null);
    setRequestId(newRequestId());
    void load(day.dayKey);
  }, [day, load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!day) return;
    const problem = validateSwapProposal({ colleagueId, note });
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    const result = await authedFetch<{ ok: true; swapId: string }>("/api/shifts/swaps", {
      method: "POST",
      body: JSON.stringify({ action: "propose", colleagueId, dayKey: day.dayKey, note: note.trim(), requestId }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const name = candidates?.find((c) => c.uid === colleagueId)?.name ?? "your colleague";
    toast.success(`Swap request sent to ${name}.`);
    onProposed();
    onOpenChange(false);
  }

  const chosen = candidates?.find((c) => c.uid === colleagueId) ?? null;

  return (
    <Dialog open={day !== null} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ask to swap</DialogTitle>
          <DialogDescription>
            {day
              ? `${formatDayMonthYear(day.dayKey)}. Your shift: ${day.shiftLabel}. Your colleague accepts first, then a manager decides.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {loadError && candidates === null ? (
          <div className="py-6 text-center space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => day && void load(day.dayKey)}
              className="text-xs"
            >
              Try again
            </Button>
          </div>
        ) : candidates === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading colleagues">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-medium text-[#0E2322]">Nobody to swap with that day</p>
            <p className="text-xs text-muted-foreground">
              No one else in your team has a different shift on this day. Ask your manager if you need a change.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="swap-colleague" className="text-xs font-medium text-[#0E2322]">
                Colleague
              </Label>
              <Select
                value={colleagueId}
                onValueChange={(v) => {
                  setColleagueId(v);
                  setError(null);
                }}
                disabled={saving}
              >
                <SelectTrigger id="swap-colleague" className="h-10 text-sm w-full min-w-0 [&>span]:truncate">
                  <SelectValue placeholder="Choose a colleague" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.uid} value={c.uid}>
                      {c.name}: {c.shiftLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chosen && (
                <p className="text-xs text-muted-foreground">
                  If approved, you work {chosen.shiftLabel} and {chosen.name} works {day?.shiftLabel}.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="swap-note" className="text-xs font-medium text-[#0E2322]">
                Note (optional)
              </Label>
              <Textarea
                id="swap-note"
                rows={3}
                maxLength={SWAP_NOTE_MAX_LENGTH}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setError(null);
                }}
                className="text-sm"
                disabled={saving}
              />
              <p className="text-right text-xs text-muted-foreground">
                {note.length}/{SWAP_NOTE_MAX_LENGTH}
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
                className="h-10 border-slate-200 text-xs"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Sending...
                  </>
                ) : (
                  "Send request"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
