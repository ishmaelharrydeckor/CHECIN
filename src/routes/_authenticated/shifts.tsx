import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { canEditShift } from "@/lib/shift-requests";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManagerShiftAccessCard } from "@/components/shifts/ManagerShiftAccessCard";
import { ShiftFormDialog } from "@/components/shifts/ShiftFormDialog";
import { ShiftSettingsCard } from "@/components/shifts/ShiftSettingsCard";
import { ShiftsList } from "@/components/shifts/ShiftsList";
import { authedFetch, type ShiftRow } from "@/components/shifts/shiftApi";

export const Route = createFileRoute("/_authenticated/shifts")({
  head: () => ({ meta: [{ title: "Shifts — ChecIN" }] }),
  component: ShiftsPage,
});

function ShiftsPage() {
  const { user, role, isOrgAdmin, canManageShifts } = useAuth();

  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftRow | null>(null);
  const [archiving, setArchiving] = useState<ShiftRow | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  // The same rule the server applies: admins edit any shift; an allowed manager edits only their own.
  const caller = useMemo(
    () => ({ uid: user?.id ?? "", role: role ?? null, shiftAdmin: role === "manager" && canManageShifts }),
    [user?.id, role, canManageShifts],
  );
  const canEdit = useCallback((s: ShiftRow) => canEditShift(caller, s.createdBy), [caller]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await authedFetch<{ shifts: ShiftRow[] }>(
      `/api/shifts${showArchived && isOrgAdmin ? "?archived=1" : ""}`,
    );
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShifts(result.data.shifts);
  }, [showArchived, isOrgAdmin]);

  useEffect(() => {
    if (canManageShifts) void load();
  }, [canManageShifts, load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(shift: ShiftRow) {
    setEditing(shift);
    setFormOpen(true);
  }

  async function confirmArchive() {
    if (!archiving) return;
    setArchiveBusy(true);
    const result = await authedFetch<{ ok: true }>(`/api/shifts?id=${encodeURIComponent(archiving.id)}`, {
      method: "DELETE",
    });
    setArchiveBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${archiving.name}" archived`);
    setArchiving(null);
    void load();
  }

  // Anyone else is sent away by the app shell; show nothing meanwhile.
  if (!canManageShifts) return null;

  const shiftsSection = (
    <div className="space-y-4">
      {isOrgAdmin && (
        <div className="flex items-center gap-2">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="show-archived" className="text-xs text-muted-foreground cursor-pointer">
            Show archived shifts
          </Label>
        </div>
      )}
      <ShiftsList
        shifts={shifts}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        canEdit={canEdit}
        onEdit={openEdit}
        onArchive={setArchiving}
        onCreate={openCreate}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Shifts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plan who works when. Shifts only apply once an administrator switches them on.
          </p>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium self-start sm:self-auto"
        >
          <Plus className="size-4 mr-1.5" /> New shift
        </Button>
      </div>

      {isOrgAdmin ? (
        <Tabs defaultValue="shifts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="shifts">Shifts</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="managers">Managers</TabsTrigger>
          </TabsList>
          <TabsContent value="shifts">{shiftsSection}</TabsContent>
          <TabsContent value="settings">
            <ShiftSettingsCard />
          </TabsContent>
          <TabsContent value="managers">
            <ManagerShiftAccessCard />
          </TabsContent>
        </Tabs>
      ) : (
        shiftsSection
      )}

      <ShiftFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={() => void load()} />

      <AlertDialog open={archiving !== null} onOpenChange={(open) => !archiveBusy && !open && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{archiving?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              People already assigned to it keep it, but it can't be assigned to anyone new. This can't be undone
              from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveBusy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveBusy}
              onClick={(e) => {
                e.preventDefault();
                void confirmArchive();
              }}
            >
              {archiveBusy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
