import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { authedFetch } from "@/components/shifts/shiftApi";
import { CHECKS_PER_HOUR_CHOICES, RETENTION_CHOICES, checksPerHourText, retentionText, type DiarySettingsView } from "@/lib/wfh-diary-review";

/** Organization admins only: switch the work diary on, how often "still here?" is asked, and how long detail is kept. */
export function DiarySettingsCard() {
  const [settings, setSettings] = useState<DiarySettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const result = await authedFetch<{ settings: DiarySettingsView }>("/api/wfh-diary?view=settings");
    if (!result.ok) return setLoadError(result.error);
    setSettings(result.data.settings);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(change: Record<string, unknown>, done: string) {
    setSaving(true);
    const result = await authedFetch<{ settings: DiarySettingsView }>("/api/wfh-diary", { method: "PUT", body: JSON.stringify(change) });
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    setSettings(result.data.settings);
    toast.success(done);
  }

  // A stored value that is not one of the usual choices is still shown, so the screen never lies about it.
  const retentionChoices = settings && !RETENTION_CHOICES.includes(settings.retentionMonths as never) ? [...RETENTION_CHOICES, settings.retentionMonths].sort((a, b) => a - b) : [...RETENTION_CHOICES];

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Work diary settings</CardTitle>
        <CardDescription className="text-xs">
          On a work-from-home day an employee can run a work session in ChecIN. Their hours come from the session and their answers to
          "still here?" checks. Only counts of key presses, clicks and scrolls inside ChecIN are kept, never what was typed or seen.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
          <Skeleton className="h-24 w-full" aria-busy="true" aria-label="Loading the diary settings" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0E2322]">The work diary is {settings.enabled ? "on" : "off"}</p>
                <p className="text-xs text-muted-foreground">
                  {settings.enabled ? "Employees can start a session on a day they declared work from home." : "Nobody can start a session."}
                </p>
              </div>
              <Switch
                aria-label="Turn the work diary on"
                checked={settings.enabled}
                disabled={saving}
                onCheckedChange={(v) => void save({ wfhDiaryEnabled: v }, v ? "The work diary is on." : "The work diary is off.")}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium text-[#0E2322]">
                How often "still here?" is asked
                <Select
                  value={String(settings.livenessPerHour)}
                  disabled={saving}
                  onValueChange={(v) => void save({ livenessChecksPerHour: Number(v) }, "Saved.")}
                >
                  <SelectTrigger className="h-10" aria-label="Still-here checks per hour">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHECKS_PER_HOUR_CHOICES.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {checksPerHourText(n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 text-xs font-medium text-[#0E2322]">
                How long block detail is kept
                <Select
                  value={String(settings.retentionMonths)}
                  disabled={saving}
                  onValueChange={(v) => void save({ diaryRetentionMonths: Number(v) }, "Saved.")}
                >
                  <SelectTrigger className="h-10" aria-label="Months to keep detail">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {retentionChoices.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {retentionText(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Each day's totals are kept after the detail is removed. Whether diary hours count toward overtime is a separate decision and is not
              switched on here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
