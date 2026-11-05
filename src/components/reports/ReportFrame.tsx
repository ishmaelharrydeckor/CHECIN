import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileText, Inbox, Loader2 } from "lucide-react";

export interface DateRange {
  from: string; // "YYYY-MM-DD"
  to: string;
}

/** What every report screen receives. The integrator supplies these once real data exists. */
export interface ReportViewProps<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
}

export const MAX_RANGE_DAYS = 31;

function parseDay(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return t;
}

/** Returns a plain-language message if the range is not allowed, otherwise null. */
export function validateRange(range: DateRange): string | null {
  const a = parseDay(range.from);
  const b = parseDay(range.to);
  if (a === null || b === null) return "Please choose both a start date and an end date.";
  if (b < a) return "The end date can't be before the start date.";
  const days = Math.round((b - a) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) {
    return `Please choose a range of ${MAX_RANGE_DAYS} days or fewer. You chose ${days} days.`;
  }
  return null;
}

interface ReportFrameProps {
  title: string;
  description: string;
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isEmpty: boolean;
  emptyMessage: string;
  /** Number of rows in the data (used in the "first N results" note). */
  rowCount: number;
  truncated: boolean;
  onDownloadCsv: () => void;
  onDownloadPdf: () => Promise<void> | void;
  children: ReactNode;
}

export function ReportFrame(props: ReportFrameProps) {
  const {
    title,
    description,
    range,
    onRangeChange,
    loading,
    error,
    onRetry,
    isEmpty,
    emptyMessage,
    rowCount,
    truncated,
    onDownloadCsv,
    onDownloadPdf,
    children,
  } = props;

  const [draft, setDraft] = useState<DateRange>(range);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Keep the inputs in step if the parent changes the range.
  useEffect(() => {
    setDraft(range);
    setRangeError(null);
  }, [range.from, range.to]);

  const change = (next: DateRange) => {
    setDraft(next);
    const msg = validateRange(next);
    setRangeError(msg);
    if (!msg) onRangeChange(next);
  };

  const downloadsDisabled = loading || !!error || isEmpty || busy;

  const runDownload = async (fn: () => Promise<void> | void) => {
    setDownloadError(null);
    setBusy(true);
    try {
      await fn();
    } catch {
      setDownloadError("Could not create the file. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-[#0E2322]">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 sm:flex sm:items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${title}-from`} className="text-xs font-medium">
              From
            </Label>
            <Input
              id={`${title}-from`}
              type="date"
              value={draft.from}
              onChange={(e) => change({ ...draft, from: e.target.value })}
              className="h-10 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${title}-to`} className="text-xs font-medium">
              To
            </Label>
            <Input
              id={`${title}-to`}
              type="date"
              value={draft.to}
              onChange={(e) => change({ ...draft, to: e.target.value })}
              className="h-10 text-sm"
            />
          </div>
          <div className="col-span-2 sm:col-span-1 sm:ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={downloadsDisabled}
              onClick={() => runDownload(onDownloadCsv)}
              className="flex-1 sm:flex-none h-10 text-xs border-slate-300"
            >
              <Download className="size-3.5" /> Download CSV
            </Button>
            <Button
              type="button"
              disabled={downloadsDisabled}
              onClick={() => runDownload(onDownloadPdf)}
              className="flex-1 sm:flex-none h-10 text-xs bg-[#0E2322] hover:bg-[#163331] text-white"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
              Download PDF
            </Button>
          </div>
        </div>
        {rangeError && (
          <p role="alert" className="text-xs text-destructive">
            {rangeError}
          </p>
        )}
        {downloadError && (
          <p role="alert" className="text-xs text-destructive">
            {downloadError}
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading report">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="space-y-3 py-12 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" onClick={onRetry} className="border-slate-200 text-xs">
            Try again
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl border border-border/70 bg-white p-10 text-center space-y-2">
          <Inbox className="size-7 mx-auto text-slate-400" />
          <p className="text-sm font-medium text-slate-700">{emptyMessage}</p>
          <p className="text-xs text-muted-foreground">Try a different date range.</p>
        </div>
      ) : (
        <>
          {truncated && (
            <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-900">
              Showing the first {rowCount} results. Choose a shorter range.
            </p>
          )}
          {children}
        </>
      )}
    </section>
  );
}