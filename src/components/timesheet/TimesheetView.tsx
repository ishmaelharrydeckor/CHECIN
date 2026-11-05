import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Inbox, Loader2, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PRESETS, PRESET_LABEL, presetRange, rangeDays, type RangePreset } from "@/lib/reports-hub";
import { validateRange } from "@/components/reports/ReportFrame";
import { STATUS_LABEL, downloadPdf, downloadTextFile } from "@/lib/report-export";
import { formatHoursMinutes, formatSignedMinutes, timesheetSummary } from "@/lib/timesheet";
import type { TimesheetReport, TimesheetReportRow } from "@/lib/timesheet-build";
import {
  dayLabel,
  filterReport,
  timesheetDailyToCsv,
  timesheetFilename,
  timesheetToCsv,
} from "@/lib/timesheet-export";
import { useTimesheet, type TimesheetRange } from "./useTimesheet";

const PAGE_SIZE = 50;
const SELECT = "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700";

/** Today on this device, only to count the ready-made ranges back from. The report itself is built on the server. */
function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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

type DownloadKind = "csv" | "xlsx" | "pdf" | "daily";

/**
 * The timesheet (T3 of docs/TIMESHEET-DESIGN.md): one row per person for a chosen range, opened day by day. Every
 * figure is worked out on the server from the same data as the attendance register; this screen only displays and
 * downloads it. Nothing loads until "Show" is pressed.
 */
export function TimesheetView() {
  const { data, loading, error, asked, load, retry } = useTimesheet();
  const isDesktop = useIsDesktop();

  const [preset, setPreset] = useState<RangePreset | "custom">("last7");
  const [range, setRange] = useState<TimesheetRange>(() => presetRange("last7", localToday()));
  const [department, setDepartment] = useState("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<DownloadKind | null>(null);

  const rangeError = validateRange(range);
  const days = rangeError ? 0 : rangeDays(range);

  const choosePreset = (value: string) => {
    if (value === "custom") return setPreset("custom");
    const p = value as RangePreset;
    setPreset(p);
    setRange(presetRange(p, localToday()));
  };

  // A new answer starts the list again.
  useEffect(() => {
    setVisible(PAGE_SIZE);
    setOpenId(null);
    setDepartment("all");
    setSearch("");
  }, [data]);
  useEffect(() => setVisible(PAGE_SIZE), [department, search]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.rows ?? []) if (r.department) set.add(r.department);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data]);

  // What is on screen, and what the downloads contain.
  const shownReport: TimesheetReport | null = useMemo(() => {
    if (!data) return null;
    const q = search.trim().toLowerCase();
    return filterReport(
      data,
      (r) => (department === "all" || r.department === department) && (q === "" || r.name.toLowerCase().includes(q)),
      timesheetSummary,
    );
  }, [data, department, search]);

  const rows = shownReport?.rows ?? [];
  const list = rows.slice(0, visible);
  const openRow = data?.rows.find((r) => r.employeeId === openId) ?? null;

  async function download(kind: DownloadKind) {
    if (!shownReport) return;
    setBusy(kind);
    try {
      const { from, to } = shownReport;
      if (kind === "csv") downloadTextFile(timesheetFilename("timesheet", from, to, "csv"), timesheetToCsv(shownReport));
      else if (kind === "daily") downloadTextFile(timesheetFilename("timesheet-daily", from, to, "csv"), timesheetDailyToCsv(shownReport));
      else if (kind === "xlsx") {
        const { downloadTimesheetXlsx } = await import("@/lib/timesheet-files");
        await downloadTimesheetXlsx(shownReport, timesheetFilename("timesheet", from, to, "xlsx"));
      } else {
        const { buildTimesheetPdf } = await import("@/lib/timesheet-files");
        downloadPdf(await buildTimesheetPdf(shownReport), timesheetFilename("timesheet", from, to, "pdf"));
      }
    } catch {
      toast.error("Could not create the file. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const canDownload = !!shownReport && rows.length > 0 && !loading && busy === null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Timesheets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hours worked by each person over a range of days, from the same records as the attendance register.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="border-slate-200 text-xs font-medium self-start">
          <Link to="/reports">All reports</Link>
        </Button>
      </div>

      {/* Choose what to see */}
      <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,14rem)_1fr_1fr_auto] gap-3 sm:items-end">
          <div className="col-span-2 sm:col-span-1 space-y-1.5">
            <Label htmlFor="ts-period" className="text-xs font-medium">
              Period
            </Label>
            <select id="ts-period" value={preset} onChange={(e) => choosePreset(e.target.value)} className={SELECT}>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABEL[p]}
                </option>
              ))}
              <option value="custom">Choose dates</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ts-from" className="text-xs font-medium">
              From
            </Label>
            <Input
              id="ts-from"
              type="date"
              value={range.from}
              onChange={(e) => {
                setPreset("custom");
                setRange({ ...range, from: e.target.value });
              }}
              className="h-10 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ts-to" className="text-xs font-medium">
              To
            </Label>
            <Input
              id="ts-to"
              type="date"
              value={range.to}
              onChange={(e) => {
                setPreset("custom");
                setRange({ ...range, to: e.target.value });
              }}
              className="h-10 text-sm"
            />
          </div>
          <Button
            type="button"
            disabled={!!rangeError || loading}
            onClick={() => void load(range)}
            className="col-span-2 sm:col-span-1 h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
          >
            {loading ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Table2 className="size-3.5 mr-1.5" />}
            Show timesheet
          </Button>
        </div>
        {rangeError ? (
          <p role="alert" className="text-xs text-destructive">
            {rangeError}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {days} {days === 1 ? "day" : "days"}, at most 31 at a time.
          </p>
        )}
      </div>

      {/* Before anything is asked for */}
      {!asked && !loading && (
        <div className="rounded-2xl border border-border/70 bg-white p-10 text-center space-y-2">
          <Table2 className="size-7 mx-auto text-slate-400" aria-hidden />
          <p className="text-sm font-medium text-slate-700">Choose a period and press "Show timesheet".</p>
          <p className="text-xs text-muted-foreground">You will see each person's hours for those days, and can open any person to see them day by day.</p>
        </div>
      )}

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading the timesheet">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="space-y-3 py-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" onClick={retry} className="border-slate-200 text-xs">
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && data && shownReport && (
        <>
          {/* Which days, always */}
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-[#0E2322]">
              {dayLabel(data.from)} to {dayLabel(data.to)}
            </span>{" "}
            <span className="text-muted-foreground">
              ({data.from} to {data.to}, {data.timezone})
            </span>
          </p>

          {data.truncated && (
            <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-900">
              This timesheet may be incomplete: some people or days could not be read. Choose a shorter range.
            </p>
          )}

          {data.rows.length === 0 ? (
            <div className="rounded-2xl border border-border/70 bg-white p-10 text-center space-y-2">
              <Inbox className="size-7 mx-auto text-slate-400" aria-hidden />
              <p className="text-sm font-medium text-slate-700">No people to show for these days.</p>
              <p className="text-xs text-muted-foreground">Try a different period.</p>
            </div>
          ) : (
            <>
              <SummaryStrip report={shownReport} />

              <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="ts-find" className="text-xs font-medium">
                      Find a person
                    </Label>
                    <Input id="ts-find" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name" className="h-10 text-sm" />
                  </div>
                  {departments.length > 1 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="ts-dept" className="text-xs font-medium">
                        Department
                      </Label>
                      <select id="ts-dept" value={department} onChange={(e) => setDepartment(e.target.value)} className={SELECT}>
                        <option value="all">Everyone</option>
                        {departments.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <DownloadButton label="CSV" icon={<Download className="size-3.5" />} busy={busy === "csv"} disabled={!canDownload} onClick={() => void download("csv")} />
                  <DownloadButton label="Excel" icon={<FileSpreadsheet className="size-3.5" />} busy={busy === "xlsx"} disabled={!canDownload} onClick={() => void download("xlsx")} />
                  <DownloadButton label="PDF" icon={<FileText className="size-3.5" />} busy={busy === "pdf"} disabled={!canDownload} onClick={() => void download("pdf")} />
                  <DownloadButton label="Daily detail (CSV)" icon={<Download className="size-3.5" />} busy={busy === "daily"} disabled={!canDownload} onClick={() => void download("daily")} />
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="rounded-2xl border border-border/70 bg-white p-6 text-center text-sm text-slate-600">
                  No one matches that. Clear the name or choose Everyone.
                </p>
              ) : isDesktop ? (
                <PeopleTable report={shownReport} rows={list} onOpen={setOpenId} />
              ) : (
                <PeopleCards report={shownReport} rows={list} onOpen={setOpenId} />
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Showing {list.length} of {rows.length} {rows.length === 1 ? "person" : "people"}
                  {rows.length !== data.rows.length ? ` (${data.rows.length} in this timesheet)` : ""}.
                </p>
                {list.length < rows.length && (
                  <Button type="button" variant="outline" onClick={() => setVisible((n) => n + PAGE_SIZE)} className="border-slate-200 text-xs">
                    Show more
                  </Button>
                )}
              </div>

              {data.anyExpected && (
                <p className="text-xs text-muted-foreground">
                  Extra and short compare paid time with the time the person's shift expects. They are shown as they are: not approved overtime.
                  People with no shift show hours only.
                </p>
              )}
            </>
          )}
        </>
      )}

      <DaysDialog report={data} row={openRow} onClose={() => setOpenId(null)} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------ pieces

function DownloadButton({ label, icon, busy, disabled, onClick }: { label: string; icon: ReactNode; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" disabled={disabled} onClick={onClick} className="h-10 text-xs border-slate-300">
      {busy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <span className="mr-1.5">{icon}</span>}
      {label}
    </Button>
  );
}

function SummaryStrip({ report }: { report: TimesheetReport }) {
  const s = report.summary;
  const tiles: { label: string; value: string; note?: string }[] = [
    { label: "People", value: String(s.people) },
    { label: "Hours at work", value: formatHoursMinutes(s.workedMinutes) },
    ...(report.breaksTracked ? [{ label: "Paid hours", value: formatHoursMinutes(s.paidMinutes), note: `Break ${formatHoursMinutes(s.breakMinutes)}` }] : []),
    ...(report.anyExpected
      ? [
          { label: "Expected", value: formatHoursMinutes(s.expectedMinutes) },
          { label: "Extra / short", value: `+${formatHoursMinutes(s.extraMinutes)} / -${formatHoursMinutes(s.shortMinutes)}`, note: "Not netted between people" },
        ]
      : []),
    { label: "Late days", value: String(s.lateDays) },
    { label: "Absent days", value: String(s.absentDays) },
    { label: "No check-out", value: String(s.noCheckOutDays), note: "Days with a check-in and no check-out" },
  ];
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl border border-border/70 bg-white p-3 shadow-sm">
          <dd className="text-lg font-extrabold text-[#0E2322] break-words">{t.value}</dd>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</dt>
          {t.note && <p className="text-[11px] text-slate-500 mt-0.5">{t.note}</p>}
        </div>
      ))}
    </dl>
  );
}

/** "+1h 20m" (extra), "-45m" (short), "0m" (none) or a dash when nothing was expected. */
function differenceText(minutes: number | null): string {
  return minutes === null ? "–" : formatSignedMinutes(minutes);
}

function PeopleTable({ report, rows, onOpen }: { report: TimesheetReport; rows: TimesheetReportRow[]; onOpen: (id: string) => void }) {
  const head = [
    "Days worked",
    "Hours at work",
    ...(report.breaksTracked ? ["Break"] : []),
    "Paid",
    ...(report.anyExpected ? ["Expected", "Extra / short"] : []),
    "Late",
    "Absent",
    "Leave",
    "WFH",
    "No check-out",
    ...(report.diaryTracked ? ["Diary hours (approved)", "Diary flagged", "Diary waiting"] : []),
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/70 bg-white shadow-sm">
      <table className="w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold">Person</th>
            {head.map((h) => (
              <th key={h} className="bg-slate-50 px-2 py-2 text-center font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = r.totals;
            return (
              <tr key={r.employeeId} className="hover:bg-slate-50/60">
                <td className="sticky left-0 z-10 bg-white border-t border-slate-100 px-3 py-1.5">
                  <button type="button" onClick={() => onOpen(r.employeeId)} className="text-left font-medium text-[#0E2322] hover:underline max-w-[11rem] break-words">
                    {r.name}
                  </button>
                  {r.department && <div className="text-[11px] text-muted-foreground max-w-[11rem] break-words">{r.department}</div>}
                </td>
                <Cell>{t.daysWorked}</Cell>
                <Cell strong>{formatHoursMinutes(t.workedMinutes)}</Cell>
                {report.breaksTracked && <Cell>{formatHoursMinutes(t.breakMinutes)}</Cell>}
                <Cell>{formatHoursMinutes(t.paidMinutes)}</Cell>
                {report.anyExpected && (
                  <>
                    <Cell>{t.expectedMinutes === null ? "–" : formatHoursMinutes(t.expectedMinutes)}</Cell>
                    <Cell strong>{differenceText(t.differenceMinutes)}</Cell>
                  </>
                )}
                <Cell>{t.lateDays}</Cell>
                <Cell>{t.absentDays}</Cell>
                <Cell>{t.leaveDays}</Cell>
                <Cell>{t.wfhDays}</Cell>
                <Cell>{t.noCheckOutDays}</Cell>
                {report.diaryTracked && (
                  <>
                    <Cell strong>{formatHoursMinutes(r.diary?.approvedMinutes ?? 0)}</Cell>
                    <Cell>{r.diary?.flaggedDays ?? 0}</Cell>
                    <Cell>{r.diary?.waitingDays ?? 0}</Cell>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td className={`border-t border-slate-100 px-2 py-1.5 text-center whitespace-nowrap ${strong ? "font-medium text-[#0E2322]" : ""}`}>{children}</td>;
}

function PeopleCards({ report, rows, onOpen }: { report: TimesheetReport; rows: TimesheetReportRow[]; onOpen: (id: string) => void }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const t = r.totals;
        return (
          <li key={r.employeeId} className="rounded-2xl border border-border/70 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0E2322] break-words">{r.name}</p>
                {r.department && <p className="text-xs text-muted-foreground break-words">{r.department}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-[#0E2322]">{formatHoursMinutes(t.workedMinutes)}</p>
                <p className="text-[11px] text-muted-foreground">at work</p>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {report.breaksTracked ? `Break ${formatHoursMinutes(t.breakMinutes)} · ` : ""}Paid {formatHoursMinutes(t.paidMinutes)}
              {report.anyExpected && t.expectedMinutes !== null ? ` · Expected ${formatHoursMinutes(t.expectedMinutes)} · ${differenceText(t.differenceMinutes)}` : ""}
            </p>
            <dl className="mt-2 grid grid-cols-4 gap-1 text-center">
              {(
                [
                  ["Days", t.daysWorked],
                  ["Late", t.lateDays],
                  ["Absent", t.absentDays],
                  ["No check-out", t.noCheckOutDays],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 py-1">
                  <dd className="text-sm font-semibold text-[#0E2322]">{value}</dd>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                </div>
              ))}
            </dl>
            {report.diaryTracked && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Work diary {formatHoursMinutes(r.diary?.approvedMinutes ?? 0)} approved · {r.diary?.flaggedDays ?? 0} flagged · {r.diary?.waitingDays ?? 0} waiting
              </p>
            )}
            <Button type="button" variant="outline" onClick={() => onOpen(r.employeeId)} className="mt-2 h-10 w-full border-slate-200 text-xs">
              See the days
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

const PILL = "inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold";

function statusPill(status: TimesheetReportRow["days"][number]["status"]): string {
  if (status === "present") return `${PILL} bg-[#CBEED3] text-[#0E2322]`;
  if (status === "absent") return `${PILL} bg-amber-100 text-amber-900`;
  return `${PILL} bg-slate-100 text-slate-700`;
}

function DaysDialog({ report, row, onClose }: { report: TimesheetReport | null; row: TimesheetReportRow | null; onClose: () => void }) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {row && report && (
          <>
            <DialogHeader>
              <DialogTitle className="text-[#0E2322]">{row.name}</DialogTitle>
              <DialogDescription>
                {row.department ? `${row.department} · ` : ""}
                {report.from} to {report.to} ({report.timezone})
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-[65vh] overflow-y-auto divide-y divide-border/70">
              {row.days.map((d) => (
                <li key={d.dayKey} className="py-2.5 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#0E2322]">{dayLabel(d.dayKey)}</span>
                    <span className={statusPill(d.status)}>{STATUS_LABEL[d.status]}</span>
                    {d.late && <span className={`${PILL} bg-amber-100 text-amber-900`}>Late</span>}
                    {d.lateExcused && <span className={`${PILL} bg-slate-100 text-slate-700`}>Late, excused</span>}
                    {d.earlyDeparture && <span className={`${PILL} bg-slate-100 text-slate-700`}>Left early</span>}
                    {d.noCheckOut && <span className={`${PILL} bg-amber-100 text-amber-900`}>No check-out</span>}
                  </div>
                  <p className="text-xs text-slate-600">
                    {d.firstIn || d.lastOut ? `${d.firstIn ?? "?"} to ${d.lastOut ?? "?"} · ` : ""}
                    {formatHoursMinutes(d.workedMinutes)} at work
                    {report.breaksTracked && d.status === "present" ? ` · break ${formatHoursMinutes(d.breakMinutes)} · paid ${formatHoursMinutes(d.paidMinutes)}` : ""}
                    {report.anyExpected && d.expectedMinutes !== null && d.expectedMinutes > 0
                      ? ` · expected ${formatHoursMinutes(d.expectedMinutes)} · ${differenceText(d.differenceMinutes)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Total: {formatHoursMinutes(row.totals.workedMinutes)} at work over {row.totals.daysWorked}{" "}
              {row.totals.daysWorked === 1 ? "day" : "days"}.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
