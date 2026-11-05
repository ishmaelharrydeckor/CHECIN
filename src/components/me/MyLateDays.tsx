import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NOTE_MAX, parseNoteText, type ReviewRow } from "@/lib/late-excuse";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

function dayLabel(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The signed-in person's own late days from the last two weeks, so they can explain one and see
 * whether a manager excused it (docs/LATE-EXCUSE-DESIGN.md). It shows nothing at all when there is no
 * late day, so people who are never late never see it.
 */
export function MyLateDays() {
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReviewRow | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const result = await authedFetch<{ rows: ReviewRow[] }>("/api/attendance/late-mine");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRows(result.data.rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!editing) return;
    const parsed = parseNoteText(note);
    if (!parsed.ok) {
      setNoteError(parsed.error);
      return;
    }
    setSaving(true);
    setNoteError(null);
    const result = await authedFetch<{ ok: true }>("/api/attendance/late-note", {
      method: "POST",
      body: JSON.stringify({ dayKey: editing.dayKey, note: parsed.value }),
    });
    setSaving(false);
    if (!result.ok) {
      setNoteError(result.error);
      return;
    }
    toast.success("Your note was saved. Your manager can see it.");
    setEditing(null);
    void load();
  }

  if (rows === null && !error) {
    return <Skeleton className="h-24 w-full rounded-xl" aria-busy="true" aria-label="Loading late days" />;
  }
  // A quiet failure or no late days: show nothing rather than a card that is not useful.
  if (error || !rows || rows.length === 0) return null;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">My late days</CardTitle>
        <CardDescription className="text-xs">
          Days from the last two weeks when you checked in after the reporting time. If it was not your fault, add a
          note and your manager will see it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/70">
          {rows.map((row) => (
            <li key={row.dayKey} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-[#0E2322]">{dayLabel(row.dayKey)}</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-amber-100 text-amber-900">
                    <Clock className="size-3" aria-hidden />
                    {row.arrivedAt}
                  </span>
                  {row.excused ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#CBEED3] text-[#0E2322]">
                      Excused
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">
                      Late
                    </span>
                  )}
                </div>
                {row.excused && (
                  <p className="text-xs text-slate-700 mt-1 break-words">
                    <span className="font-semibold">Reason:</span> {row.reason}
                  </p>
                )}
                {row.note && (
                  <p className="text-xs text-slate-700 mt-1 break-words">
                    <span className="font-semibold">Your note:</span> {row.note}
                  </p>
                )}
              </div>
              {!row.excused && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 border-slate-200 text-xs"
                  onClick={() => {
                    setEditing(row);
                    setNote(row.note);
                    setNoteError(null);
                  }}
                >
                  {row.note ? "Edit note" : "Add a note"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>

      <AlertDialog open={editing !== null} onOpenChange={(open) => !saving && !open && setEditing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add a note for {editing ? dayLabel(editing.dayKey) : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Tell your manager what happened. A note does not change anything by itself; your manager decides.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="late-note" className="text-xs font-medium text-[#0E2322]">
              Your note
            </Label>
            <Textarea
              id="late-note"
              value={note}
              maxLength={NOTE_MAX}
              placeholder="For example: I was at the door at 7:45 and the tablet was off"
              onChange={(e) => setNote(e.target.value)}
              className="text-sm"
              rows={3}
            />
            {noteError && (
              <p role="alert" className="text-xs text-destructive">
                {noteError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Save note
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
