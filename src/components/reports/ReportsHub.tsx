import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { generateReport, type GenerateFormat } from "@/components/reports/generateReport";
import {
  HUB_REPORTS,
  HUB_REVIEWS,
  PRESETS,
  PRESET_LABEL,
  presetRange,
  scopeText,
  type HubReport,
  type RangePreset,
} from "@/lib/reports-hub";

/** Today on this device, only to count the ready-made ranges back from. The report itself is built on the server. */
function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The reports hub: every report as a card with a Preview (opens it, with its own date range) and, where it can
 * be made as a file straight away, a ready-made period and a Generate button. Presentational: the reports and
 * who may see what are decided by the server.
 */
export function ReportsHub({ isOrgAdmin }: { isOrgAdmin: boolean }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="hub-reports" className="space-y-3">
        <h2 id="hub-reports" className="text-base font-semibold text-[#0E2322]">
          Preview or download
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {HUB_REPORTS.map((r) => (
            <ReportCard key={r.id} report={r} scope={scopeText(isOrgAdmin)} />
          ))}
        </div>
      </section>

      <section aria-labelledby="hub-reviews" className="space-y-3">
        <h2 id="hub-reviews" className="text-base font-semibold text-[#0E2322]">
          Reviews
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {HUB_REVIEWS.map((r) => (
            <Card key={r.to} className="border-border/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">{r.title}</CardTitle>
                <CardDescription className="text-[13px]">{r.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="h-10 border-slate-200 text-[13px]">
                  <Link to={r.to}>
                    Open <ArrowRight className="size-4 ml-1.5" aria-hidden />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportCard({ report, scope }: { report: HubReport; scope: string }) {
  const [preset, setPreset] = useState<RangePreset>("last14");
  const [busy, setBusy] = useState<GenerateFormat | null>(null);

  async function generate(format: GenerateFormat) {
    if (!report.generate) return;
    setBusy(format);
    const result = await generateReport(report.generate, format, presetRange(preset, localToday()));
    setBusy(null);
    if (!result.ok) toast.error(result.error);
    else toast.success(`${report.title} is ready (${PRESET_LABEL[preset].toLowerCase()}).`);
  }

  return (
    <Card className="border-border/80 shadow-sm flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{report.title}</CardTitle>
        <CardDescription className="text-[13px]">{report.description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto space-y-4">
        <p className="text-xs text-slate-500">{scope}</p>

        {report.generate && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[#0E2322]" htmlFor={`period-${report.id}`}>
              Period
            </label>
            <select
              id={`period-${report.id}`}
              value={preset}
              onChange={(e) => setPreset(e.target.value as RangePreset)}
              disabled={busy !== null}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABEL[p]}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy !== null} onClick={() => void generate("csv")} className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium">
                {busy === "csv" ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Download className="size-3.5 mr-1.5" />}
                CSV
              </Button>
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void generate("pdf")} className="h-10 border-slate-200 text-xs font-medium">
                {busy === "pdf" ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <FileText className="size-3.5 mr-1.5" />}
                PDF
              </Button>
            </div>
          </div>
        )}

        <Button asChild variant="ghost" className="h-10 px-0 text-[13px] font-semibold text-[#0E2322] hover:bg-transparent hover:underline">
          {report.openTo === "/attendance-reports" ? (
            <Link to="/attendance-reports" search={{ tab: report.tab }}>
              Preview and choose dates <ArrowRight className="size-4 ml-1.5" aria-hidden />
            </Link>
          ) : (
            <Link to="/reports/timesheets">
              Open <ArrowRight className="size-4 ml-1.5" aria-hidden />
            </Link>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
