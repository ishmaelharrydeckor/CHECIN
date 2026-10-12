import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseAuth } from "@/integrations/firebase/config";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { exportToExcel, exportToCSV, exportToPDF } from "@/lib/exporters";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Attendance & Clock Event History — ChecIN" },
      {
        name: "description",
        content:
          "Search attendance history across your organization, verify physical entrance clock-ins, and export verified timesheets.",
      },
    ],
  }),
  component: HistoryPage,
});

interface ClockRecord {
  id: string;
  employeeId?: string;
  employeeName: string;
  email: string;
  managerName?: string;
  locationName: string;
  type: "in" | "out";
  timestamp: string;
  verifiedMethod: string;
  late?: boolean;
  earlyDeparture?: boolean;
  voided?: boolean;
}

function HistoryPage() {
  const { user, isOrgAdmin, isManager, isEmployee } = useAuth();
  const [records, setRecords] = useState<ClockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const [timeRange, setTimeRange] = useState<"today" | "week" | "month" | "all">("today");

  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // One page at a time. The range and event type are sent to the server, so each request reads
  // only what is shown; "Load more" asks for the next page using the cursor the server gave us.
  const fetchRecords = async (mode: "initial" | "refresh" | "more" = "initial") => {
    if (mode === "more") setLoadingMore(true);
    else if (mode === "refresh") setRefreshing(true);
    else setLoading(true);

    try {
      const headers: Record<string, string> = {};
      const currentUser = firebaseAuth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }

      const params = new URLSearchParams({ range: timeRange, type: typeFilter, limit: "50" });
      if (mode === "more" && nextCursor) params.set("cursor", nextCursor);

      const res = await fetch(`/api/attendance/history?${params}`, { headers });
      const data = await res.json();
      if (res.ok && Array.isArray(data.records)) {
        setRecords((prev) => (mode === "more" ? [...prev, ...data.records] : data.records));
        setHasMore(data.hasMore === true);
        setNextCursor(data.nextCursor ?? null);
      } else if (mode !== "more") {
        setRecords([]);
        setHasMore(false);
        setNextCursor(null);
        toast.error(data?.error || "Could not load attendance history.");
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
      toast.error("Could not load attendance history.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [user?.id, timeRange, typeFilter]);

  // Search only narrows the pages already loaded; it never triggers another database read.
  const filteredRecords = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return records;
    return records.filter(
      (rec) =>
        rec.employeeName.toLowerCase().includes(term) ||
        rec.email.toLowerCase().includes(term) ||
        rec.locationName.toLowerCase().includes(term),
    );
  }, [records, searchTerm]);

  // Undone scans stay on screen (struck through) but are not exported as attendance.
  const exportable = useMemo(() => filteredRecords.filter((r) => !r.voided), [filteredRecords]);

  const handleExportCSV = () => {
    if (exportable.length === 0) {
      toast.info("No records to export.");
      return;
    }
    const rows = exportable.map((r) => ({
      ID: r.id,
      Employee: r.employeeName,
      Email: r.email,
      Location: r.locationName,
      Type: r.type === "in" ? "CLOCK IN" : "CLOCK OUT",
      Timestamp: new Date(r.timestamp).toLocaleString(),
      Verification: r.verifiedMethod,
    }));
    exportToCSV(rows, `ChecIN-Attendance-Log-${Date.now()}`);
  };

  const handleExportExcel = () => {
    if (exportable.length === 0) {
      toast.info("No records to export.");
      return;
    }
    const rows = exportable.map((r) => ({
      ID: r.id,
      Employee: r.employeeName,
      Email: r.email,
      Location: r.locationName,
      Type: r.type === "in" ? "CLOCK IN" : "CLOCK OUT",
      Timestamp: new Date(r.timestamp).toLocaleString(),
      Verification: r.verifiedMethod,
    }));
    exportToExcel(rows, `ChecIN-Attendance-Log-${Date.now()}`);
  };

  const handleExportPDF = () => {
    if (exportable.length === 0) {
      toast.info("No records to export.");
      return;
    }
    const headers = ["Employee", "Location", "Event", "Timestamp", "Verification"];
    const rows = exportable.map((r) => [
      `${r.employeeName} (${r.email})`,
      r.locationName,
      r.type === "in" ? "CLOCK IN" : "CLOCK OUT",
      new Date(r.timestamp).toLocaleString(),
      "HMAC Verified",
    ]);
    exportToPDF("Attendance Event Audit Log", headers, rows, `ChecIN-Audit-${Date.now()}`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Attendance History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Verified physical presence scan logs. Showing the newest first; use Load more for older ones.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchRecords("refresh")}
            disabled={refreshing || loading}
            className="border-slate-200 text-xs font-medium"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={filteredRecords.length === 0}
            className="border-slate-200 text-xs font-medium"
          >
            <Download className="size-3.5 mr-1.5" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={filteredRecords.length === 0}
            className="border-slate-200 text-xs font-medium"
          >
            <FileSpreadsheet className="size-3.5 mr-1.5" /> Excel
          </Button>
          <Button
            size="sm"
            onClick={handleExportPDF}
            disabled={filteredRecords.length === 0}
            className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
          >
            <FileText className="size-3.5 mr-1.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-border/70 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search employee, email, or entrance..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Event:</span>
                <Select
                  value={typeFilter}
                  onValueChange={(val: "all" | "in" | "out") => setTypeFilter(val)}
                >
                  <SelectTrigger className="w-28 h-10 text-xs">
                    <SelectValue placeholder="All events" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    <SelectItem value="in">Clock In</SelectItem>
                    <SelectItem value="out">Clock Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Range:</span>
                <Select
                  value={timeRange}
                  onValueChange={(val: "today" | "week" | "month" | "all") => setTimeRange(val)}
                >
                  <SelectTrigger className="w-32 h-10 text-xs">
                    <SelectValue placeholder="Today" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Past 24 Hours</SelectItem>
                    <SelectItem value="week">Past 7 Days</SelectItem>
                    <SelectItem value="month">Past 30 Days</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card className="border-border/70 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 px-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-[#0E2322]">
                Verification Records ({filteredRecords.length})
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                All records verified with physical kiosk token presence handshake
              </CardDescription>
            </div>
            <Badge className="bg-[#E8FCE4] text-[#122300] border-none font-medium text-xs">
              <ShieldCheck className="size-3 mr-1 text-emerald-700" /> Tamper Proof
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs text-muted-foreground uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-6 font-semibold">Employee</th>
                  <th className="py-3 px-6 font-semibold">Type</th>
                  <th className="py-3 px-6 font-semibold">Location / Entrance</th>
                  <th className="py-3 px-6 font-semibold">Timestamp</th>
                  <th className="py-3 px-6 font-semibold">Verification Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">
                      <div className="flex items-center justify-center space-x-2">
                        <Loader2 className="size-5 animate-spin text-slate-500" />
                        <span>Loading verification records...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">
                      No clock records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr key={r.id} className={`hover:bg-slate-50/60 transition-colors ${r.voided ? "opacity-60 line-through" : ""}`}>
                      <td className="py-3.5 px-6">
                        <div className="font-medium text-[#0E2322]">{r.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </td>
                      <td className="py-3.5 px-6">
                        {r.type === "in" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#E8FCE4] text-[#122300]">
                            <ArrowDownLeft className="size-3 text-emerald-600" />
                            Clock In
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800">
                            <ArrowUpRight className="size-3 text-amber-600" />
                            Clock Out
                          </span>
                        )}
                        {r.voided && (
                          <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-700 no-underline">
                            Undone by employee
                          </span>
                        )}
                        {r.late && (
                          <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">
                            Late
                          </span>
                        )}
                        {r.earlyDeparture && (
                          <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">
                            Early departure
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-slate-700 font-medium text-xs">
                        {r.locationName}
                      </td>
                      <td className="py-3.5 px-6 text-xs text-muted-foreground">
                        {new Date(r.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}{" "}
                        · {new Date(r.timestamp).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="inline-flex items-center text-xs text-emerald-700 font-medium gap-1">
                          <ShieldCheck className="size-3.5" />
                          {r.verifiedMethod}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {hasMore && !loading && (
            <div className="p-3 border-t text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchRecords("more")}
                disabled={loadingMore}
                className="text-xs"
              >
                {loadingMore ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
