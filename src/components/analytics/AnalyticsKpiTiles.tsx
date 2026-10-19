import type { ReactNode } from "react";
import type { AnalyticsSummary } from "@/lib/analytics-types";
import { Building2, CheckCircle2, Clock } from "lucide-react";
import { formatPercent } from "./format";

interface AnalyticsKpiTilesProps {
  data: AnalyticsSummary;
}

/**
 * Three KPI tiles. Every figure and note comes from the data; nothing is
 * calculated here, and there are no change arrows or comparisons.
 */
export function AnalyticsKpiTiles({ data }: AnalyticsKpiTilesProps) {
  const { attendanceRate, punctuality, avgHoursPerDay } = data;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Tile
        tone="white"
        label="Attendance rate"
        icon={<CheckCircle2 className="size-4" />}
        value={formatPercent(attendanceRate.percent)}
        note={
          attendanceRate.percent === null
            ? "No attendance recorded in this period yet"
            : `${attendanceRate.attendedDays} of ${attendanceRate.expectedDays} expected days`
        }
      />
      <Tile
        tone="white"
        label="Punctuality"
        icon={<Clock className="size-4" />}
        value={formatPercent(punctuality.percent)}
        note={
          punctuality.percent === null
            ? "No arrivals recorded in this period yet"
            : `${punctuality.onTimeDays} of ${punctuality.arrivalDays} arrivals on time`
        }
      />
      <Tile
        tone="white"
        label="Average hours per day"
        icon={<Building2 className="size-4" />}
        value={avgHoursPerDay.hours === null ? "—" : `${avgHoursPerDay.hours.toFixed(1)} hrs`}
        note={
          avgHoursPerDay.hours === null
            ? "Shows once someone has a completed day"
            : `Across ${avgHoursPerDay.daysCounted} worked days`
        }
      />
    </div>
  );
}

type TileTone = "white" | "mint";

const TONES: Record<TileTone, { box: string; label: string; icon: string; note: string }> = {
  white: {
    box: "bg-white border-slate-200/80",
    label: "text-slate-500",
    icon: "bg-slate-50 text-slate-700",
    note: "text-slate-500",
  },
  mint: {
    box: "bg-[#CBEED3] border-[#B2E2BD]",
    label: "text-[#0E2322]",
    icon: "bg-white/70 text-emerald-900",
    note: "text-[#0E2322]",
  },
};

function Tile({
  tone,
  label,
  icon,
  value,
  note,
}: {
  tone: TileTone;
  label: string;
  icon: ReactNode;
  value: string;
  note: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`${t.box} p-6 rounded-3xl border shadow-xs flex flex-col justify-between gap-3 min-w-0`}>
      <div className={`flex items-start justify-between gap-2 ${t.label}`}>
        <span className="text-xs font-semibold uppercase tracking-wider leading-snug">{label}</span>
        <span className={`p-2 rounded-xl shrink-0 ${t.icon}`}>{icon}</span>
      </div>
      <div>
        <div className="text-3xl font-extrabold text-[#0E2322]">{value}</div>
        <div className={`text-[13px] mt-2 font-medium ${t.note}`}>{note}</div>
      </div>
    </div>
  );
}
