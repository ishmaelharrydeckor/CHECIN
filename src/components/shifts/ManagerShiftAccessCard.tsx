import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { authedFetch, type ManagerShiftRow } from "./shiftApi";

/** Organization admins only: which managers may create shifts and assign their own team. */
export function ManagerShiftAccessCard() {
  const [managers, setManagers] = useState<ManagerShiftRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // a manager's id, or "all"

  const load = useCallback(async () => {
    setLoadError(null);
    const result = await authedFetch<{ managers: ManagerShiftRow[] }>("/api/shifts/access");
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setManagers(result.data.managers);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setOne(uid: string, allowed: boolean) {
    setSaving(uid);
    const result = await authedFetch<{ ok: true }>("/api/shifts/access", {
      method: "POST",
      body: JSON.stringify({ targetUid: uid, allowed }),
    });
    setSaving(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setManagers((prev) => prev && prev.map((m) => (m.uid === uid ? { ...m, shiftAdmin: allowed } : m)));
    toast.success(
      allowed
        ? "Manager can now manage shifts for their team. They'll be asked to sign in again."
        : "Manager can no longer manage shifts.",
    );
  }

  async function setAll(allowed: boolean) {
    setSaving("all");
    const result = await authedFetch<{ ok: true }>("/api/shifts/access", {
      method: "POST",
      body: JSON.stringify({ all: true, allowed }),
    });
    setSaving(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setManagers((prev) => prev && prev.map((m) => ({ ...m, shiftAdmin: allowed })));
    toast.success(
      allowed
        ? "All managers can now manage shifts for their team. They'll be asked to sign in again."
        : "No manager can manage shifts now.",
    );
  }

  const busy = saving !== null;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Who can manage shifts</CardTitle>
        <CardDescription className="text-xs">
          A manager you switch on can create their own shifts and assign their own team. Managers you leave off can
          still see their team's shifts. A manager is asked to sign in again when you change this.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadError && managers === null ? (
          <div className="py-6 text-center space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="text-xs">
              Try again
            </Button>
          </div>
        ) : managers === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading managers">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || managers.length === 0}
                onClick={() => void setAll(true)}
                className="text-xs bg-[#0E2322] hover:bg-[#163331] text-white"
              >
                {saving === "all" ? "Saving..." : "Turn on for all managers"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || managers.length === 0}
                onClick={() => void setAll(false)}
                className="text-xs border-slate-300"
              >
                Turn off for all
              </Button>
            </div>

            {managers.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                You have no managers yet. Invite one from the Roster.
              </div>
            ) : (
              <ul className="divide-y divide-border/70 rounded-xl border border-slate-200 px-4">
                {managers.map((m) => (
                  <li key={m.uid} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0E2322] truncate">{m.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <Switch
                      aria-label={`Allow ${m.displayName} to manage shifts`}
                      checked={m.shiftAdmin}
                      disabled={busy}
                      onCheckedChange={(v) => void setOne(m.uid, v)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
