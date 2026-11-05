/**
 * Makes the timesheet PDF and Excel files in the browser (T3 of docs/TIMESHEET-DESIGN.md). The numbers and columns come
 * from timesheet-export.ts; this only draws and saves them. jspdf and xlsx are loaded on demand so they stay out of
 * the page bundle. Names in Excel are stored as text, so a name that starts with `=` is never run as a formula.
 */
import type { jsPDF } from "jspdf";
import { dailyColumns, dailyRows, summaryColumns, summaryRow, timesheetDetails } from "./timesheet-export";
import type { TimesheetReport } from "./timesheet-build";

const MARGIN = 28;

/** An hours cell written as text ("7.50", "+1.00") becomes a real number so Excel can add it up. */
function asNumber(cell: string | number | null): string | number | null {
  if (typeof cell === "string" && /^[+-]?\d+(\.\d+)?$/.test(cell)) return Number(cell);
  return cell;
}

export async function buildTimesheetPdf(report: TimesheetReport): Promise<jsPDF> {
  const [{ jsPDF: JsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;
  const doc = new JsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(14, 35, 34);
  doc.text("Timesheet", MARGIN, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Period: ${report.from} to ${report.to} (${report.timezone})`, MARGIN, 50);
  doc.text(`Generated on ${report.generatedAt}`, MARGIN, 62);
  if (report.truncated) {
    doc.setTextColor(180, 83, 9);
    doc.text(`Showing the first ${report.rows.length} people. Choose a shorter range.`, MARGIN, 74);
  }

  autoTable(doc, {
    startY: 86,
    margin: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 30 },
    head: [summaryColumns(report)],
    body: report.rows.map((r) => summaryRow(report, r).map((c) => (c === null ? "" : String(c)))),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak", lineColor: [226, 232, 240], lineWidth: 0.4 },
    headStyles: { fillColor: [14, 35, 34], textColor: 255, fontStyle: "bold", halign: "center" },
    showHead: "everyPage",
    rowPageBreak: "avoid",
  });

  const lastY: number = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 86;
  let y = lastY + 14;
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    "Hours are decimal hours worked out from whole minutes. Extra (+) and short (-) are a plain difference from the expected time, not approved overtime.",
    MARGIN,
    y,
  );

  const total = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${total}`, w - MARGIN, h - 14, { align: "right" });
  }
  return doc;
}

/** One workbook: the summary, the daily detail and the details (range, timezone, when it was made). */
export async function downloadTimesheetXlsx(report: TimesheetReport, filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: `ChecIN timesheet ${report.from} to ${report.to}`, Author: "ChecIN" };

  const summary = [summaryColumns(report), ...report.rows.map((r) => summaryRow(report, r).map((c, i) => (i < 2 ? c : asNumber(c))))];
  const daily = [dailyColumns(report), ...dailyRows(report).map((row) => row.map((c, i) => (i < 6 ? c : asNumber(c))))];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Timesheet");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(daily), "Daily detail");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(timesheetDetails(report)), "Details");
  XLSX.writeFile(wb, filename);
}
