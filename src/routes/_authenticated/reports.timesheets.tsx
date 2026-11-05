import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/reports/timesheets")({
  head: () => ({
    meta: [
      { title: "Timesheets — ChecIN" },
      { name: "description", content: "The timesheet is being rebuilt. Use the attendance register for hours in the meantime." },
    ],
  }),
  component: TimesheetsBeingRebuilt,
});

/**
 * T0 of docs/TIMESHEET-DESIGN.md. The old page estimated hours in the browser (it read only today's first 50
 * scans, expected 8 hours for everyone, counted one scan as 8 hours and judged "late" by the viewer's clock),
 * so it is switched off until the replacement, built on the same server data as the attendance register, is ready.
 * It shows no figures at all, so nothing wrong can be copied into payroll.
 */
function TimesheetsBeingRebuilt() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Timesheets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Hours worked by each person.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="border-slate-200 text-xs font-medium self-start">
          <Link to="/reports">All reports</Link>
        </Button>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Hourglass className="size-4 text-[#0E2322]" aria-hidden /> We are rebuilding this page
          </CardTitle>
          <CardDescription className="text-[13px]">
            The old version worked out hours in your browser from only part of the data, so its numbers could be wrong. We
            switched it off rather than show you figures you cannot rely on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-700">
            Until the new one is ready, the <span className="font-semibold">Attendance register</span> has the hours worked by every
            person for every day, with late, absent, leave and work-from-home days. You can download it as CSV or PDF.
          </p>
          <Button asChild className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium">
            <Link to="/attendance-reports" search={{ tab: "register" }}>
              Open the attendance register <ArrowRight className="size-4 ml-1.5" aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
