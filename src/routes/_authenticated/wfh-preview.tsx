// src/routes/_authenticated/wfh-preview.tsx
// TEMPORARY. The integrator deletes this route after the WFH work lands.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MyWfhCard } from "@/components/wfh/MyWfhCard";
import { WfhTodayList } from "@/components/wfh/WfhTodayList";
import {
  SAMPLE_TODAY,
  WFH_SAMPLES,
  WFH_TODAY_SAMPLES,
  type WfhCaseKey,
} from "@/lib/wfh-sample";
import type { MyWfh, WfhTodayPerson } from "@/lib/wfh-types";

type Mode = "data" | "loading" | "error";

const CASES: { key: WfhCaseKey; label: string }[] = [
  { key: "normal", label: "Normal" },
  { key: "empty", label: "Empty" },
  { key: "full", label: "Full (30 days)" },
  { key: "declaredToday", label: "Declared today" },
];

const MODES: { key: Mode; label: string }[] = [
  { key: "data", label: "Data" },
  { key: "loading", label: "Loading" },
  { key: "error", label: "Error" },
];

function peopleFor(k: WfhCaseKey) {
  if (k === "full") return WFH_TODAY_SAMPLES.full;
  if (k === "empty") return WFH_TODAY_SAMPLES.empty;
  return WFH_TODAY_SAMPLES.normal;
}

export const Route = createFileRoute("/_authenticated/wfh-preview")({
  head: () => ({ meta: [{ title: "WFH preview — ChecIN" }] }),
  component: WfhPreview,
});

function WfhPreview() {
  const [caseKey, setCaseKey] = useState<WfhCaseKey>("normal");
  const [mode, setMode] = useState<Mode>("data");
  const [data, setData] = useState<MyWfh | null>(WFH_SAMPLES.normal);
  const [people, setPeople] = useState<WfhTodayPerson[]>(peopleFor("normal"));

  function pickCase(k: WfhCaseKey) {
    setCaseKey(k);
    setData(WFH_SAMPLES[k]);
    setPeople(peopleFor(k));
    setMode("data");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">WFH preview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Sample data only. Flip the cases to check both screens.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Case</p>
        <div className="flex flex-wrap gap-2">
          {CASES.map((c) => (
            <Button
              key={c.key}
              variant={caseKey === c.key ? "default" : "outline"}
              aria-pressed={caseKey === c.key}
              className={`h-9 text-xs ${caseKey === c.key ? "bg-[#0E2322] hover:bg-[#163331] text-white" : "border-slate-200"}`}
              onClick={() => pickCase(c.key)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">State</p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <Button
              key={m.key}
              variant={mode === m.key ? "default" : "outline"}
              aria-pressed={mode === m.key}
              className={`h-9 text-xs ${mode === m.key ? "bg-[#0E2322] hover:bg-[#163331] text-white" : "border-slate-200"}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <MyWfhCard
          today={SAMPLE_TODAY}
          data={mode === "error" ? null : data}
          loading={mode === "loading"}
          error={mode === "error" ? "Could not load your days. Check your connection and try again." : null}
          onRetry={() => setMode("data")}
          onDeclare={async (keys) => {
            setData((d) => ({
              maxAheadDays: d?.maxAheadDays ?? 30,
              days: [
                ...(d?.days ?? []),
                ...keys.map((k) => ({ dayKey: k, declaredAt: new Date().toISOString() })),
              ],
            }));
          }}
          onCancel={async (dayKey) => {
            setData((d) =>
              d ? { ...d, days: d.days.filter((x) => x.dayKey !== dayKey) } : d,
            );
          }}
        />

        <WfhTodayList
          people={people}
          loading={mode === "loading"}
          error={mode === "error" ? "Could not load today's list. Try again." : null}
          onRetry={() => setMode("data")}
          onRemove={async (employeeId) => {
            setPeople((p) => p.filter((x) => x.employeeId !== employeeId));
          }}
        />
      </div>
    </div>
  );
}