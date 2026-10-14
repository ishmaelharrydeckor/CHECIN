import type { AnalyticsSummary } from "@/lib/analytics-types";
import { formatClock } from "@/lib/attendance-today";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays } from "lucide-react";
import { AnalyticsKpiTiles } from "./AnalyticsKpiTiles";
import { AnalyticsTrendChart } from "./AnalyticsTrendChart";
import { AnalyticsDepartments } from "./AnalyticsDepartments";
import { formatDateLong, hasData } from "./format";

/**
 * The analytics screen: period control, three KPI tiles, a day-by-day chart and
 * a department list.
 *
 * Presentational only: it renders exactly what it is given. It does not fetch,
 * does not import Firebase, has no timers, and calculates nothing. The period
 * control only reports the choice; the integrator makes it fetch.
 */

export type AnalyticsPeriod = "this-week" | "last-7" | "last-14" | "last-30";

export const ANALYTICS_PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: "this-week", label: "This week" },
  { key: "last-7", label: "Last 7 days" },
  { key: "last-14", label: "Last 14 days" },
  { key: "last-30", label: "Last 30 days" },
];

interface AnalyticsPanelProps {
  data: AnalyticsSummary | null;
  loading: boolean;
  error: string | null;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  onRefresh?: () => void;
}

export function AnalyticsPanel({ data, loading, error, period, onPeriodChange, onRefresh }: AnalyticsPanelProps) {
  if (!data && loading) {
    return <AnalyticsLoading period={period} onPeriodChange={onPeriodChange} />;
  }
  if (!data) {
    return <AnalyticsUnavailable message={error} period={period} onPeriodChange={onPeriodChange} onRefresh={onRefresh} />;
  }

  const noData = !data.trend.some(hasData);
  const rangeLabel = `${formatDateLong(data.from)} to ${formatDateLong(data.to)}`;

  return (
    <section className="space-y-6" aria-label="Attendance analytics" aria-busy={loading}>
      <PanelHeader
        subtitle={`${rangeLabel} · ${data.teamSize} ${data.teamSize === 1 ? "person" : "people"} · updated ${formatClock(data.generatedAt, data.timezone)}`}
        period={period}
        onPeriodChange={onPeriodChange}
        disabled={loading}
      />

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {data.truncated && (
        <p role="status" className="text-xs font-semibold text-amber-800">
          Showing partial results. Choose a shorter period.
        </p>
      )}

      <AnalyticsKpiTiles data={data} />

      {noData ? (
        <Card className="border-border/80 shadow-sm">
          <CardContent className="py-12 text-center space-y-3">
            <CalendarDays className="size-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm font-medium text-[#0E2322]">No check-ins in this period</p>
            <p className="text-xs text-muted-foreground">
              The chart and department figures appear once people start checking in. You can also try a longer
              period.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <AnalyticsTrendChart trend={data.trend} />
          <AnalyticsDepartments departments={data.byDepartment} />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function PanelHeader({
  subtitle,
  period,
  onPeriodChange,
  disabled,
}: {
  subtitle: string;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-[#0E2322]">Attendance analytics</h2>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Work from home counts as attended. Hours exclude work-from-home days.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Period">
        {ANALYTICS_PERIODS.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={period === p.key ? "default" : "outline"}
            onClick={() => onPeriodChange(p.key)}
            disabled={disabled}
            aria-pressed={period === p.key}
            className={
              period === p.key ? "bg-[#0E2322] hover:bg-[#163331] text-white text-xs" : "border-slate-200 text-xs"
            }
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function AnalyticsLoading({
  period,
  onPeriodChange,
}: {
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
}) {
  return (
    <section className="space-y-6" aria-busy="true" aria-label="Loading attendance analytics">
      <PanelHeader
        subtitle="Loading attendance analytics…"
        period={period}
        onPeriodChange={onPeriodChange}
        disabled
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-3xl" />
        ))}
      </div>
      <Card className="border-border/80 shadow-sm">
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      <Card className="border-border/80 shadow-sm">
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function AnalyticsUnavailable({
  message,
  period,
  onPeriodChange,
  onRefresh,
}: {
  message: string | null;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  onRefresh?: () => void;
}) {
  return (
    <section className="space-y-6" aria-label="Attendance analytics">
      <PanelHeader subtitle="Attendance over a period" period={period} onPeriodChange={onPeriodChange} disabled={false} />
      <Card className="border-border/80 shadow-sm">
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-sm font-medium text-[#0E2322]">Couldn't load attendance analytics</p>
          <p role="alert" className="text-sm text-destructive">
            {message ?? "The figures aren't available yet."}
          </p>
          {onRefresh && (
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} className="text-xs">
              Try again
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
