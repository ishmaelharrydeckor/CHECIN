import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch } from "@/components/shifts/shiftApi";
import { AnalyticsPanel, type AnalyticsPeriod } from "@/components/analytics/AnalyticsPanel";
import type { AnalyticsSummary } from "@/lib/analytics-types";

/** Connects the analytics panel to /api/analytics. The panel itself only draws and reports the period. */
export function AnalyticsSection() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("last-14");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A slow answer for an earlier period must never replace the answer for the period now chosen.
  const latest = useRef(0);

  const load = useCallback(async (next: AnalyticsPeriod, fresh: boolean) => {
    const ticket = ++latest.current;
    setLoading(true);
    setError(null);
    const result = await authedFetch<{ summary: AnalyticsSummary }>(
      `/api/analytics?period=${next}${fresh ? "&fresh=1" : ""}`,
    );
    if (ticket !== latest.current) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data.summary);
  }, []);

  useEffect(() => {
    void load(period, false);
  }, [load, period]);

  return (
    <AnalyticsPanel
      data={data}
      loading={loading}
      error={error}
      period={period}
      onPeriodChange={setPeriod}
      onRefresh={() => void load(period, true)}
    />
  );
}
