import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { MAX_WINDOW_MINUTES, MIN_WINDOW_MINUTES } from "@/lib/shift-engine";
import { windowFromInput } from "@/lib/shift-ui";
import { authedFetch, type ShiftSettingsData } from "./shiftApi";

/** Organization admins only: switch shifts on or off, the allowed time, and how a check-in outside it is handled. */
export function ShiftSettingsCard() {
  const [settings, setSettings] = useState<ShiftSettingsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [windowText, setWindowText] = useState("120");
  const [windowError, setWindowError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<"enabled" | "window" | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const result = await authedFetch<ShiftSettingsData>("/api/shifts/settings");
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setSettings({
      shiftsEnabled: result.data.shiftsEnabled,
      shiftScanMode: result.data.shiftScanMode,
      shiftWindowMinutes: result.data.shiftWindowMinutes,
    });
    setWindowText(String(result.data.shiftWindowMinutes));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(change: Partial<ShiftSettingsData>, key: "enabled" | "window", success: string) {
    setSavingKey(key);
    const result = await authedFetch<ShiftSettingsData>("/api/shifts/settings", {
      method: "PUT",
      body: JSON.stringify(change),
    });
    setSavingKey(null);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    setSettings({
      shiftsEnabled: result.data.shiftsEnabled,
      shiftScanMode: result.data.shiftScanMode,
      shiftWindowMinutes: result.data.shiftWindowMinutes,
    });
    setWindowText(String(result.data.shiftWindowMinutes));
    toast.success(success);
    return true;
  }

  function handleSwitch(next: boolean) {
    if (next) {
      setConfirmOn(true); // turning on changes what happens at every check-in, so ask first
      return;
    }
    void save({ shiftsEnabled: false }, "enabled", "Shifts are off. Check-ins work as they did before.");
  }

  async function confirmTurnOn() {
    const ok = await save({ shiftsEnabled: true }, "enabled", "Shifts are on.");
    if (ok) setConfirmOn(false);
  }

  async function saveWindow() {
    const parsed = windowFromInput(windowText);
    if (!parsed.ok) {
      setWindowError(parsed.error);
      return;
    }
    setWindowError(null);
    await save({ shiftWindowMinutes: parsed.value }, "window", "Allowed time saved.");
  }

  const windowChanged = settings !== null && windowText.trim() !== String(settings.shiftWindowMinutes);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Use shifts</CardTitle>
        <CardDescription className="text-xs">
          When shifts are on, people who have a shift can only check in during their allowed time: from before the
          shift starts until after it ends. People who have no shift are not affected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadError && settings === null ? (
          <div className="py-6 text-center space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="text-xs">
              Try again
            </Button>
          </div>
        ) : settings === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading settings">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0E2322]">Shifts are {settings.shiftsEnabled ? "on" : "off"}</p>
                <p className="text-xs text-muted-foreground">
                  {settings.shiftsEnabled
                    ? "Check-ins follow each person's assigned shift."
                    : "Check-ins work exactly as they did before."}
                </p>
              </div>
              <Switch
                aria-label="Use shifts"
                checked={settings.shiftsEnabled}
                disabled={savingKey !== null}
                onCheckedChange={handleSwitch}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shift-window" className="text-xs font-medium text-[#0E2322]">
                Allowed time (minutes)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="shift-window"
                  inputMode="numeric"
                  value={windowText}
                  onChange={(e) => {
                    setWindowText(e.target.value);
                    setWindowError(null);
                  }}
                  className="h-10 text-sm max-w-[8rem]"
                  disabled={savingKey !== null}
                />
                <Button
                  type="button"
                  disabled={!windowChanged || savingKey !== null}
                  onClick={() => void saveWindow()}
                  className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                >
                  {savingKey === "window" ? (
                    <>
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                How long before a shift starts, and after it ends, people can still check in. From{" "}
                {MIN_WINDOW_MINUTES} to {MAX_WINDOW_MINUTES} minutes; most organizations use 120.
              </p>
              {windowError && (
                <p role="alert" className="text-xs text-destructive">
                  {windowError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-[#0E2322]">A check-in outside the allowed time</p>
              <RadioGroup value="strict" className="space-y-2">
                <div className="flex items-start gap-3">
                  <RadioGroupItem id="mode-strict" value="strict" aria-label="Strict" className="mt-0.5" />
                  <Label htmlFor="mode-strict" className="text-sm font-normal leading-snug">
                    <span className="font-medium text-[#0E2322]">Strict.</span> The check-in is refused and not
                    recorded. The person is told why.
                  </Label>
                </div>
                <div className="flex items-start gap-3 opacity-60">
                  <RadioGroupItem id="mode-lenient" value="lenient" disabled aria-label="Lenient" className="mt-0.5" />
                  <Label htmlFor="mode-lenient" className="text-sm font-normal leading-snug">
                    <span className="font-medium text-[#0E2322]">Lenient.</span> Coming soon. For now, a check-in
                    outside the allowed time is always refused.
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <p className="text-xs text-muted-foreground">
              Changes can take up to a minute to reach the check-in screens.
            </p>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOn} onOpenChange={(open) => savingKey === null && setConfirmOn(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on shifts?</AlertDialogTitle>
            <AlertDialogDescription>
              From now on, a check-in outside someone's allowed time will be refused. People with no shift assigned
              are not affected. You can turn this off at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingKey !== null}>Not yet</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingKey !== null}
              onClick={(e) => {
                e.preventDefault();
                void confirmTurnOn();
              }}
            >
              {savingKey === "enabled" && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Turn on shifts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
