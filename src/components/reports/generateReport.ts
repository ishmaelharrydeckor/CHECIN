import { authedFetch } from "@/components/shifts/shiftApi";
import {
  buildLeaveLedgerPdf,
  buildRegisterPdf,
  downloadPdf,
  downloadTextFile,
  leaveLedgerToCsv,
  registerToCsv,
  reportFilename,
} from "@/lib/report-export";
import type { AttendanceRegister, LeaveLedger } from "@/lib/report-types";

export type GenerateKind = "register" | "leave";
export type GenerateFormat = "csv" | "pdf";

/**
 * Builds one report on the server for a date range and saves it as a file. The server decides who may ask and
 * how much they see (from the signed-in person's token); this only picks the dates and the file type.
 * Returns a plain sentence when it cannot, so the screen can show it.
 */
export async function generateReport(
  kind: GenerateKind,
  format: GenerateFormat,
  range: { from: string; to: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ from: range.from, to: range.to });
  const result = await authedFetch<{ report: AttendanceRegister | LeaveLedger }>(`/api/reports/${kind}?${qs.toString()}`);
  if (!result.ok) return { ok: false, error: result.error };
  const report = result.data.report;
  if (!report || report.rows.length === 0) return { ok: false, error: "There is nothing to include for that period." };

  try {
    if (kind === "register") {
      const reg = report as AttendanceRegister;
      if (format === "csv") downloadTextFile(reportFilename("attendance-register", reg.from, reg.to, "csv"), registerToCsv(reg));
      else downloadPdf(await buildRegisterPdf(reg), reportFilename("attendance-register", reg.from, reg.to, "pdf"));
    } else {
      const ledger = report as LeaveLedger;
      if (format === "csv") downloadTextFile(reportFilename("leave-ledger", ledger.from, ledger.to, "csv"), leaveLedgerToCsv(ledger));
      else downloadPdf(await buildLeaveLedgerPdf(ledger), reportFilename("leave-ledger", ledger.from, ledger.to, "pdf"));
    }
  } catch {
    return { ok: false, error: "The file could not be created. Please try again." };
  }
  return { ok: true };
}
