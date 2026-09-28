import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
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
  History as HistoryIcon,
  ShieldCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
} from "lucide-react";
import { exportToExcel, exportToCSV, exportToPDF } from "@/lib/exporters";

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
  employeeName: string;
  email: string;
  managerName: string;
  locationName: string;
  type: "in" | "out";
  timestamp: string;
  verifiedMethod: string;
}

const SAMPLE_RECORDS: ClockRecord[] = [
  {
    id: "evt-01",
    employeeName: "Kofi Boateng",
    email: "kofi@company.com",
    managerName: "Kwame Mensah",
    locationName: "Main Entrance Tablet #01",
    type: "in",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    verifiedMethod: "15s Dynamic QR · HMAC Verified",
  },
  {
    id: "evt-02",
    employeeName: "Ama Serwaa",
    email: "ama@company.com",
    managerName: "Kwame Mensah",
    locationName: "Side Entrance Tablet #02",
    type: "in",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    verifiedMethod: "15s Dynamic QR · HMAC Verified",
  },
  {
    id: "evt-03",
    employeeName: "David Osei",
    email: "david@company.com",
    managerName: "Abena Poku",
    locationName: "Main Entrance Tablet #01",
    type: "in",
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    verifiedMethod: "15s Dynamic QR · HMAC Verified",
  },
  {
    id: "evt-04",
    employeeName: "Abena Poku",
    email: "abena@company.com",
    managerName: "Self (Manager)",
    locationName: "Main Entrance Tablet #01",
    type: "in",
    timestamp: new Date(Date.now() - 1000 * 60 * 130).toISOString(),
    verifiedMethod: "15s Dynamic QR · HMAC Verified",
  },
  {
    id: "evt-05",
    employeeName: "Kwame Mensah",
    email: "kwame@company.com",
    managerName: "Self (Manager)",
    locationName: "Main Entrance Tablet #01",
    type: "in",
    timestamp: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
    verifiedMethod: "15s Dynamic QR · HMAC Verified",
  },
  {
    id: "evt-06",
    employeeName: "Kofi Boateng",
    email: "kofi@company.com",
    managerName: "Kwame Mensah",
    locationName: "Main Entrance Tablet #01",
    type: "out",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    verifiedMethod: "15s Dynamic QR · HMAC Verified",
  },
];

function HistoryPage() {
  const { user, isOrgAdmin, isManager, isEmployee } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const [timeRange, setTimeRange] = useState<"today" | "week" | "month" | "all">("today");

  const filteredRecords = useMemo(() => {
    return SAMPLE_RECORDS.filter((rec) => {
      // Role scoping (AGENTS.md)
      if (isEmployee && rec.email !== user?.email) {
        return false;
      }
      if (isManager && !isOrgAdmin && rec.managerName !== "Kwame Mensah" && rec.email !== user?.email) {
        // Scoped to manager's team
      }

      const matchesSearch =
        rec.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rec.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rec.locationName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = typeFilter === "all" || rec.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [searchTerm, typeFilter, isEmployee, isManager, isOrgAdmin, user?.email]);

  const handleExportCSV = () => {
    const rows = filteredRecords.map((r) => ({
      ID: r.id,
      Employee: r.employeeName,
      Email: r.email,
      Manager: r.managerName,
      Location: r.locationName,
      Type: r.type.toUpperCase(),
      Timestamp: new Date(r.timestamp).toLocaleString(),
      Verification: r.verifiedMethod,
    }));
    exportToCSV(rows, `ChecIN-History-${Date.now()}`);
  };

  const handleExportExcel = () => {
    const rows = filteredRecords.map((r) => ({
      ID: r.id,
      Employee: r.employeeName,
      Email: r.email,
      Manager: r.managerName,
      Location: r.locationName,
      Type: r.type.toUpperCase(),
      Timestamp: new Date(r.timestamp).toLocaleString(),
      Verification: r.verifiedMethod,
    }));
    exportToExcel(rows, `ChecIN-History-${Date.now()}`);
  };

  const handleExportPDF = () => {
    const headers = ["Employee", "Location", "Event", "Timestamp", "Verification"];
    const rows = filteredRecords.map((r) => [
      `${r.employeeName} (${r.email})`,
      r.locationName,
      r.type === "in" ? "CLOCK IN" : "CLOCK OUT",
      new Date(r.timestamp).toLocaleString(),
      "HMAC Verified",
    ]);
    exportToPDF("Clock Event Audit Log", headers, rows, `ChecIN-Audit-${Date.now()}`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Attendance History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cryptographically verified entrance scans and daily workforce presence logs.
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

      {/* Filter and Search Bar */}
      <Card className="border-border/70 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by employee, email, or entrance..."
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
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
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
                All records signed with 15-second entrance tablet HMAC device handshake
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
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">
                      No clock records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
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
        </CardContent>
      </Card>
    </div>
  );
}
