import { Archive, CalendarClock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SHIFT_TYPE_LABELS, describeShiftTimes } from "@/lib/shift-ui";
import type { ShiftRow } from "./shiftApi";

interface ShiftsListProps {
  shifts: ShiftRow[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Whether the signed-in person may edit or archive this shift (admins any; allowed managers their own). */
  canEdit: (shift: ShiftRow) => boolean;
  onEdit: (shift: ShiftRow) => void;
  onArchive: (shift: ShiftRow) => void;
  onCreate: () => void;
  /** False for a manager who has not been allowed to manage shifts: they can look but not create. */
  canCreate?: boolean;
}

export function ShiftsList({ shifts, loading, error, onRetry, canEdit, onEdit, onArchive, onCreate, canCreate = true }: ShiftsListProps) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Your shifts</CardTitle>
        <CardDescription className="text-xs">
          Create the shifts your organization works, then assign people to them. A shift that runs past midnight
          belongs to the day it starts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && shifts === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading shifts">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error && shifts === null ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm font-medium text-[#0E2322]">Couldn't load shifts</p>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry} className="text-xs">
              Try again
            </Button>
          </div>
        ) : !shifts || shifts.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <CalendarClock className="size-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm font-medium text-[#0E2322]">No shifts yet</p>
            <p className="text-xs text-muted-foreground">
              {canCreate
                ? 'Create your first one, for example "Day 09:00 to 17:00".'
                : "Ask your administrator to create the first one."}
            </p>
            {canCreate && (
              <Button
                type="button"
                onClick={onCreate}
                className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
              >
                New shift
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {shifts.map((s) => (
              <li
                key={s.id}
                className={`py-3 flex items-center justify-between gap-3 ${s.archived ? "opacity-60" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-[#0E2322] break-words">{s.name}</p>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                      {SHIFT_TYPE_LABELS[s.type] ?? s.type}
                    </span>
                    {s.archived && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
                        Archived
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{describeShiftTimes(s)}</p>
                </div>
                {!s.archived && canEdit(s) && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => onEdit(s)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-destructive hover:text-destructive"
                      aria-label={`Archive ${s.name}`}
                      onClick={() => onArchive(s)}
                    >
                      <Archive className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
