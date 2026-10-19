import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { authedFetch, type SwapListData } from "./shiftApi";

/** Organization admins only: the "Allow shift swaps" switch, off until an admin turns it on. */
export function ShiftSwapSettingsCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const result = await authedFetch<SwapListData>("/api/shifts/swaps");
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setEnabled(result.data.enabled);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSwitch(next: boolean) {
    setSaving(true);
    const result = await authedFetch<{ ok: true; enabled: boolean }>("/api/shifts/swaps", {
      method: "PUT",
      body: JSON.stringify({ shiftSwapsEnabled: next }),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEnabled(result.data.enabled);
    toast.success(
      result.data.enabled
        ? "Shift swaps are on."
        : "Shift swaps are off. Requests already sent can still be cancelled.",
    );
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Allow shift swaps</CardTitle>
        <CardDescription className="text-xs">
          People can ask a colleague in their team to swap shifts on one day. The colleague accepts, then their
          manager (or an admin, when the two have different managers) approves, and both rotas change together.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadError && enabled === null ? (
          <div className="py-6 text-center space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="text-xs">
              Try again
            </Button>
          </div>
        ) : enabled === null ? (
          <Skeleton className="h-16 w-full" aria-busy="true" aria-label="Loading the swap setting" />
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#0E2322]">Shift swaps are {enabled ? "on" : "off"}</p>
              <p className="text-xs text-muted-foreground">
                {enabled
                  ? "People can ask to swap, and managers can approve."
                  : "Nobody can ask to swap. Requests already sent can only be cancelled."}
              </p>
            </div>
            <Switch aria-label="Allow shift swaps" checked={enabled} disabled={saving} onCheckedChange={handleSwitch} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
