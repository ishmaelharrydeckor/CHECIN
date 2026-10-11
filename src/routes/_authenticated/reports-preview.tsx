// TEMPORARY preview page. The integrator deletes this once real data is connected.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AttendanceRegisterReport } from "@/components/reports/AttendanceRegisterReport";
import { LeaveLedgerReport } from "@/components/reports/LeaveLedgerReport";
import type { DateRange } from "@/components/reports/ReportFrame";
import {
  DEFAULT_SAMPLE_RANGE,
  getSampleLeaveLedger,
  getSampleRegister,
  type SampleCase,
} from "@/lib/report-sample";

export const Route = createFileRoute("/_authenticated/reports-preview")({
  head: () => ({ meta: [{ title: "Reports preview (sample data) — ChecIN" }] }),
  component: ReportsPreviewPage,
});

type Scenario = "normal" | "small" | "empty" | "large" | "loading" | "error";

const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: "normal", label: "Normal (9 people)" },
  { id: "small", label: "Small (3, tricky names)" },
  { id: "empty", label: "Empty" },
  { id: "large", label: "Large (150)" },
  { id: "loading", label: "Loading" },
  { id: "error", label: "Error" },
];

function ReportsPreviewPage() {
  const [report, setReport] = useState<"register" | "leave">("register");
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [range, setRange] = useState<DateRange>(DEFAULT_SAMPLE_RANGE);

  const sampleCase: SampleCase =
    scenario === "loading" || scenario === "error" ? "normal" : (scenario as SampleCase);
  const loading = scenario === "loading";
  const error = scenario === "error" ? "We couldn't load this report. Please try again." : null;

  const register = useMemo(() => getSampleRegister(sampleCase, range), [sampleCase, range]);
  const ledger = useMemo(() => getSampleLeaveLedger(sampleCase, range), [sampleCase, range]);

  const shared = {
    loading,
    error,
    onRetry: () => setScenario("normal"),
    range,
    onRangeChange: setRange,
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#0E2322]">Reports preview</h1>
        <p className="text-xs text-muted-foreground">
          Sample data only. Flip between the cases below. This page will be removed once real data is connected.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(["register", "leave"] as const).map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={report === r ? "default" : "outline"}
              onClick={() => setReport(r)}
              className="text-xs"
            >
              {r === "register" ? "Attendance register" : "Leave ledger"}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <Button
              key={s.id}
              type="button"
              size="sm"
              variant={scenario === s.id ? "default" : "outline"}
              onClick={() => setScenario(s.id)}
              className="text-xs"
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {report === "register" ? (
        <AttendanceRegisterReport data={register} {...shared} />
      ) : (
        <LeaveLedgerReport data={ledger} {...shared} />
      )}
    </div>
  );
}