import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
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
  AlertTriangle,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { exportToExcel, exportToCSV, exportToPDF } from "@/lib/exporters";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Timesheets & Attendance Reports — ChecIN" },
      {
        name: "description",
        content:
          "Daily and monthly workforce timesheet reports, overtime calculations, late arrivals, and exportable payroll summaries.",
      },
    ],
  }),
  component: ReportsPage,
});

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

const SAMPLE_TIMESHEETS: TimesheetRow[] = [
  {
    id: "ts-01",
    employeeName: "Kofi Boateng",
    email: "kofi@company.com",
    team: "Engineering",
    totalHours: 42.5,
    expectedHours: 40,
    overtimeHours: 2.5,
    daysPresent: 5,
    lateArrivals: 0,
    status: "Overtime Flag",
  },
  {
    id: "ts-02",
    employeeName: "Ama Serwaa",
    email: "ama@company.com",
    team: "Engineering",
    totalHours: 39.0,
    expectedHours: 40,
    overtimeHours: 0,
    daysPresent: 5,
    lateArrivals: 1,
    status: "Full Compliance",
  },
  {
    id: "ts-03",
    employeeName: "David Osei",
    email: "david@company.com",
    team: "Operations",
    totalHours: 40.0,
    expectedHours: 40,
    overtimeHours: 0,
    daysPresent: 5,
    lateArrivals: 0,
    status: "Full Compliance",
  },
  {
    id: "ts-04",
    employeeName: "Abena Poku",
    email: "abena@company.com",
    team: "Operations",
    totalHours: 41.5,
    expectedHours: 40,
    overtimeHours: 1.5,
    daysPresent: 5,
    lateArrivals: 0,
    status: "Full Compliance",
  },
  {
    id: "ts-05",
    employeeName: "Kwame Mensah",
    email: "kwame@company.com",
    team: "Leadership",
    totalHours: 44.0,
    expectedHours: 40,
    overtimeHours: 4.0,
    daysPresent: 5,
    lateArrivals: 0,
    status: "Overtime Flag",
  },
];

function ReportsPage() {
  const { user, isOrgAdmin, isManager } = useAuth();
  const [period, setPeriod] = useState<"week" | "month" | "year">("week");
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const filteredTimesheets = useMemo(() => {
    return SAMPLE_TIMESHEETS.filter((row) => {
      if (teamFilter !== "all" && row.team !== teamFilter) {
        return false;
      }
      return true;
    });
  }, [teamFilter]);

  const summary = useMemo(() => {
    const totalStaff = filteredTimesheets.length;
    const totalHours = filteredTimesheets.reduce((acc, r) => acc + r.totalHours, 0);
    const totalOvertime = filteredTimesheets.reduce((acc, r) => acc + r.overtimeHours, 0);
    const totalLate = filteredTimesheets.reduce((acc, r) => acc + r.lateArrivals, 0);
    const avgAttendance = 98.4;
    return { totalStaff, totalHours, totalOvertime, totalLate, avgAttendance };
  }, [filteredTimesheets]);

  const handleExportCSV = () => {
    const rows = filteredTimesheets.map((r) => ({
      Employee: r.employeeName,
      Email: r.email,
      Team: r.team,
      "Total Hours": r.totalHours,
      "Expected Hours": r.expectedHours,
      Overtime: r.overtimeHours,
      "Days Present": r.daysPresent,
      "Late Arrivals": r.lateArrivals,
      Status: r.status,
    }));
    exportToCSV(rows, `ChecIN-Timesheet-${period}`);
  };

  const handleExportExcel = () => {
    const rows = filteredTimesheets.map((r) => ({
      Employee: r.employeeName,
      Email: r.email,
      Team: r.team,
      "Total Hours": r.totalHours,
      "Expected Hours": r.expectedHours,
      Overtime: r.overtimeHours,
      "Days Present": r.daysPresent,
      "Late Arrivals": r.lateArrivals,
      Status: r.status,
    }));
    exportToExcel(rows, `ChecIN-Timesheet-${period}`);
  };

  const handleExportPDF = () => {
    const headers = ["Employee", "Team", "Hours", "Overtime", "Present", "Late", "Status"];
    const rows = filteredTimesheets.map((r) => [
      r.employeeName,
      r.team,
      `${r.totalHours} hrs`,
      `${r.overtimeHours} hrs`,
      `${r.daysPresent} days`,
      `${r.lateArrivals}`,
      r.status,
    ]);
    exportToPDF("Workforce Timesheet Compilation", headers, rows, `ChecIN-Timesheet-${period}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Timesheets &amp; Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automated workforce timesheets, overtime hours, and payroll export records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="border-slate-200 text-xs font-medium"
          >
            <Download className="size-3.5 mr-1.5" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="border-slate-200 text-xs font-medium"
          >
            <FileSpreadsheet className="size-3.5 mr-1.5" /> Excel
          </Button>
          <Button
            size="sm"
            onClick={handleExportPDF}
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
              <p className="text-xs text-muted-foreground mt-1">Requires manager sign-off</p>
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
              <p className="text-xs text-emerald-600 mt-1 font-medium">High punctuality rate</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Late Arrivals
              </span>
              <div className="size-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
                <AlertTriangle className="size-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-rose-900">{summary.totalLate}</div>
              <p className="text-xs text-muted-foreground mt-1">&gt; 15 mins after shift schedule</p>
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
              <Select value={period} onValueChange={(v: "week" | "month" | "year") => setPeriod(v)}>
                <SelectTrigger className="w-36 h-10 text-xs">
                  <SelectValue placeholder="Current Week" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Current Week</SelectItem>
                  <SelectItem value="month">Current Month</SelectItem>
                  <SelectItem value="year">Quarter-to-Date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Department:</span>
              <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v)}>
                <SelectTrigger className="w-40 h-10 text-xs">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="Engineering">Engineering</SelectItem>
                  <SelectItem value="Operations">Operations</SelectItem>
                  <SelectItem value="Leadership">Leadership</SelectItem>
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
            Calculated from entrance tablet clock-in and clock-out scans
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs text-muted-foreground uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-6 font-semibold">Employee</th>
                  <th className="py-3 px-6 font-semibold">Team</th>
                  <th className="py-3 px-6 font-semibold">Tracked Hours</th>
                  <th className="py-3 px-6 font-semibold">Overtime</th>
                  <th className="py-3 px-6 font-semibold">Days Active</th>
                  <th className="py-3 px-6 font-semibold">Late Scans</th>
                  <th className="py-3 px-6 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTimesheets.map((row) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
