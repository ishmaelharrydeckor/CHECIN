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
  Copy,
  Check,
  RefreshCw,
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
  late?: boolean;
  earlyDeparture?: boolean;
}

interface AttendanceRecord {
  id: string;
  employeeId?: string;
  employeeName?: string;
  name?: string;
  email?: string;
  department?: string;
  type: "in" | "out";
  timestamp: string;
  locationName?: string;
  late?: boolean;
  earlyDeparture?: boolean;
}

function DashboardPage() {
  const { user, orgId, isOrgAdmin, isManager, refreshClaims } = useAuth();
  const [orgName, setOrgName] = useState<string>("My Organization");
  const [totalHeadcount, setTotalHeadcount] = useState<number>(1);
  const [pendingInvitesCount, setPendingInvitesCount] = useState<number>(0);
  const [activeStaff, setActiveStaff] = useState<any[]>([]);
  const [liveActivities, setLiveActivities] = useState<ActivityItem[]>([]);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in" | "out">("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [timeRange, setTimeRange] = useState("today");

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "employee">("employee");
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Real-time Attendance Feed Synchronization
  const fetchLiveAttendance = async () => {
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/attendance/feed", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.events)) {
        setLiveActivities(data.events);
      }
    } catch (e) {
      console.warn("Could not poll attendance feed:", e);
    }
  };

  // Fetch real organization details, registered staff members, and attendance history
  const fetchOrgAndStaff = async () => {
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. Fetch organization details
      const orgRes = await fetch("/api/organization", { headers });
      if (orgRes.ok) {
        const orgData = await orgRes.json();
        if (orgData.ok && orgData.organization) {
          setOrgName(orgData.organization.name);
        }
      }

      // 2. Fetch staff invites and members
      const staffRes = await fetch("/api/admin/staff-invites", { headers });
      if (staffRes.ok) {
        const staffData = await staffRes.json();
        if (staffData.ok) {
          setTotalHeadcount(staffData.totalHeadcount ?? 1);
          const pending = (staffData.invites || []).filter((i: any) => i.status === "pending").length;
          setPendingInvitesCount(pending);
          setActiveStaff(staffData.members || []);
        }
      }

      // 3. Fetch attendance history for verified trends and shift calculations
      const historyRes = await fetch("/api/attendance/history", { headers });
      if (historyRes.ok) {
        const histData = await historyRes.json();
        if (histData.ok && Array.isArray(histData.records)) {
          setHistoryRecords(histData.records);
        }
      }
    } catch (e) {
      console.warn("Could not fetch org/staff info:", e);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchLiveAttendance(), fetchOrgAndStaff()]);
      toast.success("Workforce feed refreshed");
    } finally {
      setRefreshing(false);
    }
  };

  // Safe, quota-protective lifecycle: fetch on mount + throttled 60s background check ONLY when tab is visible
  useEffect(() => {
    if (!user) return;

    fetchLiveAttendance();
    fetchOrgAndStaff();

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchLiveAttendance();
      }
    }, 60000); // 60s throttle protects the 50k daily Firestore quota

    return () => clearInterval(interval);
  }, [user, orgId]);

  // Unified, deduplicated telemetry from live feed and historical database records
  const allActivities: ActivityItem[] = useMemo(() => {
    const map = new Map<string, ActivityItem>();

    // 1. Process historical records
    for (const r of historyRecords) {
      const name = r.employeeName || r.name || "Employee";
      const initials =
        name
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "EM";
      map.set(r.id, {
        id: r.id,
        name,
        email: r.email || "",
        initials,
        department: r.department || "General Operations",
        location: r.locationName || (r as any).location || "Main Entrance Terminal",
        type: r.type,
        late: r.late === true,
        earlyDeparture: r.earlyDeparture === true,
        time: new Date(r.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      });
    }

    // 2. Overlay live activities (already normalized)
    for (const a of liveActivities) {
      map.set(a.id, a);
    }

    return Array.from(map.values());
  }, [historyRecords, liveActivities]);

  // Combined raw telemetry events for weekly trend & shift calculations
  const allTelemetryEvents = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of historyRecords) {
      map.set(r.id, r);
    }
    for (const a of liveActivities) {
      if (!map.has(a.id)) {
        map.set(a.id, a);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [historyRecords, liveActivities]);

  // 5-Day Weekly Trend Data (Mon-Fri) calculated purely from real events
  const weeklyTrend = useMemo(() => {
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0: Sun, 1: Mon, ... 6: Sat
    const distanceToMonday = (currentDayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);
    monday.setHours(0, 0, 0, 0);

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

    return days.map((dayName, idx) => {
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + idx);
      const dayStart = new Date(dayDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayDate);
      dayEnd.setHours(23, 59, 59, 999);

      const isToday = now.toDateString() === dayDate.toDateString();
      const isFuture = dayDate.getTime() > now.getTime() && !isToday;
      const label = isToday ? `${dayName} (Today)` : dayName;

      if (isFuture) {
        return { day: label, present: 0, late: 0, wfh: 0 };
      }

      // Filter "in" events that fell on this day
      const dayInEvents = allTelemetryEvents.filter((e) => {
        if (e.type !== "in") return false;
        const t = new Date(e.timestamp).getTime();
        return t >= dayStart.getTime() && t <= dayEnd.getTime();
      });

      // Group by unique employee
      const uniqueEmployees = new Map<string, Date>();
      for (const ev of dayInEvents) {
        const key = ev.employeeId || ev.email || ev.name;
        const evTime = new Date(ev.timestamp);
        if (!uniqueEmployees.has(key) || evTime < uniqueEmployees.get(key)!) {
          uniqueEmployees.set(key, evTime);
        }
      }

      let present = uniqueEmployees.size;
      let late = 0;

      // On-time cutoff: 9:15 AM
      for (const firstInTime of uniqueEmployees.values()) {
        const hours = firstInTime.getHours();
        const minutes = firstInTime.getMinutes();
        if (hours > 9 || (hours === 9 && minutes > 15)) {
          late++;
        }
      }

      return { day: label, present, late, wfh: 0 };
    });
  }, [allTelemetryEvents]);

  const yAxisMax = useMemo(() => {
    const maxVal = Math.max(1, ...weeklyTrend.map((d) => Math.max(d.present, d.late)));
    return Math.max(3, maxVal, totalHeadcount);
  }, [weeklyTrend, totalHeadcount]);

  // Department Distribution Data dynamically grouped from real active staff & events
  const deptData = useMemo(() => {
    const counts: Record<string, number> = {};

    if (activeStaff && activeStaff.length > 0) {
      for (const member of activeStaff) {
        const dept =
          member.department ||
          (member.role === "org_admin" ? "Leadership" : member.role === "manager" ? "Management" : "Operations");
        counts[dept] = (counts[dept] || 0) + 1;
      }
    } else {
      counts["Operations"] = Math.max(1, totalHeadcount);
    }

    const PALETTE = ["#0E2322", "#C0FD9B", "#FFD153", "#38BDF8", "#A78BFA", "#F472B6", "#FB923C"];

    return Object.entries(counts).map(([name, value], idx) => ({
      name,
      value,
      color: PALETTE[idx % PALETTE.length],
    }));
  }, [activeStaff, totalHeadcount]);

  // On-time metrics calculated from today's real check-in events
  const onTimeMetrics = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayInEvents = allTelemetryEvents.filter((e) => {
      if (e.type !== "in") return false;
      return new Date(e.timestamp).getTime() >= todayStart.getTime();
    });

    if (todayInEvents.length === 0) {
      return {
        rateDisplay: "—",
        subtext: "Awaiting today's first punch",
        textColor: "text-[#166534]",
      };
    }

    // Earliest IN punch per person today
    const firstInByPerson = new Map<string, Date>();
    for (const ev of todayInEvents) {
      const key = ev.employeeId || ev.email || ev.name;
      const t = new Date(ev.timestamp);
      if (!firstInByPerson.has(key) || t < firstInByPerson.get(key)!) {
        firstInByPerson.set(key, t);
      }
    }

    const totalEmployeesPunched = firstInByPerson.size;
    let onTimeCount = 0;
    for (const firstTime of firstInByPerson.values()) {
      const hours = firstTime.getHours();
      const minutes = firstTime.getMinutes();
      // On-time policy: on or before 9:15 AM
      if (hours < 9 || (hours === 9 && minutes <= 15)) {
        onTimeCount++;
      }
    }

    const percentage = Math.round((onTimeCount / totalEmployeesPunched) * 100);
    return {
      rateDisplay: `${percentage}%`,
      subtext: `${onTimeCount} of ${totalEmployeesPunched} arrived on schedule (≤ 9:15 AM)`,
      textColor: percentage >= 80 ? "text-[#166534]" : "text-amber-800",
    };
  }, [allTelemetryEvents]);

  // Average shift length calculated from real today's paired IN and OUT events
  const avgShiftMetrics = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const eventsByPerson = new Map<string, Array<{ type: "in" | "out"; time: number }>>();
    for (const ev of allTelemetryEvents) {
      const t = new Date(ev.timestamp).getTime();
      if (t < todayStart.getTime()) continue;
      const key = ev.employeeId || ev.email || ev.name;
      if (!eventsByPerson.has(key)) {
        eventsByPerson.set(key, []);
      }
      eventsByPerson.get(key)!.push({ type: ev.type, time: t });
    }

    const shiftDurationsHours: number[] = [];
    let inProgressCount = 0;

    for (const punches of eventsByPerson.values()) {
      punches.sort((a, b) => a.time - b.time);

      let currentInTime: number | null = null;
      for (const p of punches) {
        if (p.type === "in") {
          currentInTime = p.time;
        } else if (p.type === "out" && currentInTime !== null) {
          const durationHours = (p.time - currentInTime) / (1000 * 60 * 60);
          if (durationHours > 0) {
            shiftDurationsHours.push(durationHours);
          }
          currentInTime = null;
        }
      }
      if (currentInTime !== null) {
        inProgressCount++;
      }
    }

    if (shiftDurationsHours.length === 0) {
      if (inProgressCount > 0) {
        return {
          display: "In Progress",
          subtext: `${inProgressCount} active shift${inProgressCount === 1 ? "" : "s"} on site (calculates upon OUT punch)`,
        };
      }
      return {
        display: "—",
        subtext: "Calculates upon check-out (IN → OUT)",
      };
    }

    const sumHours = shiftDurationsHours.reduce((acc, h) => acc + h, 0);
    const avg = sumHours / shiftDurationsHours.length;

    return {
      display: `${avg.toFixed(1)} hrs`,
      subtext: `Based on ${shiftDurationsHours.length} completed shift${shiftDurationsHours.length === 1 ? "" : "s"} today`,
    };
  }, [allTelemetryEvents]);

  // Dynamic present count based on real events
  const presentCount = useMemo(() => {
    const latestByPerson = new Map<string, "in" | "out">();
    for (const act of allActivities) {
      const key = act.email || act.name;
      if (!latestByPerson.has(key)) {
        latestByPerson.set(key, act.type);
      }
    }
    let inCount = 0;
    for (const t of latestByPerson.values()) {
      if (t === "in") inCount++;
    }
    return inCount;
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
    if (filteredActivities.length === 0) {
      toast.info("No attendance records to export yet.");
      return;
    }
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

  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setGeneratingInvite(true);
    setInviteError(null);
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/staff-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (data.ok && data.inviteUrl) {
        setGeneratedInviteUrl(data.inviteUrl);
        try {
          await navigator.clipboard.writeText(data.inviteUrl);
          setInviteCopied(true);
        } catch {
          // Clipboard API may need user interaction; button handles fallback
        }
        toast.success("Single-use invite link created and copied to clipboard!");
        await fetchOrgAndStaff();
      } else {
        setInviteError(data.error || "Failed to generate invite");
        toast.error(data.error || "Failed to generate invite");
      }
    } catch (err: any) {
      setInviteError(err?.message || "Error creating staff invite");
      toast.error("Error creating staff invite");
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleCopyGeneratedUrl = async () => {
    if (!generatedInviteUrl) return;
    try {
      await navigator.clipboard.writeText(generatedInviteUrl);
      setInviteCopied(true);
      toast.success("Invite link copied to clipboard!");
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      toast.error("Could not copy automatically. Please select and copy the link text.");
    }
  };

  const handleCloseInviteModal = () => {
    setInviteModalOpen(false);
    setGeneratedInviteUrl(null);
    setInviteEmail("");
    setInviteCopied(false);
    setInviteError(null);
  };

  const handleResetForAnotherInvite = () => {
    setGeneratedInviteUrl(null);
    setInviteEmail("");
    setInviteCopied(false);
    setInviteError(null);
  };

  const displayHeadcount = totalHeadcount;

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
            <span className="text-[#0E2322] font-semibold">
              {isManager
                ? `${orgName} — Your Team (${totalHeadcount} Member${totalHeadcount === 1 ? "" : "s"})`
                : `${orgName} (${totalHeadcount} Registered Staff)`}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0E2322]">
            {isManager ? "Team Presence Roster" : "Organization Overview"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {isManager
              ? "Live attendance and entrance activity for your direct reports."
              : "Real-time workforce presence intelligence, entrance activity, and compliance telemetry."}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold transition text-slate-700 flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            title="Refresh attendance records from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold transition text-slate-700 flex items-center space-x-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          {(isOrgAdmin || isManager) && (
            <button
              onClick={() => {
                handleResetForAnotherInvite();
                setInviteModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#0E2322] text-[#C0FD9B] hover:bg-[#163331] text-xs font-bold transition shadow-sm flex items-center space-x-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Invite Staff Member</span>
            </button>
          )}
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
            <div className="text-3xl font-extrabold text-[#0E2322]">{displayHeadcount}</div>
            <div className="flex items-center space-x-1 text-xs text-emerald-600 mt-2 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>
                {pendingInvitesCount > 0
                  ? `${pendingInvitesCount} pending invitation(s)`
                  : `${totalHeadcount} active team member(s)`}
              </span>
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
              {presentCount} <span className="text-sm font-normal text-slate-700">/ {displayHeadcount}</span>
            </div>
            <div className="text-xs text-[#854D0E] mt-2 font-semibold">
              {displayHeadcount > 0 ? ((presentCount / displayHeadcount) * 100).toFixed(0) : 0}% workforce present on site
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
            <div className="text-3xl font-extrabold text-[#0E2322]">
              {onTimeMetrics.rateDisplay}
            </div>
            <div className={`text-xs ${onTimeMetrics.textColor} mt-2 font-medium`}>
              {onTimeMetrics.subtext}
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
            <div className="text-3xl font-extrabold text-[#0E2322]">
              {avgShiftMetrics.display}
            </div>
            <div className="text-xs text-slate-500 mt-2 font-medium">
              {avgShiftMetrics.subtext}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Interactive Charts or Onboarding Telemetry Card */}
      {allActivities.length > 0 ? (
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
                <AreaChart data={weeklyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                  <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} domain={[0, yAxisMax]} allowDecimals={false} />
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
                      data={deptData}
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {deptData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-extrabold text-[#0E2322]">{displayHeadcount}</span>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Staff</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              {deptData.map((d) => (
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
      ) : (
        <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-2xl bg-[#E8FCE4] text-[#0E2322] flex items-center justify-center mb-3">
            <Building2 className="w-6 h-6 text-[#122300]" />
          </div>
          <h3 className="text-base font-bold text-[#0E2322]">Awaiting Live Entrance Telemetry</h3>
          <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
            Your organization <strong className="text-slate-800 font-semibold">{orgName}</strong> is active. Once your team members check in via the entrance kiosk tablet, 5-day attendance trends and department distribution will render here automatically.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                handleResetForAnotherInvite();
                setInviteModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-[#0E2322] text-[#C0FD9B] text-xs font-bold hover:bg-[#163331] transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Invite Team Member</span>
            </button>
            <Link
              to="/kiosk"
              target="_blank"
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition shadow-xs flex items-center space-x-1.5"
            >
              <span>📺 Open Entrance Kiosk</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

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
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                        <Clock className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="font-bold text-slate-800 text-sm">
                        {searchQuery || statusFilter !== "all" || deptFilter !== "all"
                          ? "No Matching Attendance Records"
                          : "No Check-Ins Recorded Today"}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 text-center">
                        {searchQuery || statusFilter !== "all"
                          ? "Try adjusting your search query or filter."
                          : `No attendance events recorded today for ${orgName}. When staff scan the rotating QR code on your entrance kiosk, their punch events will appear here in real time.`}
                      </p>
                      {!searchQuery && (
                        <button
                          onClick={() => {
                            handleResetForAnotherInvite();
                            setInviteModalOpen(true);
                          }}
                          className="mt-3.5 px-3.5 py-2 rounded-xl bg-[#0E2322] text-[#C0FD9B] text-xs font-bold hover:bg-[#163331] transition shadow-xs cursor-pointer flex items-center space-x-1.5"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>+ Invite First Staff Member</span>
                        </button>
                      )}
                    </div>
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
                      {item.late && (
                        <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">
                          Late
                        </span>
                      )}
                      {item.earlyDeparture && (
                        <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">
                          Early departure
                        </span>
                      )}
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

      {/* 5. Upgraded Single-Use Staff Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            {!generatedInviteUrl ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xl font-bold text-[#0E2322]">Invite Staff Member</h3>
                  <span className="px-2.5 py-0.5 text-[10px] font-semibold rounded-full bg-[#E8FCE4] text-[#122300]">
                    14-Day Expiry
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Generates an email-bound, single-use invitation token per AGENTS.md security spec.
                </p>

                {inviteError && (
                  <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {inviteError}
                  </div>
                )}

                <form onSubmit={handleGenerateInvite} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Staff Email Address
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
                      <option value="employee">Employee (Scan entrance kiosk to clock in/out)</option>
                      {isOrgAdmin && (
                        <option value="manager">Manager (Can manage their team & view roster)</option>
                      )}
                    </select>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseInviteModal}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={generatingInvite || !inviteEmail.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-[#0E2322] text-[#C0FD9B] text-xs font-bold hover:bg-[#163331] transition cursor-pointer disabled:opacity-50"
                    >
                      {generatingInvite ? "Generating Link..." : "Create Single-Use Invite"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-emerald-700 bg-emerald-50 p-3 rounded-2xl border border-emerald-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                  <div className="text-xs font-semibold">
                    Single-use invite link created for <strong className="text-emerald-950 font-bold">{inviteEmail}</strong>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Invitation URL (Single-Use, Bound to Email)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedInviteUrl}
                      className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none select-all text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={handleCopyGeneratedUrl}
                      className="px-3 py-2 rounded-xl bg-[#0E2322] text-[#C0FD9B] hover:bg-[#163331] text-xs font-bold transition flex items-center space-x-1 cursor-pointer shrink-0"
                    >
                      {inviteCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 leading-relaxed">
                  <strong className="text-slate-900 font-semibold">How it works:</strong> Share this URL with your colleague. When they click it, they will sign in with Google or their email address to activate their {inviteRole} account and bind to <strong className="text-slate-900 font-semibold">{orgName}</strong>.
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleResetForAnotherInvite}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    + Invite Another Member
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseInviteModal}
                    className="flex-1 py-2.5 rounded-xl bg-[#0E2322] text-white text-xs font-bold hover:bg-[#163331] transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
