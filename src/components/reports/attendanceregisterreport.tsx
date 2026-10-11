import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AttendanceRegister, RegisterStatus } from "@/lib/report-types";
import {
  buildRegisterPdf,
  dayCellText,
  downloadPdf,
  downloadTextFile,
  formatHours,
  registerToCsv,
  reportFilename,
} from "@/lib/report-export";
import { ReportFrame, type ReportViewProps } from "./ReportFrame";

const PAGE_SIZE = 50;

// Status colours live in one place so they are easy to swap for the guide's exact values.
const STATUS_META: Record<RegisterStatus, { label: string; code: string; cell: string }> = {
  present: { label: "Present", code: "P", cell: "bg-[#CBEED3] text-[#0E2322]" },
  wfh: { label: "Work from home", code: "W", cell: "bg-blue-100 text-blue-900" },
  leave: { label: "On leave", code: "L", cell: "bg-purple-100 text-purple-900" },
  holiday: { label: "Holiday", code: "H", cell: "bg-slate-100 text-slate-500" },
  absent: { label: "Absent", code: "A", cell: "bg-rose-100 text-rose-900" },
};

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600">
      {(Object.keys(STATUS_META) as RegisterStatus[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`inline-flex size-4 items-center justify-center rounded text-[9px] font-semibold ${STATUS_META[s].cell}`}>
            {STATUS_META[s].code}
          </span>
          {STATUS_META[s].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-4 rounded ring-2 ring-amber-400" /> Late
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="underline font-semibold">U</span> Left early
      </span>
    </div>
  );
}

export function AttendanceRegisterReport({
  data,
  loading,
  error,
  onRetry,
  range,
  onRangeChange,
}: ReportViewProps<AttendanceRegister>) {
  const isDesktop = useIsDesktop();
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => setVisible(PAGE_SIZE), [data]);

  const rows = data?.rows ?? [];
  const dayKeys = rows[0]?.days.map((d) => d.dayKey) ?? [];
  const shown = rows.slice(0, visible);

  const downloadCsv = () => {
    if (!data) return;
    downloadTextFile(reportFilename("attendance-register", data.from, data.to, "csv"), registerToCsv(data));
  };
  const downloadPdfFile = async () => {
    if (!data) return;
    const doc = await buildRegisterPdf(data);
    downloadPdf(doc, reportFilename("attendance-register", data.from, data.to, "pdf"));
  };

  return (
    <ReportFrame
      title="Attendance register"
      description="One row per person, one column per day."
      range={range}
      onRangeChange={onRangeChange}
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={rows.length === 0}
      emptyMessage="No attendance to show for this range."
      rowCount={rows.length}
      truncated={!!data?.truncated}
      onDownloadCsv={downloadCsv}
      onDownloadPdf={downloadPdfFile}
    >
      <Legend />

      {isDesktop ? (
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-white shadow-sm">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold">Person</th>
                <th className="bg-slate-50 px-3 py-2 text-left font-semibold">Department</th>
                {dayKeys.map((k) => (
                  <th key={k} title={k} className="bg-slate-50 px-0 py-2 text-center text-[10px] font-semibold">
                    {k.slice(8)}
                  </th>
                ))}
                {["Present", "Late", "Absent", "Leave", "Hours"].map((h) => (
                  <th key={h} className="bg-slate-50 px-2 py-2 text-center font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.employeeId} className="hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-white border-t border-slate-100 px-3 py-1.5">
                    <div className="font-medium text-[#0E2322] max-w-[10rem] break-words">{r.name}</div>
                  </td>
                  <td className="border-t border-slate-100 px-3 py-1.5 text-slate-600 max-w-[8rem] break-words">
                    {r.department}
                  </td>
                  {r.days.map((d) => {
                    const meta = STATUS_META[d.status];
                    const text = `${d.dayKey}: ${dayCellText(d)}`;
                    return (
                      <td key={d.dayKey} className="border-t border-slate-100 p-0.5">
                        <span
                          title={text}
                          aria-label={text}
                          className={`flex size-5 items-center justify-center rounded text-[9px] font-semibold ${meta.cell} ${
                            d.late ? "ring-2 ring-amber-400" : ""
                          } ${d.earlyDeparture ? "underline" : ""}`}
                        >
                          {meta.code}
                        </span>
                      </td>
                    );
                  })}
                  <td className="border-t border-slate-100 px-2 text-center">{r.totals.presentDays}</td>
                  <td className="border-t border-slate-100 px-2 text-center">{r.totals.lateDays}</td>
                  <td className="border-t border-slate-100 px-2 text-center">{r.totals.absentDays}</td>
                  <td className="border-t border-slate-100 px-2 text-center">{r.totals.leaveDays}</td>
                  <td className="border-t border-slate-100 px-2 text-center font-medium">
                    {formatHours(r.totals.minutesWorked)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => {
            // A short list of the days worth a look: absent, on leave, late or left early.
            const attention = r.days.filter(
              (d) => d.status === "absent" || d.status === "leave" || d.late || d.earlyDeparture,
            );
            return (
              <li key={r.employeeId} className="rounded-2xl border border-border/70 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0E2322] break-words">{r.name}</p>
                    <p className="text-xs text-muted-foreground break-words">{r.department}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-[#0E2322]">
                    {formatHours(r.totals.minutesWorked)} <span className="text-xs font-normal text-muted-foreground">hrs</span>
                  </p>
                </div>
                <dl className="mt-2 grid grid-cols-4 gap-1 text-center">
                  {(
                    [
                      ["Present", r.totals.presentDays],
                      ["Late", r.totals.lateDays],
                      ["Absent", r.totals.absentDays],
                      ["Leave", r.totals.leaveDays],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-slate-50 py-1">
                      <dd className="text-sm font-semibold text-[#0E2322]">{value}</dd>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                    </div>
                  ))}
                </dl>
                {attention.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attention.slice(0, 5).map((d) => (
                      <li key={d.dayKey} className="flex items-center gap-2 text-xs text-slate-700">
                        <span className={`inline-flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold ${STATUS_META[d.status].cell}`}>
                          {STATUS_META[d.status].code}
                        </span>
                        <span className="break-words">
                          {d.dayKey} · {dayCellText(d)}
                        </span>
                      </li>
                    ))}
                    {attention.length > 5 && (
                      <li className="text-[11px] text-muted-foreground">+{attention.length - 5} more in the download</li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > shown.length && (
        <div className="flex flex-col items-center gap-1 pt-1">
          <p className="text-xs text-muted-foreground">
            Showing {shown.length} of {rows.length} people. Downloads include everyone.
          </p>
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, rows.length - shown.length)} more
          </Button>
        </div>
      )}
    </ReportFrame>
  );
}