import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LeaveLedger, LeaveLedgerRow } from "@/lib/report-types";
import {
  buildLeaveLedgerPdf,
  downloadPdf,
  downloadTextFile,
  leaveLedgerToCsv,
  reportFilename,
} from "@/lib/report-export";
import { ReportFrame, type ReportViewProps } from "./ReportFrame";

const PAGE_SIZE = 50;

const STATUS_STYLE: Record<LeaveLedgerRow["status"], string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-[#E8FCE4] text-[#122300]",
  denied: "bg-rose-100 text-rose-900",
};

const GRID = "md:grid md:grid-cols-[1.6fr_1.2fr_1.3fr_1.6fr_0.5fr_0.9fr_1fr] md:gap-3 md:items-center";

export function LeaveLedgerReport({
  data,
  loading,
  error,
  onRetry,
  range,
  onRangeChange,
}: ReportViewProps<LeaveLedger>) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => setVisible(PAGE_SIZE), [data]);

  const rows = data?.rows ?? [];
  const shown = rows.slice(0, visible);

  const downloadCsv = () => {
    if (!data) return;
    downloadTextFile(reportFilename("leave-ledger", data.from, data.to, "csv"), leaveLedgerToCsv(data));
  };
  const downloadPdfFile = async () => {
    if (!data) return;
    const doc = await buildLeaveLedgerPdf(data);
    downloadPdf(doc, reportFilename("leave-ledger", data.from, data.to, "pdf"));
  };

  return (
    <ReportFrame
      title="Leave ledger"
      description="One row per leave request in the range."
      range={range}
      onRangeChange={onRangeChange}
      loading={loading}
      error={error}
      onRetry={onRetry}
      isEmpty={rows.length === 0}
      emptyMessage="No leave requests in this range."
      rowCount={rows.length}
      truncated={!!data?.truncated}
      onDownloadCsv={downloadCsv}
      onDownloadPdf={downloadPdfFile}
    >
      <div className="rounded-2xl border border-border/70 bg-white shadow-sm overflow-hidden">
        <div className={`hidden bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${GRID}`}>
          <span>Person</span>
          <span>Department</span>
          <span>Leave type</span>
          <span>Dates</span>
          <span>Days</span>
          <span>Decided on</span>
          <span>Status</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {shown.map((r) => (
            <li key={r.id} className={`px-4 py-3 space-y-1 md:space-y-0 ${GRID}`}>
              <div className="flex items-start justify-between gap-3 md:block">
                <p className="text-sm font-semibold text-[#0E2322] break-words">{r.name}</p>
                <span className={`md:hidden shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}>
                  {r.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground md:text-sm md:text-slate-600 break-words">{r.department}</p>
              <p className="text-xs md:text-sm text-slate-800 break-words">{r.type}</p>
              <p className="text-xs md:text-sm text-slate-600">
                {r.startDate} → {r.endDate}
              </p>
              <p className="text-xs md:text-sm text-slate-600">
                <span className="md:hidden">Days: </span>
                {r.days}
              </p>
              <p className="text-xs md:text-sm text-slate-600">
                <span className="md:hidden">Decided on: </span>
                {r.decidedOn ?? "—"}
              </p>
              <div className="hidden md:block">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}>
                  {r.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {rows.length > shown.length && (
        <div className="flex flex-col items-center gap-1 pt-1">
          <p className="text-xs text-muted-foreground">
            Showing {shown.length} of {rows.length} requests. Downloads include all of them.
          </p>
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, rows.length - shown.length)} more
          </Button>
        </div>
      )}
    </ReportFrame>
  );
}