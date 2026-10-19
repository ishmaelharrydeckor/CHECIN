import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setupProgress, type SetupStep } from "@/lib/setup-checklist";

/**
 * The "get set up" card for a new organization (see src/lib/setup-checklist.ts).
 * Presentational only: the dashboard decides whether to show it and what each step's state is.
 */
export function SetupChecklist({
  steps,
  onInvite,
  onHide,
}: {
  steps: SetupStep[];
  onInvite: () => void;
  onHide: () => void;
}) {
  const { done, total } = setupProgress(steps);
  return (
    <Card aria-label="Get set up" className="border-[#B2E2BD] bg-[#F4FBF5] shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-semibold text-[#0E2322]">Get set up</CardTitle>
            <CardDescription className="text-sm">
              {done} of {total} done. Attendance starts as soon as a tablet is paired and your team has been invited.
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onHide} className="shrink-0 text-[13px] text-slate-600">
            Hide for now
          </Button>
        </div>
        <div
          className="mt-3 h-2 rounded-full bg-white border border-[#B2E2BD] overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Setup progress"
        >
          <div className="h-full bg-[#0E2322] transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.id} className="flex items-start gap-3">
              <span
                className={`mt-0.5 size-6 shrink-0 rounded-full flex items-center justify-center text-[13px] font-semibold ${
                  step.done ? "bg-[#0E2322] text-[#C0FD9B]" : "bg-white border border-slate-300 text-slate-600"
                }`}
                aria-hidden
              >
                {step.done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${step.done ? "text-slate-500" : "text-[#0E2322]"}`}>
                    {step.title}
                    {step.done && <span className="sr-only"> (done)</span>}
                  </p>
                  {!step.done && <p className="text-[13px] text-slate-600">{step.detail}</p>}
                </div>
                {!step.done && step.id !== "team" && (
                  <Link
                    to="/settings"
                    className="shrink-0 text-[13px] font-semibold text-[#0E2322] underline underline-offset-4 hover:no-underline"
                  >
                    Open Settings
                  </Link>
                )}
                {!step.done && step.id === "team" && (
                  <Button type="button" size="sm" onClick={onInvite} className="shrink-0 bg-[#0E2322] text-[#C0FD9B] hover:bg-[#163331]">
                    Invite staff
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
