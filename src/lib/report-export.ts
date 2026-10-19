// Pure export helpers. They only use the data they are given.
// jspdf and jspdf-autotable are loaded on demand so they stay out of the page bundle.
import type { jsPDF } from "jspdf";
import type {
  AttendanceRegister,
  LeaveLedger,
  RegisterDay,
  RegisterStatus,
} from "./report-types";

export const STATUS_LABEL: Record<RegisterStatus, string> = {
  present: "Present",
  absent: "Absent",
  leave: "On leave",
  holiday: "Holiday",
  wfh: "Work from home",
  off: "Day off",
  other: "Not on your team",
  expected: "Not yet due",
};

export const STATUS_CODE: Record<RegisterStatus, string> = {
  present: "P",
  absent: "A",
  leave: "L",
  holiday: "H",
  wfh: "W",
  off: "-",
  other: ".",
  expected: "E",
};

export const STATUS_FILL: Record<RegisterStatus, [number, number, number]> = {
  present: [203, 238, 211],
  absent: [254, 243, 199],
  leave: [241, 245, 249],
  holiday: [241, 245, 249],
  wfh: [241, 245, 249],
  off: [248, 250, 252],
  other: [255, 255, 255],
  expected: [248, 250, 252],
};

/** Hours with one decimal, e.g. 495 -> "8.3". Formatting only. */
export function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

/** Plain-text description of one day, e.g. "Present 08:14-17:02 (late)". */
export function dayCellText(day: RegisterDay): string {
  let s = STATUS_LABEL[day.status];
  if (day.firstIn || day.lastOut) s += ` ${day.firstIn ?? "?"}-${day.lastOut ?? "?"}`;
  const flags: string[] = [];
  if (day.late) flags.push("late");
  if (day.lateExcused) flags.push("late, excused");
  if (day.earlyDeparture) flags.push("left early");
  if (flags.length) s += ` (${flags.join(", ")})`;
  return s;
}

// ---------- CSV ----------

export const CSV_BOM = "\uFEFF"; // makes Excel read the file as UTF-8 (accents show correctly)

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: neutralise formulas, then quote if needed. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`; // Excel can no longer run it as a formula
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(rows: (string | number | null | undefined)[][]): string {
  return CSV_BOM + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function registerToCsv(reg: AttendanceRegister): string {
  const dayKeys = reg.rows[0]?.days.map((d) => d.dayKey) ?? [];
  const head = [
    "Name",
    "Department",
    ...dayKeys,
    "Present days",
    "Late days",
    "Absent days",
    "Leave days",
    "Work from home days",
    "Hours worked",
    // Only when the organization tracks breaks: the break taken off, and the time left to pay.
    ...(reg.breaksTracked ? ["Break hours", "Paid hours"] : []),
  ];
  const body = reg.rows.map((r) => {
    const byKey = new Map(r.days.map((d) => [d.dayKey, d]));
    return [
      r.name,
      r.department,
      ...dayKeys.map((k) => {
        const d = byKey.get(k);
        return d ? dayCellText(d) : "";
      }),
      r.totals.presentDays,
      r.totals.lateDays,
      r.totals.absentDays,
      r.totals.leaveDays,
      r.totals.wfhDays ?? 0,
      formatHours(r.totals.minutesWorked),
      ...(reg.breaksTracked ? [formatHours(r.totals.breakMinutes ?? 0), formatHours(r.totals.paidMinutes ?? 0)] : []),
    ];
  });
  return buildCsv([head, ...body]);
}

export function leaveLedgerToCsv(ledger: LeaveLedger): string {
  const head = ["Name", "Department", "Leave type", "Start date", "End date", "Days", "Status", "Decided on"];
  const body = ledger.rows.map((r) => [
    r.name,
    r.department,
    r.type,
    r.startDate,
    r.endDate,
    r.days,
    r.status,
    r.decidedOn ?? "",
  ]);
  return buildCsv([head, ...body]);
}

export function reportFilename(kind: "attendance-register" | "leave-ledger", from: string, to: string, ext: "csv" | "pdf") {
  return `${kind}_${from}_to_${to}.${ext}`;
}

export function downloadTextFile(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

// ---------- PDF ----------
// jsPDF's built-in fonts cover Western European accents (é, ë, ñ, ü, ø...). Characters
// outside that set (for example the Akan letters ɛ and ɔ) will not draw correctly.

const MARGIN = 28;

async function loadPdfTools() {
  const [{ jsPDF: JsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  return { JsPDF, autoTable: autoTableMod.default };
}

function writeHeader(doc: jsPDF, title: string, period: string, generatedAt: string, note: string | null) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(14, 35, 34);
  doc.text(title, MARGIN, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(period, MARGIN, 50);
  doc.text(`Generated on ${generatedAt}`, MARGIN, 62);
  if (note) {
    doc.setTextColor(180, 83, 9);
    doc.text(note, MARGIN, 74);
  }
}

function writePageNumbers(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${total}`, w - MARGIN, h - 14, { align: "right" });
  }
}

export async function buildRegisterPdf(reg: AttendanceRegister): Promise<jsPDF> {
  const { JsPDF, autoTable } = await loadPdfTools();
  const doc = new JsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  writeHeader(
    doc,
    "Attendance register",
    `Period: ${reg.from} to ${reg.to} (${reg.timezone})`,
    reg.generatedAt,
    reg.truncated ? `Showing the first ${reg.rows.length} results. Choose a shorter range.` : null,
  );

  const dayKeys = reg.rows[0]?.days.map((d) => d.dayKey) ?? [];
  const usable = doc.internal.pageSize.getWidth() - MARGIN * 2;
  const totalCols = reg.breaksTracked ? 7 : 5; // present, late, absent, leave, hours, plus break and paid when tracked
  const fixed = 96 + 64 + totalCols * 32; // name + department + the totals columns
  const dayW = dayKeys.length ? Math.max(9, Math.min(16, Math.floor((usable - fixed) / dayKeys.length))) : 16;

  const columnStyles: Record<number, { cellWidth: number; halign?: "center" }> = {
    0: { cellWidth: 96 },
    1: { cellWidth: 64 },
  };
  dayKeys.forEach((_, i) => (columnStyles[2 + i] = { cellWidth: dayW, halign: "center" }));
  for (let i = 0; i < totalCols; i++) columnStyles[2 + dayKeys.length + i] = { cellWidth: 32, halign: "center" };

  autoTable(doc, {
    startY: 86,
    margin: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 30 },
    head: [["Name", "Department", ...dayKeys.map((k) => k.slice(8)), "Present", "Late", "Absent", "Leave", "Hours", ...(reg.breaksTracked ? ["Break", "Paid"] : [])]],
    body: reg.rows.map((r) => {
      const byKey = new Map(r.days.map((d) => [d.dayKey, d]));
      return [
        r.name,
        r.department,
        ...dayKeys.map((k) => {
          const d = byKey.get(k);
          return d ? `${STATUS_CODE[d.status]}${d.late ? "*" : ""}${d.earlyDeparture ? "~" : ""}` : "";
        }),
        String(r.totals.presentDays),
        String(r.totals.lateDays),
        String(r.totals.absentDays),
        String(r.totals.leaveDays),
        formatHours(r.totals.minutesWorked),
        ...(reg.breaksTracked ? [formatHours(r.totals.breakMinutes ?? 0), formatHours(r.totals.paidMinutes ?? 0)] : []),
      ];
    }),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak", lineColor: [226, 232, 240], lineWidth: 0.4 },
    headStyles: { fillColor: [14, 35, 34], textColor: 255, fontStyle: "bold", halign: "center" },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    columnStyles,
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const i = data.column.index - 2;
      if (i < 0 || i >= dayKeys.length) return;
      const day = reg.rows[data.row.index]?.days.find((d) => d.dayKey === dayKeys[i]);
      if (day) data.cell.styles.fillColor = STATUS_FILL[day.status];
    },
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
    "P present   W work from home   L on leave   H holiday   A absent   - day off   * late   ~ left early",
    MARGIN,
    y,
  );
  writePageNumbers(doc);
  return doc;
}

export async function buildLeaveLedgerPdf(ledger: LeaveLedger): Promise<jsPDF> {
  const { JsPDF, autoTable } = await loadPdfTools();
  const doc = new JsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  writeHeader(
    doc,
    "Leave ledger",
    `Period: ${ledger.from} to ${ledger.to}`,
    ledger.generatedAt,
    ledger.truncated ? `Showing the first ${ledger.rows.length} results. Choose a shorter range.` : null,
  );
  autoTable(doc, {
    startY: 86,
    margin: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 30 },
    head: [["Name", "Department", "Leave type", "Start date", "End date", "Days", "Status", "Decided on"]],
    body: ledger.rows.map((r) => [
      r.name,
      r.department,
      r.type,
      r.startDate,
      r.endDate,
      String(r.days),
      r.status,
      r.decidedOn ?? "",
    ]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [14, 35, 34], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [253, 251, 247] },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 110 }, 2: { cellWidth: 120 } },
  });
  writePageNumbers(doc);
  return doc;
}