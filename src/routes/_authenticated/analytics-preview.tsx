import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AnalyticsPanel, ANALYTICS_PERIODS, type AnalyticsPeriod } from "@/components/analytics/AnalyticsPanel";
import { analyticsSamples, type AnalyticsSampleKey } from "@/lib/analytics-sample";

// TEMPORARY page: the integrator deletes it once the real data is connected.
export const Route = createFileRoute("/_authenticated/analytics-preview")({
  head: () => ({
    meta: [{ title: "Analytics preview — ChecIN" }],
  }),
  component: AnalyticsPreviewPage,
});

type PreviewCase = AnalyticsSampleKey | "loading" | "error";

const CASES: { key: PreviewCase; label: string }[] = [
  { key: "normal", label: "Normal 14 days" },
  { key: "empty", label: "Empty range" },
  { key: "almostNone", label: "Almost no data" },
  { key: "smallTeam", label: "Small team" },
  { key: "largeTeam", label: "Large team" },
  { key: "loading", label: "Loading" },
  { key: "error", label: "Error" },
];

const SAMPLE_ERROR = "Could not reach the server. Check your connection and try again.";

function AnalyticsPreviewPage() {
  const [active, setActive] = useState<PreviewCase>("normal");
  const [period, setPeriod] = useState<AnalyticsPeriod>("last-14");

  const data = active === "loading" || active === "error" ? null : analyticsSamples[active];

  const handlePeriodChange = (next: AnalyticsPeriod) => {
    setPeriod(next);
    const label = ANALYTICS_PERIODS.find((p) => p.key === next)?.label ?? next;
    toast.info(`"${label}" chosen. This preview keeps showing the same sample data.`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Analytics preview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          A temporary page for checking the analytics screen with sample data. It is removed once the real data is
          connected.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sample case">
        {CASES.map((c) => (
          <Button
            key={c.key}
            type="button"
            size="sm"
            variant={active === c.key ? "default" : "outline"}
            onClick={() => setActive(c.key)}
            aria-pressed={active === c.key}
            className={
              active === c.key ? "bg-[#0E2322] hover:bg-[#163331] text-white text-xs" : "border-slate-200 text-xs"
            }
          >
            {c.label}
          </Button>
        ))}
      </div>

      <AnalyticsPanel
        data={data}
        loading={active === "loading"}
        error={active === "error" ? SAMPLE_ERROR : null}
        period={period}
        onPeriodChange={handlePeriodChange}
        onRefresh={() => toast.info("Try again pressed. This preview only shows sample data.")}
      />
    </div>
  );
}
