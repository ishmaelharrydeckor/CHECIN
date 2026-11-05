import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/** Shown before the first session: exactly what is recorded and what never is. Agreeing is required. */
export function DiaryConsentCard({ text, onAgree }: { text: string; onAgree: () => Promise<string | null> }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    setBusy(true);
    setError(null);
    const problem = await onAgree();
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-600" /> Before your first work session
        </CardTitle>
        <CardDescription className="text-xs">Please read this. It is the same for everyone in your organization.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-[#0E2322]">{text}</p>
        <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
          <li>Only numbers are kept: how many key presses, clicks, scrolls and mouse movements happened inside this page, in 10-minute blocks.</li>
          <li>Work in other programs, tabs or windows cannot be seen, and is not recorded.</li>
          <li>Your hours come from your session and your answers to "still here?" checks, not from how busy you look.</li>
          <li>You can see everything recorded about your day, and your manager decides whether the day counts. Nothing is decided automatically.</li>
        </ul>
        <div className="flex items-start gap-3">
          <Checkbox id="diary-consent" checked={checked} onCheckedChange={(v) => setChecked(v === true)} disabled={busy} className="mt-0.5" />
          <Label htmlFor="diary-consent" className="text-sm font-normal leading-snug">
            I have read this and agree to use the work-from-home diary.
          </Label>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <Button
          type="button"
          disabled={!checked || busy}
          onClick={() => void agree()}
          className="h-10 w-full sm:w-auto bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
        >
          {busy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
          Agree and continue
        </Button>
      </CardContent>
    </Card>
  );
}
