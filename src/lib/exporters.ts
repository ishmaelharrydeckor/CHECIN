// The Excel and PDF libraries are large (about 800 KB together). They are loaded here, when a file is actually
// asked for, so a page that only offers an export button does not pay for them on every visit.

export async function exportToExcel(
  rows: Record<string, unknown>[],
  filename: string,
  sheet = "Attendance",
) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: `ChecIN Attendance Report - ${filename}`,
    Subject: "Workforce Timesheet & Verification Log",
    Author: "ChecIN Technologies Inc.",
    CreatedDate: new Date(),
  };
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export async function exportToCSV(rows: Record<string, unknown>[], filename: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const header = `# CHECIN WORKFORCE ATTENDANCE REPORT: ${filename}\n# Generated: ${new Date().toISOString()}\n`;
  const blob = new Blob([header + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

export async function exportToPDF(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(14, 35, 34); // ChecIN Forest Green #0E2322
  doc.text("ChecIN — Workforce Attendance & Timesheet", 14, 16);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`${title} · Generated on ${new Date().toLocaleString()}`, 14, 23);

  autoTable(doc, {
    startY: 28,
    head: [headers],
    body: rows,
    theme: "striped",
    headStyles: {
      fillColor: [14, 35, 34],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [253, 251, 247], // Warm cream surface
    },
  });

  doc.save(`${filename}.pdf`);
}
