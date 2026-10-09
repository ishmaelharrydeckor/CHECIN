import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { firebaseAuth } from "@/integrations/firebase/config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Inbox, Loader2, RefreshCw } from "lucide-react";
import {
  NOTE_MAX,
  REPORT_CATEGORY_LABELS,
  isReportCategory,
  type ReportStatus,
} from "@/lib/problem-report";

export const Route = createFileRoute("/_authenticated/owner/reports")({
  head: () => ({ meta: [{ title: "Reports inbox — ChecIN" }] }),
  component: ReportsInboxPage,
});

interface StoredReport {
  id: string;
  orgId: string;
  uid: string;
  email: string | null;
  role: string | null;
  category: string;
  message: string;
  page: string;
  userAgent: string;
  viewport: string;
  hasImage: boolean;
  status: ReportStatus;
  createdAt: string;
  ownerNote?: string;
}

type Filter = "all" | ReportStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "new", label: "New" },
  { key: "seen", label: "Seen" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

async function authHeaders(): Promise<Record<string, string>> {
  const token = await firebaseAuth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function StatusPill({ status }: { status: ReportStatus }) {
  if (status === "new") return <Badge className="text-[11px] bg-amber-100 text-amber-900 hover:bg-amber-100">New</Badge>;
  if (status === "resolved")
    return <Badge className="text-[11px] bg-[#CBEED3] text-[#0E2322] hover:bg-[#CBEED3]">Resolved</Badge>;
  return (
    <Badge variant="secondary" className="text-[11px]">
      Seen
    </Badge>
  );
}

function ReportsInboxPage() {
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [filter, setFilter] = useState<Filter>("new");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", { headers: await authHeaders() });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not load reports.");
      setReports(data.reports as StoredReport[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => (filter === "all" ? reports : reports.filter((r) => r.status === filter)), [reports, filter]);
  const newCount = reports.filter((r) => r.status === "new").length;

  const update = async (id: string, changes: { status?: ReportStatus; note?: string }) => {
    const res = await fetch("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ id, ...changes }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not update the report.");
    setReports((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              ...(changes.status ? { status: changes.status } : {}),
              ...(changes.note !== undefined ? { ownerNote: changes.note } : {}),
            }
          : r,
      ),
    );
  };

  if (forbidden) {
    return (
      <div className="py-16 text-center space-y-2">
        <p className="text-sm font-medium text-[#0E2322]">This page is not available.</p>
        <p className="text-xs text-muted-foreground">The reports inbox is only for the ChecIN owner.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Reports inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Problems and ideas sent by people using this version of ChecIN.
            {!loading && ` ${newCount} new.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-slate-200 text-xs self-start sm:self-auto">
          <RefreshCw className={`size-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter reports">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            type="button"
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={filter === f.key ? "bg-[#0E2322] hover:bg-[#163331] text-white text-xs" : "border-slate-200 text-xs"}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading reports">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error ? (
        <div className="py-10 text-center space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={load} className="text-xs">
            Try again
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <Inbox className="size-8 mx-auto text-muted-foreground/60" />
          <p className="text-sm font-medium text-[#0E2322]">
            {reports.length === 0 ? "No reports yet" : "Nothing in this view"}
          </p>
          <p className="text-xs text-muted-foreground">
            {reports.length === 0
              ? "When someone presses Report a problem, it will appear here."
              : "Try another filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <ReportCard key={r.id} report={r} onUpdate={update} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({
  report,
  onUpdate,
}: {
  report: StoredReport;
  onUpdate: (id: string, changes: { status?: ReportStatus; note?: string }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(report.ownerNote ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const showImage = async () => {
    setImageLoading(true);
    try {
      const res = await fetch(`/api/reports?image=${encodeURIComponent(report.id)}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error("Could not load the screenshot.");
      setImageUrl(URL.createObjectURL(await res.blob()));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the screenshot.");
    } finally {
      setImageLoading(false);
    }
  };

  const when = new Date(report.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const kind = isReportCategory(report.category) ? REPORT_CATEGORY_LABELS[report.category] : "Report";
  const roleLabel = report.role === "org_admin" ? "Admin" : report.role === "manager" ? "Manager" : report.role === "employee" ? "Employee" : "Unknown role";

  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="pt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold text-[#0E2322]">{kind}</h2>
            <StatusPill status={report.status} />
          </div>
          <p className="text-xs text-muted-foreground">{when}</p>
        </div>

        <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{report.message}</p>

        <p className="text-xs text-muted-foreground break-words">
          {roleLabel}
          {report.email ? ` · ${report.email}` : ""}
          {report.page ? ` · on ${report.page}` : ""}
          {report.viewport ? ` · screen ${report.viewport}` : ""}
          {` · company ${report.orgId.slice(0, 8)}`}
        </p>
        {report.userAgent && <p className="text-[11px] text-muted-foreground break-words">{report.userAgent}</p>}

        {report.hasImage &&
          (imageUrl ? (
            <img src={imageUrl} alt="Screenshot sent with the report" className="max-h-80 rounded-xl border border-slate-200 object-contain" />
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={showImage} disabled={imageLoading} className="border-slate-200 text-xs">
              {imageLoading && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Show screenshot
            </Button>
          ))}

        <div className="space-y-1.5 pt-1">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
            rows={2}
            placeholder="Private note for yourself (not shown to the person)"
            className="text-sm"
            aria-label="Private note"
          />
          <div className="flex flex-wrap items-center gap-2">
            {report.status !== "seen" && report.status !== "resolved" && (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => onUpdate(report.id, { status: "seen" }))} className="border-slate-200 text-xs">
                Mark seen
              </Button>
            )}
            {report.status !== "resolved" ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => run(() => onUpdate(report.id, { status: "resolved", note }))} className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs">
                Mark resolved
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => onUpdate(report.id, { status: "new" }))} className="border-slate-200 text-xs">
                Reopen
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" disabled={busy || note === (report.ownerNote ?? "")} onClick={() => run(async () => { await onUpdate(report.id, { note }); toast.success("Note saved."); })} className="text-xs">
              Save note
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
