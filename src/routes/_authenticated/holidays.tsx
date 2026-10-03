import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  type Holiday,
  HOLIDAY_NAME_MAX_LENGTH,
  addHoliday,
  describeHolidayError,
  formatHolidayDate,
  isDuplicateHoliday,
  removeHoliday,
  subscribeToHolidays,
  todayIsoDate,
  updateHoliday,
  validateHolidayInput,
} from "@/lib/holidays";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { CalendarDays, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/holidays")({
  head: () => ({
    meta: [
      { title: "Public holidays — ChecIN" },
      {
        name: "description",
        content: "The public holidays your organization observes.",
      },
    ],
  }),
  component: HolidaysPage,
});

type Filter = "upcoming" | "past" | "all";

function HolidaysPage() {
  const { orgId, isOrgAdmin, loading: authLoading } = useAuth();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<Filter>("upcoming");

  // Add / edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Remove confirmation
  const [toRemove, setToRemove] = useState<Holiday | null>(null);
  const [removing, setRemoving] = useState(false);

  // Live list of this organization's holidays. orgId comes from the verified token claims.
  useEffect(() => {
    if (authLoading) return;
    if (!orgId) {
      setHolidays([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const unsubscribe = subscribeToHolidays(
      orgId,
      (items) => {
        setHolidays(items);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load holidays:", error);
        setLoadError(describeHolidayError(error));
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [orgId, authLoading, reloadKey]);

  const today = todayIsoDate();

  const visibleHolidays = useMemo(() => {
    if (filter === "upcoming") return holidays.filter((h) => h.date >= today);
    if (filter === "past") return holidays.filter((h) => h.date < today).reverse();
    return holidays;
  }, [holidays, filter, today]);

  const upcomingCount = useMemo(() => holidays.filter((h) => h.date >= today).length, [holidays, today]);

  const openAdd = () => {
    setEditing(null);
    setFormDate("");
    setFormName("");
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (holiday: Holiday) => {
    setEditing(holiday);
    setFormDate(holiday.date);
    setFormName(holiday.name);
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !isOrgAdmin) return;

    const input = { date: formDate, name: formName };
    const problem = validateHolidayInput(input);
    if (problem) {
      setFormError(problem);
      return;
    }
    if (isDuplicateHoliday(holidays, input, editing?.id)) {
      setFormError("A holiday with this name is already listed on that date.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateHoliday(editing.id, input);
        toast.success("Holiday updated.");
      } else {
        await addHoliday(orgId, input);
        toast.success("Holiday added.");
      }
      setFormOpen(false);
    } catch (err) {
      console.error("Save holiday error:", err);
      setFormError(describeHolidayError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await removeHoliday(toRemove.id);
      toast.success("Holiday removed.");
      setToRemove(null);
    } catch (err) {
      console.error("Remove holiday error:", err);
      toast.error(describeHolidayError(err));
    } finally {
      setRemoving(false);
    }
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Public holidays</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isOrgAdmin
              ? "Manage the days your organization observes as public holidays."
              : "The days your organization observes as public holidays."}
          </p>
        </div>
        {isOrgAdmin && (
          <Button
            onClick={openAdd}
            className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium self-start sm:self-auto"
          >
            <Plus className="size-4 mr-1.5" /> Add holiday
          </Button>
        )}
      </div>

      <Card className="border-border/80">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">Holiday calendar</CardTitle>
              <CardDescription className="text-xs">
                {loading
                  ? "Loading holidays…"
                  : `${holidays.length} ${holidays.length === 1 ? "holiday" : "holidays"} listed, ${upcomingCount} coming up.`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="Filter holidays">
              {filters.map((f) => (
                <Button
                  key={f.key}
                  type="button"
                  size="sm"
                  variant={filter === f.key ? "default" : "outline"}
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={
                    filter === f.key
                      ? "bg-[#0E2322] hover:bg-[#163331] text-white text-xs"
                      : "border-slate-200 text-xs"
                  }
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {authLoading || loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading holidays">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : !orgId ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Your account isn't linked to an organization yet, so there are no holidays to show.
            </div>
          ) : loadError ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReloadKey((k) => k + 1)}
                className="text-xs"
              >
                Try again
              </Button>
            </div>
          ) : holidays.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <CalendarDays className="size-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm font-medium text-[#0E2322]">No holidays yet</p>
              <p className="text-xs text-muted-foreground">
                {isOrgAdmin
                  ? "Add your first holiday so shifts, leave and absence can take it into account."
                  : "Your organization admin hasn't added any holidays yet."}
              </p>
              {isOrgAdmin && (
                <Button
                  onClick={openAdd}
                  size="sm"
                  className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs"
                >
                  <Plus className="size-4 mr-1.5" /> Add the first holiday
                </Button>
              )}
            </div>
          ) : visibleHolidays.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {filter === "upcoming"
                ? "No upcoming holidays. Switch to Past or All to see the rest."
                : "No past holidays to show."}
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {visibleHolidays.map((holiday) => {
                const isPast = holiday.date < today;
                const isToday = holiday.date === today;
                return (
                  <li
                    key={holiday.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-sm font-medium truncate ${isPast ? "text-muted-foreground" : "text-[#0E2322]"}`}
                        >
                          {holiday.name}
                        </p>
                        {isToday && <Badge className="text-[10px]">Today</Badge>}
                        {isPast && (
                          <Badge variant="secondary" className="text-[10px]">
                            Past
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatHolidayDate(holiday.date)}
                      </p>
                    </div>
                    {isOrgAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(holiday)}
                          aria-label={`Edit ${holiday.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setToRemove(holiday)}
                          aria-label={`Remove ${holiday.name}`}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Add / edit dialog (org admins only) */}
      <Dialog open={formOpen && isOrgAdmin} onOpenChange={(open) => !saving && setFormOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSave} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit holiday" : "Add holiday"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Change the date or the name, then save."
                  : "Pick the date and give the holiday a name."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="holiday-date" className="text-xs font-medium">
                Date
              </Label>
              <Input
                id="holiday-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-10 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="holiday-name" className="text-xs font-medium">
                Name
              </Label>
              <Input
                id="holiday-name"
                placeholder="e.g. Independence Day"
                value={formName}
                maxLength={HOLIDAY_NAME_MAX_LENGTH}
                onChange={(e) => setFormName(e.target.value)}
                className="h-10 text-sm"
                required
              />
            </div>

            {formError && (
              <p role="alert" className="text-xs text-destructive">
                {formError}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={saving}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs"
              >
                {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                {editing ? "Save changes" : "Add holiday"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation (org admins only) */}
      <AlertDialog
        open={toRemove !== null && isOrgAdmin}
        onOpenChange={(open) => !open && !removing && setToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              {toRemove
                ? `"${toRemove.name}" on ${formatHolidayDate(toRemove.date)} will be removed from your organization's calendar.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                void handleRemove();
              }}
            >
              {removing && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Remove holiday
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}