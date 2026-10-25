import { Keyboard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useShortcutPref } from "@/components/shortcuts/useShortcutPref";

/** On My account: switch the single-letter keyboard shortcuts on or off for this device. */
export function ShortcutsSettingsCard() {
  const [on, setOn] = useShortcutPref();
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Keyboard className="size-4" aria-hidden /> Keyboard shortcuts
        </CardTitle>
        <CardDescription className="text-xs">
          Press <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-xs">?</kbd> anywhere to see them. They do nothing while you are typing in a box.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#0E2322]">Single-letter shortcuts are {on ? "on" : "off"}</p>
            <p className="text-xs text-muted-foreground">
              {on ? "Keys like g then r, /, r and j work on this device." : "Only Ctrl or Cmd with K (Jump to) and B (menu) work."}
            </p>
          </div>
          <Switch aria-label="Single-letter keyboard shortcuts" checked={on} onCheckedChange={setOn} />
        </div>
      </CardContent>
    </Card>
  );
}
