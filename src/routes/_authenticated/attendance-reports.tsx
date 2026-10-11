import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AttendanceRegisterReport } from "@/components/reports/AttendanceRegisterReport";
import { LeaveLedgerReport } from "@/components/reports/LeaveLedgerReport";
import type { DateRange } from "@/components/reports/ReportFrame";
import { useReport } from "@/components/reports/useReport";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/attendance-reports")({
  head: () => ({
    meta: [
      { title: "Register and leave ledger — ChecIN" },
      { name: "description", content: "Attendance register and leave ledger for a date range, with CSV and PDF downloads." },
    ],
  }),
  component: AttendanceReportsPage,
});

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Only seeds the date boxes: the last 14 days up to today on this device. The server does the rest. */
function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 13);
  return { from: isoDay(from), to: isoDay(to) };
}

function RegisterTab({ range, onRangeChange }: { range: DateRange; onRangeChange: (r: DateRange) => void }) {
  const { data, loading, error, retry } = useReport("register", range);
  return (
    <AttendanceRegisterReport
      data={data}
      loading={loading}
      error={error}
      onRetry={retry}
      range={range}
      onRangeChange={onRangeChange}
    />
  );
}

function LeaveTab({ range, onRangeChange }: { range: DateRange; onRangeChange: (r: DateRange) => void }) {
  const { data, loading, error, retry } = useReport("leave", range);
  return (
    <LeaveLedgerReport
      data={data}
      loading={loading}
      error={error}
      onRetry={retry}
      range={range}
      onRangeChange={onRangeChange}
    />
  );
}

function AttendanceReportsPage() {
  const { isOrgAdmin, isManager, loading } = useAuth();
  const [tab, setTab] = useState<"register" | "leave">("register");
  const [range, setRange] = useState<DateRange>(defaultRange);

  if (!loading && !isOrgAdmin && !isManager) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Register and leave ledger</h1>
        <p role="alert" className="py-12 text-center text-sm text-muted-foreground">
          These reports are for managers and organization admins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Register and leave ledger</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isOrgAdmin ? "Everyone in your organization." : "Your team."} Pick up to 31 days, then download a CSV or PDF.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["register", "leave"] as const).map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
            className={tab === t ? "bg-[#0E2322] hover:bg-[#163331] text-white text-xs" : "border-slate-200 text-xs"}
          >
            {t === "register" ? "Attendance register" : "Leave ledger"}
          </Button>
        ))}
      </div>

      {tab === "register" ? (
        <RegisterTab range={range} onRangeChange={setRange} />
      ) : (
        <LeaveTab range={range} onRangeChange={setRange} />
      )}
    </div>
  );
}
