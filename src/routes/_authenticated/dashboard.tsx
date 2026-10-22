import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { firestoreDb, firebaseAuth } from "@/integrations/firebase/config";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { dayKey } from "@/lib/attendance-day";
import { POLL_EVERY_MS, isIdle, shouldPoll, shouldRefreshOnReturn } from "@/lib/idle-refresh";
import { formatClock, type TodaySummaryData } from "@/lib/attendance-today";
import { TodayPanel } from "@/components/dashboard/TodayPanel";
import { SetupChecklist } from "@/components/dashboard/SetupChecklist";
import { TeamRosterSection } from "@/components/dashboard/TeamRosterSection";
import { buildSetupSteps, setupHiddenKey, setupProgress, type SetupLocation } from "@/lib/setup-checklist";
import { AnalyticsSection } from "@/components/analytics/AnalyticsSection";
import { DEFAULT_DEPARTMENT } from "@/lib/departments";
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
  // Setup checklist (organization admins of a new organization): what exists so far, and whether it was hidden.
  const [setupLocations, setSetupLocations] = useState<SetupLocation[] | null>(null);
  const [setupHidden, setSetupHidden] = useState(false);
  const [orgName, setOrgName] = useState<string>("My Organization");
  const [totalHeadcount, setTotalHeadcount] = useState<number>(1);
  const [pendingInvitesCount, setPendingInvitesCount] = useState<number>(0);
  // Numbers and feed come from the server, computed for TODAY in the organization's timezone.
  const [today, setToday] = useState<TodaySummaryData | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);
  // Self-refresh pauses when the manager has walked away (see src/lib/idle-refresh.ts).
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const lastFetchRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in" | "out">("all");
  const [deptFilter, setDeptFilter] = useState("all");

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "employee">("employee");
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [orgDepartments, setOrgDepartments] = useState<string[]>([DEFAULT_DEPARTMENT]);
  const [inviteDepartment, setInviteDepartment] = useState(DEFAULT_DEPARTMENT);

  // The department list is only needed while the invite form is open.
  useEffect(() => {
    if (!inviteModalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        const res = await fetch("/api/organization/departments", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && Array.isArray(data?.departments)) setOrgDepartments(data.departments);
      } catch {
        // The form still works with just "General".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteModalOpen]);

  // Today's numbers and feed, computed on the server (see /api/attendance/today)
  const fetchToday = async (fresh = false) => {
    lastFetchRef.current = Date.now();
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      // `fresh` is only for the Refresh button: it skips the server's short-lived saved answer.
      const res = await fetch(`/api/attendance/today${fresh ? "?fresh=1" : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.summary) {
        setToday(data.summary as TodaySummaryData);
        setTodayError(null);
      } else {
        setTodayError(data?.error || "Could not load today's attendance.");
      }
    } catch (e) {
      console.warn("Could not load today's attendance:", e);
      setTodayError("Could not reach the server. Check your connection and try Refresh.");
    }
  };

  // A manager or admin removes a team member's work-from-home day for today; then the panel is recomputed.
  const removeWfhDay = async (employeeId: string) => {
    if (!today) return;
    const token = await firebaseAuth.currentUser?.getIdToken();
    const res = await fetch("/api/wfh", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ dayKey: today.dayKey, employeeId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) throw new Error(data?.error || "Could not remove that day.");
    await fetchToday(true);
  };

  useEffect(() => {
    if (!orgId) return;
    try {
      setSetupHidden(localStorage.getItem(setupHiddenKey(orgId)) === "1");
    } catch {
      // Private window or blocked storage: the card just shows.
    }
  }, [orgId]);

  const hideSetup = () => {
    setSetupHidden(true);
    try {
      if (orgId) localStorage.setItem(setupHiddenKey(orgId), "1");
    } catch {
      // Not saved, so it comes back next visit. Harmless.
    }
  };

  const setupSteps = setupLocations ? buildSetupSteps({ locations: setupLocations, headcount: totalHeadcount }) : null;
  const showSetup = Boolean(isOrgAdmin && setupSteps && !setupHidden && !setupProgress(setupSteps).complete);

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
        }
      }

      // 3. Entrances and their tablets, for the setup checklist. Only admins can act on it, so only they ask.
      if (isOrgAdmin) {
        const locRes = await fetch("/api/locations", { headers });
        if (locRes.ok) {
          const locData = await locRes.json();
          if (locData.ok && Array.isArray(locData.locations)) {
            setSetupLocations(locData.locations.map((l: { isPaired?: boolean }) => ({ isPaired: l.isPaired === true })));
          }
        }
      }

    } catch (e) {
      console.warn("Could not fetch org/staff info:", e);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchToday(true), fetchOrgAndStaff()]);
      toast.success("Workforce feed refreshed");
    } finally {
      setRefreshing(false);
    }
  };

  // Lifecycle: load everything once, then refresh today's numbers every 2 minutes, but ONLY while
  // the tab is visible AND the person has touched the page in the last 10 minutes. A tab left
  // open and unattended stops reading the database; coming back refreshes at once.
  useEffect(() => {
    if (!user) return;

    fetchToday();
    fetchOrgAndStaff();
    lastActivityRef.current = Date.now();

    const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

    const onActivity = () => {
      if (!visible()) return;
      const now = Date.now();
      const wasPaused = pausedRef.current;
      lastActivityRef.current = now;
      if (wasPaused) {
        pausedRef.current = false;
        setPaused(false);
        fetchToday();
      } else if (shouldRefreshOnReturn(lastFetchRef.current, now) && !isIdle(lastActivityRef.current, now)) {
        // Back on a tab that was hidden for a while: its numbers are old.
        fetchToday();
      }
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onActivity);

    const interval = setInterval(() => {
      const now = Date.now();
      if (shouldPoll({ visible: visible(), lastActivityMs: lastActivityRef.current, nowMs: now })) {
        fetchToday();
      } else if (visible() && isIdle(lastActivityRef.current, now) && !pausedRef.current) {
        pausedRef.current = true;
        setPaused(true);
      }
    }, POLL_EVERY_MS);

    return () => {
      clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onActivity);
    };
  }, [user, orgId]);

  // ---- Numbers below come from the server (today), not from browser-side math ----

  const todayLabel = today
    ? new Date(`${today.dayKey}T12:00:00Z`).toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "";

  // Today's feed (already newest first, at most 20), filtered by the search box and status buttons
  const feedRows = today?.events ?? [];
  const filteredActivities = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return feedRows.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || item.type === statusFilter;
      const matchesDept = deptFilter === "all" || item.department.toLowerCase() === deptFilter.toLowerCase();
      return matchesSearch && matchesStatus && matchesDept;
    });
  }, [feedRows, searchQuery, statusFilter, deptFilter]);

  // One entrance? The location column adds nothing, so hide it.
  const showLocationColumn = useMemo(
    () => new Set(feedRows.map((r) => r.location).filter(Boolean)).size > 1,
    [feedRows],
  );

  // CSV cells: always quoted, quotes doubled, and a leading = + - @ is neutralized so a
  // name typed as a spreadsheet formula cannot run when the file is opened in Excel.
  const csvCell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };

  // The export reads recent history on demand (not on every page load).
  const handleExportCsv = async () => {
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/attendance/history", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      const records: any[] = res.ok && data?.ok && Array.isArray(data.records) ? data.records : [];
      if (records.length === 0) {
        toast.info("No attendance records to export yet.");
        return;
      }
      const tz = today?.timezone || "UTC";
      const header = ["Date", "Time", "Employee", "Email", "Department", "Location", "Event", "Late", "Early departure"];
      const rows = records.map((r) =>
        [
          dayKey(r.timestamp, tz) ?? "",
          formatClock(r.timestamp, tz),
          r.employeeName || r.name || "Employee",
          r.email || r.employeeEmail || "",
          r.department || "",
          r.locationName || "",
          r.type === "in" ? "Clocked IN" : "Clocked OUT",
          r.late ? "Yes" : "",
          r.earlyDeparture ? "Yes" : "",
        ]
          .map(csvCell)
          .join(","),
      );
      const blob = new Blob([header.map(csvCell).join(",") + "\n" + rows.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ChecIN-Attendance-${dayKey(Date.now(), tz) ?? "export"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded the latest ${records.length} attendance events`);
    } catch (e) {
      console.warn("CSV export failed:", e);
      toast.error("Could not export the attendance report. Please try again.");
    }
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
          department: inviteDepartment,
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

  return (
    <div className="space-y-6 font-sans max-w-7xl mx-auto">
      {/* Header: where you are and the one action that belongs here. Refresh sits with the numbers it
          refreshes, and Export sits with the table it exports. */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0E2322]">
            {isManager ? "Team overview" : "Organization overview"}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {isOrgAdmin ? "Administrator" : isManager ? "Manager" : "Staff"} ·{" "}
            {isManager
              ? `${orgName} · your team of ${totalHeadcount}`
              : `${orgName} · ${totalHeadcount} ${totalHeadcount === 1 ? "person" : "people"}`}
          </p>
        </div>
          {(isOrgAdmin || isManager) && (
            <button
              onClick={() => {
                handleResetForAnotherInvite();
                setInviteModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#0E2322] text-[#C0FD9B] hover:bg-[#163331] text-[13px] font-bold transition shadow-sm flex items-center space-x-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Invite staff member</span>
            </button>
          )}
      </div>

      {/* New organizations: what is left to set up. Gone for good once all three steps are done. */}
      {showSetup && setupSteps && (
        <SetupChecklist
          steps={setupSteps}
          onInvite={() => {
            handleResetForAnotherInvite();
            setInviteModalOpen(true);
          }}
          onHide={hideSetup}
        />
      )}

      {/* Today: counts, live activity, and the late and not-arrived lists. Every figure comes from
          /api/attendance/today (the same answer as the tiles above), so nothing here can disagree. */}
      <TodayPanel
        data={today}
        loading={refreshing || (!today && !todayError)}
        error={todayError}
        onRefresh={handleManualRefresh}
        onRemoveWfh={removeWfhDay}
        showActivity={false}
        canReviewLate={isOrgAdmin || isManager}
      />

      {/* Team roster: one row per person, where they are today and how they have done this month. */}
      {(isOrgAdmin || isManager) && <TeamRosterSection />}

      {/* Activity: today's check-ins, with search and filters. The Today panel above no longer repeats this list. */}
      <div id="todays-checkins" className="scroll-mt-20 bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#0E2322]">
              Today's check-ins
            </h2>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {today
                ? `${todayLabel} · times in your organization's timezone · updated ${formatClock(today.generatedAt, today.timezone)}`
                : "Loading today's activity…"}
              {paused && (
                <span className="ml-1 font-semibold text-amber-800">
                  Paused while you were away. Move the mouse to refresh.
                </span>
              )}
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
                className="pl-8 pr-3 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#0E2322] w-52"
              />
            </div>

            <div className="flex rounded-xl bg-slate-100 p-0.5 text-[13px]">
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
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[13px] font-semibold transition text-slate-700 flex items-center gap-1.5 cursor-pointer"
              title="Download today's check-ins as a spreadsheet file"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] sm:text-sm">
            <thead className="bg-slate-50/70 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Employee</th>
                <th className="px-6 py-3.5">Department</th>
                {showLocationColumn && <th className="px-6 py-3.5">Entrance</th>}
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={showLocationColumn ? 5 : 4} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                        <Clock className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="font-bold text-slate-800 text-sm">
                        {!today && !todayError
                          ? "Loading today's check-ins…"
                          : todayError && !today
                            ? "Couldn't load today's check-ins"
                            : searchQuery || statusFilter !== "all" || deptFilter !== "all"
                              ? "No Matching Attendance Records"
                              : "No check-ins yet today"}
                      </div>
                      <p className="text-[13px] text-slate-400 mt-1 text-center">
                        {!today
                          ? todayError || "One moment."
                          : searchQuery || statusFilter !== "all"
                          ? "Try adjusting your search query or filter."
                          : "When staff scan the code on the entrance tablet, their check-ins will appear here."}
                      </p>
                      {today && !searchQuery && (
                        <button
                          onClick={() => {
                            handleResetForAnotherInvite();
                            setInviteModalOpen(true);
                          }}
                          className="mt-3.5 px-3.5 py-2 rounded-xl bg-[#0E2322] text-[#C0FD9B] text-[13px] font-bold hover:bg-[#163331] transition shadow-xs cursor-pointer flex items-center space-x-1.5"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Invite your first staff member</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredActivities.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-6 py-3.5 flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-full bg-[#0E2322] text-[#C0FD9B] font-extrabold flex items-center justify-center text-[13px] shadow-xs">
                        {item.initials}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{item.name}</div>
                        <div className="text-[13px] text-slate-400">{item.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[13px]">
                        {item.department}
                      </span>
                    </td>
                    {showLocationColumn && <td className="px-6 py-3.5 text-slate-600">{item.location}</td>}
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold ${
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
                        <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">
                          Late
                        </span>
                      )}
                      {item.lateExcused && (
                        <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-[#CBEED3] text-[#0E2322]">
                          Late, excused
                        </span>
                      )}
                      {item.earlyDeparture && (
                        <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">
                          Early departure
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-slate-800">{item.time}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {today && today.eventsTotal > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate-500">
            <span>
              {today.eventsTotal > feedRows.length
                ? `Showing the latest ${feedRows.length} of ${today.eventsTotal} events today.`
                : `${today.eventsTotal} event${today.eventsTotal === 1 ? "" : "s"} today.`}
              {today.truncated ? " Very busy day: some events may not be counted." : ""}
            </span>
            <Link to="/history" className="font-semibold text-[#0E2322] hover:underline">
              View full history →
            </Link>
          </div>
        )}
      </div>

      {/* Attendance analytics: rates, punctuality, hours and the trend, worked out on the server
          (/api/analytics) from daily summaries. */}
      <AnalyticsSection />

      {/* Single-use staff invite */}
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
                <p className="text-[13px] text-slate-500 mb-4">
                  Generates an email-bound, single-use invitation token per AGENTS.md security spec.
                </p>

                {inviteError && (
                  <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-700">
                    {inviteError}
                  </div>
                )}

                <form onSubmit={handleGenerateInvite} className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-semibold text-slate-700 mb-1">
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
                    <label className="block text-[13px] font-semibold text-slate-700 mb-1">
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

                  <div>
                    <label className="block text-[13px] font-semibold text-slate-700 mb-1">
                      Department
                    </label>
                    <select
                      value={inviteDepartment}
                      onChange={(e) => setInviteDepartment(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C0FD9B]"
                    >
                      {orgDepartments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseInviteModal}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={generatingInvite || !inviteEmail.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-[#0E2322] text-[#C0FD9B] text-[13px] font-bold hover:bg-[#163331] transition cursor-pointer disabled:opacity-50"
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
                  <div className="text-[13px] font-semibold">
                    Single-use invite link created for <strong className="text-emerald-950 font-bold">{inviteEmail}</strong>
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                    Invitation URL (Single-Use, Bound to Email)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedInviteUrl}
                      className="flex-1 px-3 py-2 text-[13px] font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none select-all text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={handleCopyGeneratedUrl}
                      className="px-3 py-2 rounded-xl bg-[#0E2322] text-[#C0FD9B] hover:bg-[#163331] text-[13px] font-bold transition flex items-center space-x-1 cursor-pointer shrink-0"
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

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-[13px] text-slate-600 leading-relaxed">
                  <strong className="text-slate-900 font-semibold">How it works:</strong> Share this URL with your colleague. When they click it, they will sign in with Google or their email address to activate their {inviteRole} account and bind to <strong className="text-slate-900 font-semibold">{orgName}</strong>.
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleResetForAnotherInvite}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    + Invite Another Member
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseInviteModal}
                    className="flex-1 py-2.5 rounded-xl bg-[#0E2322] text-white text-[13px] font-bold hover:bg-[#163331] transition cursor-pointer"
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
