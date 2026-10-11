import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TodayPanel } from "@/components/dashboard/TodayPanel";
import { todaySamples, type TodaySampleKey } from "@/lib/today-sample";

// TEMPORARY page: the integrator deletes it once the real data is connected.
export const Route = createFileRoute("/_authenticated/today-preview")({
  head: () => ({
    meta: [{ title: "Today panel preview — ChecIN" }],
  }),
  component: TodayPreviewPage,
});

type PreviewCase = TodaySampleKey | "loading" | "error";

const CASES: { key: PreviewCase; label: string }[] = [
  { key: "normal", label: "Normal day" },
  { key: "empty", label: "Empty day" },
  { key: "manyLate", label: "Many late" },
  { key: "largeTeam", label: "Large team" },
  { key: "loading", label: "Loading" },
  { key: "error", label: "Error" },
];

const SAMPLE_ERROR = "Could not reach the server. Check your connection and try Refresh.";

function TodayPreviewPage() {
  const [active, setActive] = useState<PreviewCase>("normal");

  const data = active === "loading" || active === "error" ? null : todaySamples[active];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Today panel preview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          A temporary page for checking the Today panel with sample data. It is removed once the real data is
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

      <TodayPanel
        data={data}
        loading={active === "loading"}
        error={active === "error" ? SAMPLE_ERROR : null}
        onRefresh={() => toast.info("Refresh pressed. This preview only shows sample data.")}
      />
    </div>
  );
}
