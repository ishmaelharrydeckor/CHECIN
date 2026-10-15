import type { AnalyticsTrendDay } from "@/lib/analytics-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { formatDayShort, hasData } from "./format";

/** Fewer days than this is not a trend, so a sentence is shown instead of a chart. */
const MIN_DAYS_FOR_CHART = 3;

interface AnalyticsTrendChartProps {
  trend: AnalyticsTrendDay[];
}

/**
 * One bar pair per working day that has check-ins: attended and late.
 * Days without any data (future days, or days nobody scanned) are left out,
 * never drawn as zero. Bars start at 0.
 */
export function AnalyticsTrendChart({ trend }: AnalyticsTrendChartProps) {
  const days = trend.filter(hasData);
  const someLeftOut = trend.some((d) => !hasData(d));
  const rows = days.map((d) => ({ day: formatDayShort(d.dayKey), attended: d.attended, late: d.late }));

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">Attendance by day</CardTitle>
            <CardDescription className="text-xs">
              Working days with check-ins: people who attended, and how many of them were late.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0E2322]" /> Attended
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFD153]" /> Late
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {days.length < MIN_DAYS_FOR_CHART ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Not enough days yet to draw a trend. The chart appears once at least {MIN_DAYS_FOR_CHART} days have
            check-ins.
          </div>
        ) : (
          <>
            <div className="h-64 w-full" role="img" aria-label="Bar chart of people attended and late for each working day">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={2} barCategoryGap="20%">
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={12}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    domain={[0, "dataMax"]}
                  />
                  <RechartsTooltip cursor={{ fill: "#F1F5F9" }} />
                  <Bar dataKey="attended" name="Attended" fill="#0E2322" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="late" name="Late" fill="#FFD153" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {someLeftOut && (
              <p className="text-xs text-slate-500 mt-3">Days with no check-ins are not drawn.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
