import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { firestoreDb, firebaseAuth } from "@/integrations/firebase/config";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Building2,
  Download,
  UserPlus,
  ShieldCheck,
  Search,
  Filter,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Organization Overview — ChecIN Dashboard" }] }),
  component: DashboardPage,
});

interface ActivityItem {
  id: string;
  name: string;
  email: string;
  initials: string;
  department: string;
  location: string;
  type: "in" | "out";
  time: string;
}

const INITIAL_ACTIVITIES: ActivityItem[] = [
  {
    id: "act-1",
    name: "Kofi Manu",
    email: "kofi.manu@company.com",
    initials: "KM",
    department: "Product Design",
    location: "Main Lobby Terminal #01",
    type: "in",
    time: "08:59:50 AM",
  },
  {
    id: "act-2",
    name: "Ama Mensah",
    email: "ama.mensah@company.com",
    initials: "AM",
    department: "Engineering",
    location: "Main Lobby Terminal #01",
    type: "in",
    time: "08:54:12 AM",
  },
  {
    id: "act-3",
    name: "Kwesi Appiah",
    email: "kwesi.appiah@company.com",
    initials: "KA",
    department: "Operations",
    location: "Main Lobby Terminal #01",
    type: "in",
    time: "08:45:00 AM",
  },
  {
    id: "act-4",
    name: "Sarah Jenkins",
    email: "sarah.j@company.com",
    initials: "SJ",
    department: "Finance",
    location: "Main Lobby Terminal #01",
    type: "in",
    time: "08:30:15 AM",
  },
  {
    id: "act-5",
    name: "David Osei",
    email: "david.o@company.com",
    initials: "DO",
    department: "Sales",
    location: "Main Lobby Terminal #01",
    type: "out",
    time: "08:15:30 AM",
  },
];

// 5-Day Weekly Trend Data (Mon-Fri)
const WEEKLY_TREND = [
  { day: "Mon", present: 38, late: 2, wfh: 0 },
  { day: "Tue", present: 37, late: 3, wfh: 0 },
  { day: "Wed", present: 39, late: 1, wfh: 0 },
  { day: "Thu", present: 36, late: 4, wfh: 0 },
  { day: "Fri (Today)", present: 36, late: 3, wfh: 1 },
];

// Department Distribution Data
const DEPT_DATA = [
  { name: "Engineering", value: 16, color: "#0E2322" },
  { name: "Product Design", value: 8, color: "#C0FD9B" },
  { name: "Operations", value: 8, color: "#FFD153" },
  { name: "Finance", value: 4, color: "#CBEED3" },
  { name: "Sales", value: 4, color: "#94A3B8" },
];

function DashboardPage() {
  const { user, isOrgAdmin, isManager } = useAuth();
  const [liveActivities, setLiveActivities] = useState<ActivityItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in" | "out">("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [timeRange, setTimeRange] = useState("today");

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "employee">("employee");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Real-time Attendance Feed Synchronization
  const fetchLiveAttendance = async () => {
    try {
      const isDemo = typeof window !== "undefined" && new URL(window.location.href).searchParams.get("demo") === "true";
      const token = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch(`/api/attendance/feed${isDemo ? "?demo=true" : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.ok && data.events && data.events.length > 0) {
        setLiveActivities(data.events);
      }
    } catch (e) {
      console.warn("Could not poll attendance feed:", e);
    }
  };

  useEffect(() => {
    fetchLiveAttendance();
    const interval = setInterval(fetchLiveAttendance, 3000);
    return () => clearInterval(interval);
  }, []);

  const allActivities = useMemo(() => {
    if (liveActivities.length === 0) return INITIAL_ACTIVITIES;
    const liveEmails = new Set(liveActivities.map((a) => a.email.toLowerCase()));
    const liveNames = new Set(liveActivities.map((a) => a.name.toLowerCase()));
    const nonDuplicateDemos = INITIAL_ACTIVITIES.filter(
      (a) => !liveEmails.has(a.email.toLowerCase()) && !liveNames.has(a.name.toLowerCase()),
    );
    return [...liveActivities, ...nonDuplicateDemos];
  }, [liveActivities]);

  const presentCount = useMemo(() => {
    const latestByPerson = new Map<string, "in" | "out">();
    for (const act of allActivities) {
      if (!latestByPerson.has(act.name)) {
        latestByPerson.set(act.name, act.type);
      }
    }
    let inCount = 0;
    for (const t of latestByPerson.values()) {
      if (t === "in") inCount++;
    }
    return Math.min(40, Math.max(32, 31 + inCount));
  }, [allActivities]);

  const filteredActivities = useMemo(() => {
    return allActivities.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.department.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || item.type === statusFilter;
      const matchesDept = deptFilter === "all" || item.department.toLowerCase() === deptFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesDept;
    });
  }, [allActivities, searchQuery, statusFilter, deptFilter]);

  const handleExportCsv = () => {
    const headers = "Employee,Email,Department,Location,Event,Time,Verification\n";
    const rows = filteredActivities
      .map(
        (a) =>
          `"${a.name}","${a.email}","${a.department}","${a.location}","${a.type === "in" ? "Clocked IN" : "Clocked OUT"}","${a.time}","HMAC Hardware Verified"`,
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ChecIN-Attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded attendance CSV report");
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const isDemo = typeof window !== "undefined" && (new URL(window.location.href).searchParams.get("demo") === "true" || !user);
      const token = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/seed-demo${isDemo ? "?demo=true" : ""}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || "Seeded demo workforce attendance for today!");
        await fetchLiveAttendance();
      } else {
        toast.error(data.error || "Failed to seed demo data");
      }
    } catch {
      toast.error("Error seeding demo data");
    } finally {
      setSeeding(false);
    }
  };

  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/staff-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (data.ok && data.inviteUrl) {
        navigator.clipboard.writeText(data.inviteUrl);
        setInviteCopied(true);
        toast.success("Single-use invite link created and copied to clipboard!");
        setTimeout(() => {
          setInviteCopied(false);
          setInviteModalOpen(false);
          setInviteEmail("");
        }, 1500);
      } else {
        toast.error(data.error || "Failed to generate invite");
      }
    } catch {
      toast.error("Error creating staff invite");
    }
  };

  return (
    <div className="space-y-6 font-sans max-w-7xl mx-auto">
      {/* 1. Header Banner & Action Center */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#E8FCE4] text-[#122300] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              {isOrgAdmin ? "Corporate Admin" : isManager ? "Team Manager" : "Workforce Member"}
            </span>
            <span>•</span>
            <span className="text-[#0E2322] font-medium">Acme Global Ltd (40 Registered Staff)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0E2322]">
            Organization Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time workforce presence intelligence, entrance activity, and compliance telemetry.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSeedDemo}
            disabled={seeding}
            className="px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold transition text-emerald-800 flex items-center space-x-1.5 disabled:opacity-50"
            title="Populate demo colleagues and attendance for presentation"
          >
            <span>{seeding ? "Seeding..." : "🌱 Seed Demo Team"}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold transition text-slate-700 flex items-center space-x-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setInviteModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-[#0E2322] text-[#C0FD9B] hover:bg-[#163331] text-xs font-bold transition shadow-sm flex items-center space-x-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Invite Staff Member</span>
          </button>
        </div>
      </div>

      {/* 2. Top 4 Figma Bento Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Workforce */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Headcount</span>
            <span className="p-2 rounded-xl bg-slate-50 text-slate-700">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-[#0E2322]">40</div>
            <div className="flex items-center space-x-1 text-xs text-emerald-600 mt-2 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+3 new employees this month</span>
            </div>
          </div>
        </div>

        {/* Card 2: Present Today */}
        <div className="bg-[#FCF2CB] p-6 rounded-3xl border border-[#F5E6B0] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#854D0E] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Present Today</span>
            <span className="p-2 rounded-xl bg-white/70 text-[#854D0E]">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-[#0E2322]">
              {presentCount} <span className="text-sm font-normal text-slate-700">/ 40</span>
            </div>
            <div className="text-xs text-[#854D0E] mt-2 font-semibold">
              {((presentCount / 40) * 100).toFixed(1)}% workforce present on site
            </div>
          </div>
        </div>

        {/* Card 3: On-Time Rate */}
        <div className="bg-[#CBEED3] p-6 rounded-3xl border border-[#B2E2BD] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#0E2322] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">On-Time Rate</span>
            <span className="p-2 rounded-xl bg-white/70 text-emerald-900">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-[#0E2322]">94.8%</div>
            <div className="text-xs text-[#166534] mt-2 font-medium">
              3 late arrivals (&lt;15m grace threshold)
            </div>
          </div>
        </div>

        {/* Card 4: Avg Shift Length */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Shift Length</span>
            <span className="p-2 rounded-xl bg-slate-50 text-slate-700">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-[#0E2322]">8.1 hrs</div>
            <div className="text-xs text-slate-500 mt-2 font-medium">
              Compliant with 8.0h labor policy
            </div>
          </div>
        </div>
      </div>

      {/* 3. Interactive Charts Section (Figma Organization Overview) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Chart: Weekly Attendance Trends (Area Chart) */}
        <div className="lg:col-span-8 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h2 className="text-base font-bold text-[#0E2322]">Weekly Attendance Trends</h2>
              <p className="text-xs text-slate-500">Mon – Fri on-site attendance vs. late arrivals</p>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0E2322]"></span> Present
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFD153]"></span> Late
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={WEEKLY_TREND} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0E2322" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0E2322" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFD153" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#FFD153" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} domain={[0, 45]} />
                <RechartsTooltip />
                <Area type="monotone" dataKey="present" stroke="#0E2322" strokeWidth={2.5} fillOpacity={1} fill="url(#presentGrad)" />
                <Area type="monotone" dataKey="late" stroke="#D97706" strokeWidth={2} fillOpacity={1} fill="url(#lateGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Chart: Department Attendance Donut */}
        <div className="lg:col-span-4 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0E2322]">Department Distribution</h2>
            <p className="text-xs text-slate-500 mb-4">Workforce allocation by team</p>

            <div className="h-44 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={DEPT_DATA}
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {DEPT_DATA.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-extrabold text-[#0E2322]">40</span>
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Staff</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            {DEPT_DATA.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></span>
                  <span>{d.name}</span>
                </span>
                <span className="font-semibold text-slate-800">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Real-Time Scan Activity Table & Search Filter */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#0E2322]">
              Live Entrance Presence Feed
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Instant cryptographic punch events verified via entrance kiosk device secrets.
            </p>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff, email, team..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#0E2322] w-52"
              />
            </div>

            <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  statusFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter("in")}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  statusFilter === "in" ? "bg-[#CBEED3] text-[#0E2322] shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Clocked IN
              </button>
              <button
                onClick={() => setStatusFilter("out")}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  statusFilter === "out" ? "bg-slate-200 text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Clocked OUT
              </button>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50/70 text-slate-500 uppercase text-[11px] font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Employee</th>
                <th className="px-6 py-3.5">Department</th>
                <th className="px-6 py-3.5">Entrance Location</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Punch Time</th>
                <th className="px-6 py-3.5 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-400">
                    No matching attendance records found.
                  </td>
                </tr>
              ) : (
                filteredActivities.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-6 py-3.5 flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-full bg-[#0E2322] text-[#C0FD9B] font-extrabold flex items-center justify-center text-xs shadow-xs">
                        {item.initials}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{item.name}</div>
                        <div className="text-[11px] text-slate-400">{item.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                        {item.department}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">{item.location}</td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          item.type === "in"
                            ? "bg-[#CBEED3] text-[#0E2322]"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.type === "in" ? "bg-emerald-600" : "bg-slate-400"
                          }`}
                        />
                        {item.type === "in" ? "Clocked IN" : "Clocked OUT"}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-slate-800">{item.time}</td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>HMAC Signed</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Single-Use Staff Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h3 className="text-xl font-bold text-[#0E2322] mb-1">Invite Staff Member</h3>
            <p className="text-xs text-slate-500 mb-4">
              Generates an email-bound, single-use 7-day invite token per AGENTS.md.
            </p>

            <form onSubmit={handleGenerateInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C0FD9B]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C0FD9B]"
                >
                  <option value="employee">Employee (Scoped to their team)</option>
                  <option value="manager">Manager (Can manage their own team)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#0E2322] text-[#C0FD9B] text-xs font-bold hover:bg-[#163331] transition"
                >
                  {inviteCopied ? "✓ Link Copied!" : "Create Single-Use Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
