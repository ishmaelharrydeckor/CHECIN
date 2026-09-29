import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseAuth } from "@/integrations/firebase/config";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Clock,
  UserCheck,
  TrendingUp,
  RefreshCw,
  Loader2,
  Calendar,
} from "lucide-react";
import { exportToExcel, exportToCSV, exportToPDF } from "@/lib/exporters";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Timesheets & Attendance Reports — ChecIN" },
      {
        name: "description",
        content:
          "Daily and monthly workforce timesheet reports, verified durations, and exportable payroll summaries.",
      },
    ],
  }),
  component: ReportsPage,
});

interface RawEvent {
  id: string;
  employeeId?: string;
  employeeName: string;
  email: string;
  department?: string;
  type: "in" | "out";
  timestamp: string;
}

interface TimesheetRow {
  id: string;
  employeeName: string;
  email: string;
  team: string;
  totalHours: number;
  expectedHours: number;
  overtimeHours: number;
  daysPresent: number;
  lateArrivals: number;
  status: "Full Compliance" | "Action Required" | "Overtime Flag";
}

function ReportsPage() {
  const { user, isOrgAdmin, isManager } = useAuth();
  const [period, setPeriod] = useState<"week" | "month" | "all">("week");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const headers: Record<string, string> = {};
      const currentUser = firebaseAuth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }

      const res = await fetch("/api/attendance/history", { headers });
      const data = await res.json();
      if (res.ok && Array.isArray(data.records)) {
        setEvents(data.records);
      } else {
        setEvents([]);
      }
    } catch (err) {
      console.error("Failed to fetch reports data:", err);
      toast.error("Could not load timesheet data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [user?.id]);

  // Aggregate raw events into real TimesheetRows
  const timesheetRows = useMemo<TimesheetRow[]>(() => {
    if (events.length === 0) return [];

    const now = Date.now();
    // Filter events by period
    const filteredEvents = events.filter((e) => {
      if (period === "all") return true;
      const eventTime = new Date(e.timestamp).getTime();
      const diffDays = (now - eventTime) / (1000 * 60 * 60 * 24);
      if (period === "week") return diffDays <= 7;
      if (period === "month") return diffDays <= 30;
      return true;
    });

    // Group events by employee identifier
    const byEmployee = new Map<string, RawEvent[]>();
    for (const ev of filteredEvents) {
      const key = ev.email || ev.employeeName || "unknown";
      if (!byEmployee.has(key)) byEmployee.set(key, []);
      byEmployee.get(key)!.push(ev);
    }

    const rows: TimesheetRow[] = [];

    byEmployee.forEach((empEvents, email) => {
      const employeeName = empEvents[0].employeeName || email.split("@")[0];
      const team = empEvents[0].department || "General Operations";

      // Group by calendar day
      const byDay = new Map<string, RawEvent[]>();
      for (const ev of empEvents) {
        const dayKey = new Date(ev.timestamp).toISOString().split("T")[0];
        if (!byDay.has(dayKey)) byDay.set(dayKey, []);
        byDay.get(dayKey)!.push(ev);
      }

      let totalLoggedHours = 0;
      let lateCount = 0;

      byDay.forEach((dayEvents) => {
        // Sort chronologically
        dayEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const firstIn = dayEvents.find((d) => d.type === "in") || dayEvents[0];
        const lastOut = [...dayEvents].reverse().find((d) => d.type === "out");

        if (firstIn) {
          // Check if first clock-in is past 09:15 AM
          const inTime = new Date(firstIn.timestamp);
          if (inTime.getHours() > 9 || (inTime.getHours() === 9 && inTime.getMinutes() > 15)) {
            lateCount++;
          }
        }

        if (firstIn && lastOut && lastOut !== firstIn) {
          const duration =
            (new Date(lastOut.timestamp).getTime() - new Date(firstIn.timestamp).getTime()) /
            (1000 * 60 * 60);
          totalLoggedHours += Math.max(0.1, Math.min(16, duration));
        } else if (firstIn) {
          // Single punch today: approximate 8.0 hours standard shift
          totalLoggedHours += 8.0;
        }
      });

      const daysPresent = byDay.size;
      const expectedHours = daysPresent * 8;
      const totalHours = Math.round(totalLoggedHours * 10) / 10;
      const overtimeHours =
        totalHours > expectedHours ? Math.round((totalHours - expectedHours) * 10) / 10 : 0;

      let status: TimesheetRow["status"] = "Full Compliance";
      if (overtimeHours > 0) {
        status = "Overtime Flag";
      } else if (totalHours < expectedHours * 0.8) {
        status = "Action Required";
      }

      rows.push({
        id: `ts-${email}`,
        employeeName,
        email,
        team,
        totalHours,
        expectedHours,
        overtimeHours,
        daysPresent,
        lateArrivals: lateCount,
        status,
      });
    });

    return rows;
  }, [events, period]);

  const filteredTimesheets = useMemo(() => {
    return timesheetRows.filter((row) => {
      if (teamFilter !== "all" && row.team !== teamFilter) {
        return false;
      }
      return true;
    });
  }, [timesheetRows, teamFilter]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    timesheetRows.forEach((r) => set.add(r.team));
    return Array.from(set);
  }, [timesheetRows]);

  const summary = useMemo(() => {
    const totalStaff = filteredTimesheets.length;
    const totalHours = filteredTimesheets.reduce((acc, r) => acc + r.totalHours, 0);
    const totalOvertime = filteredTimesheets.reduce((acc, r) => acc + r.overtimeHours, 0);
    const totalLate = filteredTimesheets.reduce((acc, r) => acc + r.lateArrivals, 0);
    const avgAttendance =
      totalStaff > 0
        ? Math.round(
            (filteredTimesheets.filter((r) => r.status === "Full Compliance" || r.status === "Overtime Flag")
              .length /
              totalStaff) *
              100,
          )
        : 100;
    return { totalStaff, totalHours, totalOvertime, totalLate, avgAttendance };
  }, [filteredTimesheets]);

  const handleExportCSV = () => {
    if (filteredTimesheets.length === 0) {
      toast.info("No timesheet rows to export.");
      return;
    }
    const rows = filteredTimesheets.map((r) => ({
      Employee: r.employeeName,
      Email: r.email,
      Department: r.team,
      "Total Hours": r.totalHours,
      "Expected Hours": r.expectedHours,
      Overtime: r.overtimeHours,
      "Days Active": r.daysPresent,
      "Late Arrivals": r.lateArrivals,
      Status: r.status,
    }));
    exportToCSV(rows, `ChecIN-Timesheet-${period}-${Date.now()}`);
  };

  const handleExportExcel = () => {
    if (filteredTimesheets.length === 0) {
      toast.info("No timesheet rows to export.");
      return;
    }
    const rows = filteredTimesheets.map((r) => ({
      Employee: r.employeeName,
      Email: r.email,
      Department: r.team,
      "Total Hours": r.totalHours,
      "Expected Hours": r.expectedHours,
      Overtime: r.overtimeHours,
      "Days Active": r.daysPresent,
      "Late Arrivals": r.lateArrivals,
      Status: r.status,
    }));
    exportToExcel(rows, `ChecIN-Timesheet-${period}-${Date.now()}`);
  };

  const handleExportPDF = () => {
    if (filteredTimesheets.length === 0) {
      toast.info("No timesheet rows to export.");
      return;
    }
    const headers = ["Employee", "Department", "Tracked Hours", "Overtime", "Days Active", "Status"];
    const rows = filteredTimesheets.map((r) => [
      `${r.employeeName} (${r.email})`,
      r.team,
      `${r.totalHours} hrs`,
      r.overtimeHours > 0 ? `+${r.overtimeHours} hrs` : "0 hrs",
      `${r.daysPresent} days`,
      r.status,
    ]);
    exportToPDF("Workforce Timesheet Audit Summary", headers, rows, `ChecIN-Timesheet-${Date.now()}`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Timesheets &amp; Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Aggregated presence records and timesheet durations derived from verified entrance scans.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchEvents(true)}
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
            disabled={filteredTimesheets.length === 0}
            className="border-slate-200 text-xs font-medium"
          >
            <Download className="size-3.5 mr-1.5" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={filteredTimesheets.length === 0}
            className="border-slate-200 text-xs font-medium"
          >
            <FileSpreadsheet className="size-3.5 mr-1.5" /> Excel
          </Button>
          <Button
            size="sm"
            onClick={handleExportPDF}
            disabled={filteredTimesheets.length === 0}
            className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
          >
            <FileText className="size-3.5 mr-1.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Total Tracked Hours
              </span>
              <div className="size-8 rounded-lg bg-[#E8FCE4] text-[#122300] flex items-center justify-center">
                <Clock className="size-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-[#0E2322]">{summary.totalHours.toFixed(1)} hrs</div>
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1 font-medium">
                <TrendingUp className="size-3" /> Across {summary.totalStaff} staff members
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Total Overtime
              </span>
              <div className="size-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <TrendingUp className="size-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-amber-900">{summary.totalOvertime.toFixed(1)} hrs</div>
              <p className="text-xs text-muted-foreground mt-1">Beyond standard 8-hour workday</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Attendance Compliance
              </span>
              <div className="size-8 rounded-lg bg-[#E8FCE4] text-[#122300] flex items-center justify-center">
                <UserCheck className="size-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-[#0E2322]">{summary.avgAttendance}%</div>
              <p className="text-xs text-emerald-600 mt-1 font-medium">Punctuality index</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Late Check-Ins
              </span>
              <div className="size-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
                <Calendar className="size-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-rose-900">{summary.totalLate}</div>
              <p className="text-xs text-muted-foreground mt-1">&gt; 15 mins after standard 9:00 AM</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Row */}
      <Card className="border-border/70 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Timesheet Cycle:</span>
              <Select value={period} onValueChange={(v: "week" | "month" | "all") => setPeriod(v)}>
                <SelectTrigger className="w-36 h-10 text-xs">
                  <SelectValue placeholder="Current Week" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Past 7 Days</SelectItem>
                  <SelectItem value="month">Past 30 Days</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Department:</span>
              <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v)}>
                <SelectTrigger className="w-44 h-10 text-xs">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timesheets Table */}
      <Card className="border-border/70 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 px-6">
          <CardTitle className="text-base font-semibold text-[#0E2322]">
            Staff Timesheet Summary ({filteredTimesheets.length})
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Aggregated from verified entrance tablet clock-in and clock-out scans
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs text-muted-foreground uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-6 font-semibold">Employee</th>
                  <th className="py-3 px-6 font-semibold">Department</th>
                  <th className="py-3 px-6 font-semibold">Tracked Hours</th>
                  <th className="py-3 px-6 font-semibold">Overtime</th>
                  <th className="py-3 px-6 font-semibold">Days Active</th>
                  <th className="py-3 px-6 font-semibold">Late Scans</th>
                  <th className="py-3 px-6 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                      <div className="flex items-center justify-center space-x-2">
                        <Loader2 className="size-5 animate-spin text-slate-500" />
                        <span>Compiling timesheet records...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredTimesheets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                      No timesheet punches recorded for this period yet.
                    </td>
                  </tr>
                ) : (
                  filteredTimesheets.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="font-medium text-[#0E2322]">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.email}</div>
                      </td>
                      <td className="py-3.5 px-6 text-xs text-slate-700 font-medium">{row.team}</td>
                      <td className="py-3.5 px-6 font-medium text-xs">
                        {row.totalHours} hrs / {row.expectedHours} hrs
                      </td>
                      <td className="py-3.5 px-6 text-xs font-medium text-amber-700">
                        {row.overtimeHours > 0 ? `+${row.overtimeHours} hrs` : "—"}
                      </td>
                      <td className="py-3.5 px-6 text-xs text-slate-700">{row.daysPresent} days</td>
                      <td className="py-3.5 px-6 text-xs text-slate-700">
                        {row.lateArrivals > 0 ? (
                          <span className="text-rose-600 font-medium">{row.lateArrivals}</span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="py-3.5 px-6">
                        <Badge
                          className={`text-xs border-none font-medium ${
                            row.status === "Full Compliance"
                              ? "bg-[#E8FCE4] text-[#122300]"
                              : row.status === "Overtime Flag"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-rose-100 text-rose-900"
                          }`}
                        >
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
