import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  countsPerDay,
  formatDayHeader,
  formatDayMonth,
  formatWeekRange,
  indexAssignments,
  mondayOf,
  shiftWeek,
  weekDays,
  type RotaAssignment,
} from "@/lib/shift-rota";
import { AssignShiftsDialog, type AssignPreset } from "./AssignShiftsDialog";
import { authedFetch, type RotaMember, type ShiftContext, type ShiftRow } from "./shiftApi";

const PEOPLE_SHOWN = 100;

interface RotaTabProps {
  /** Whether the signed-in person may assign shifts (an admin, or a manager an admin has allowed). */
  canAssign: boolean;
  /** The shifts that can be assigned (not archived). */
  shifts: ShiftRow[];
}

/** The week at a glance: who works which shift on which day, with a way to assign and clear. */
export function RotaTab({ canAssign, shifts }: RotaTabProps) {
  const [context, setContext] = useState<ShiftContext | null>(null);
  const [members, setMembers] = useState<RotaMember[] | null>(null);
  const [assignments, setAssignments] = useState<RotaAssignment[] | null>(null);
  const [monday, setMonday] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [preset, setPreset] = useState<AssignPreset | null>(null);
  const [clearing, setClearing] = useState<{ member: RotaMember; day: string } | null>(null);
  const [clearBusy, setClearBusy] = useState(false);

  // The organization's today and the people in scope, once.
  const loadBase = useCallback(async () => {
    setLoadError(null);
    const [ctx, people] = await Promise.all([
      authedFetch<ShiftContext>("/api/shifts/settings"),
      authedFetch<{ members: RotaMember[] }>("/api/admin/staff-invites"),
    ]);
    if (!ctx.ok) return setLoadError(ctx.error);
    if (!people.ok) return setLoadError(people.error);
    setContext(ctx.data);
    setMembers(people.data.members);
    setMonday((m) => m ?? mondayOf(ctx.data.today));
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const days = useMemo(() => (monday ? weekDays(monday) : []), [monday]);

  const loadWeek = useCallback(async () => {
    if (!monday) return;
    setWeekError(null);
    const week = weekDays(monday);
    const result = await authedFetch<{ assignments: RotaAssignment[] }>(
      `/api/shifts/assignments?from=${week[0]}&to=${week[6]}`,
    );
    if (!result.ok) {
      setWeekError(result.error);
      return;
    }
    setAssignments(result.data.assignments);
  }, [monday]);

  useEffect(() => {
    setAssignments(null);
    void loadWeek();
  }, [loadWeek]);

  const index = useMemo(() => indexAssignments(assignments ?? []), [assignments]);

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (members ?? [])
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [members, search]);
  const shown = people.slice(0, PEOPLE_SHOWN);
  const totals = useMemo(
    () => countsPerDay(index, days, shown.map((p) => p.uid)),
    [index, days, shown],
  );

  const today = context?.today ?? "";
  const thisMonday = today ? mondayOf(today) : null;

  function openAssign(next: AssignPreset | null) {
    setPreset(next);
    setAssignOpen(true);
  }

  async function confirmClear() {
    if (!clearing) return;
    setClearBusy(true);
    const result = await authedFetch<{ removed: number; skipped: unknown[] }>("/api/shifts/assignments", {
      method: "DELETE",
      body: JSON.stringify({ employeeIds: [clearing.member.uid], fromDay: clearing.day, toDay: clearing.day }),
    });
    setClearBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.removed > 0
        ? `Cleared ${clearing.member.displayName} on ${formatDayMonth(clearing.day)}.`
        : "Nothing was cleared. Attendance is already recorded for that day.",
    );
    setClearing(null);
    void loadWeek();
  }

  // One cell: the shift on that day, with the right actions when editing is allowed.
  function renderCell(member: RotaMember, day: string, compact?: boolean) {
    const shift = index.get(member.uid)?.get(day);
    const editable = canAssign && day >= today;
    if (!shift) {
      return editable ? (
        <button
          type="button"
          aria-label={`Assign a shift to ${member.displayName} on ${formatDayMonth(day)}`}
          onClick={() => openAssign({ employeeIds: [member.uid], fromDay: day, toDay: day })}
          className={`${compact ? "h-9 px-3" : "h-8 w-full"} rounded-lg border border-dashed border-slate-200 text-slate-300 hover:text-slate-500 hover:border-slate-300 flex items-center justify-center cursor-pointer`}
        >
          <Plus className="size-3.5" />
        </button>
      ) : (
        <span className="text-slate-300 text-sm">-</span>
      );
    }
    return (
      <span className="inline-flex max-w-full items-center gap-1">
        <span
          title={`${shift.name}${shift.start && shift.end ? `, ${shift.start} to ${shift.end}` : ""}`}
          className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 truncate"
        >
          {shift.name}
        </span>
        {editable && (
          <button
            type="button"
            aria-label={`Clear ${member.displayName} on ${formatDayMonth(day)}`}
            onClick={() => setClearing({ member, day })}
            className="rounded-full p-1 text-slate-400 hover:text-destructive hover:bg-slate-100 cursor-pointer"
          >
            <X className="size-3" />
          </button>
        )}
      </span>
    );
  }

  const loadingBase = context === null && loadError === null;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">Rota</CardTitle>
            <CardDescription className="text-xs">
              {canAssign
                ? "Who works which shift. Tap + to assign a day, or use Assign shifts for many people and days."
                : "Who works which shift. Only an administrator, or a manager they have allowed, can change it."}
            </CardDescription>
          </div>
          {canAssign && (
            <Button
              type="button"
              onClick={() => openAssign(null)}
              disabled={shifts.length === 0 || members === null}
              className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium self-start sm:self-auto"
            >
              <Plus className="size-4 mr-1.5" /> Assign shifts
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm font-medium text-[#0E2322]">Couldn't load the rota</p>
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadBase()} className="text-xs">
              Try again
            </Button>
          </div>
        ) : loadingBase || monday === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading the rota">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            {canAssign && shifts.length === 0 && (
              <p className="text-xs text-amber-800">Create a shift on the Shifts tab first, then assign it here.</p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 border-slate-200"
                  aria-label="Previous week"
                  onClick={() => setMonday(shiftWeek(monday, -1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <p className="text-sm font-medium text-[#0E2322] min-w-[11rem] text-center">{formatWeekRange(monday)}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 border-slate-200"
                  aria-label="Next week"
                  onClick={() => setMonday(shiftWeek(monday, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
                {thisMonday && monday !== thisMonday && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 border-slate-200 text-xs"
                    onClick={() => setMonday(thisMonday)}
                  >
                    This week
                  </Button>
                )}
              </div>
              <div className="relative sm:w-64">
                <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email"
                  aria-label="Search people"
                  className="h-10 pl-9 text-sm"
                />
              </div>
            </div>

            {weekError && assignments === null ? (
              <div className="py-8 text-center space-y-3">
                <p role="alert" className="text-sm text-destructive">
                  {weekError}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadWeek()} className="text-xs">
                  Try again
                </Button>
              </div>
            ) : members === null || assignments === null ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading this week">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : people.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {search ? "No one matches your search." : "No one to show yet. Invite people from the Roster."}
              </div>
            ) : (
              <>
                {/* Wide screens: one row per person, one column per day */}
                <div className="hidden md:block rounded-xl border border-slate-200 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-muted-foreground border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Person</th>
                        {days.map((d) => (
                          <th
                            key={d}
                            className={`py-3 px-2 font-semibold text-center ${d === today ? "text-[#0E2322]" : ""}`}
                          >
                            {formatDayHeader(d)}
                            {d === today && <span className="block text-[10px] font-medium">Today</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shown.map((m) => (
                        <tr key={m.uid}>
                          <td className="py-2.5 px-4 min-w-[10rem]">
                            <p className="font-medium text-[#0E2322] truncate">{m.displayName}</p>
                            {m.department && <p className="text-xs text-muted-foreground truncate">{m.department}</p>}
                          </td>
                          {days.map((d) => (
                            <td key={d} className="py-2.5 px-2 text-center">
                              {renderCell(m, d)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 text-xs text-muted-foreground border-t border-slate-200">
                      <tr>
                        <td className="py-2.5 px-4 font-semibold">On a shift</td>
                        {totals.map((n, i) => (
                          <td key={days[i]} className="py-2.5 px-2 text-center font-semibold text-[#0E2322]">
                            {n}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Phones: one card per person, the week as a list */}
                <ul className="md:hidden space-y-3">
                  {shown.map((m) => (
                    <li key={m.uid} className="rounded-xl border border-slate-200 p-4">
                      <p className="text-sm font-medium text-[#0E2322] truncate">{m.displayName}</p>
                      {m.department && <p className="text-xs text-muted-foreground truncate">{m.department}</p>}
                      <ul className="mt-2 divide-y divide-border/70">
                        {days.map((d) => (
                          <li key={d} className="py-2 flex items-center justify-between gap-3">
                            <span className={`text-xs ${d === today ? "font-semibold text-[#0E2322]" : "text-slate-600"}`}>
                              {formatDayHeader(d)}
                              {d === today && " (today)"}
                            </span>
                            {renderCell(m, d, true)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>

                {people.length > PEOPLE_SHOWN && (
                  <p className="text-xs text-muted-foreground">
                    Showing the first {PEOPLE_SHOWN} of {people.length}. Use the search to find the rest.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </CardContent>

      {canAssign && members && context && (
        <AssignShiftsDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          shifts={shifts}
          members={members}
          today={context.today}
          weekStart={monday ?? context.today}
          preset={preset}
          onDone={() => void loadWeek()}
        />
      )}

      <AlertDialog open={clearing !== null} onOpenChange={(open) => !clearBusy && !open && setClearing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this shift?</AlertDialogTitle>
            <AlertDialogDescription>
              {clearing ? `${clearing.member.displayName} will have no shift on ${formatDayMonth(clearing.day)}.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearBusy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearBusy}
              onClick={(e) => {
                e.preventDefault();
                void confirmClear();
              }}
            >
              {clearBusy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
