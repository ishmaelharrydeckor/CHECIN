import { AlarmClock, Building2, CalendarClock, Clock, FileBarChart, Home, Lock, Megaphone, Tablet, Umbrella } from "lucide-react";
import { TodayPanel } from "@/components/dashboard/TodayPanel";
import { ScanResultOverlay } from "@/components/scan/ScanResultOverlay";
import type { TodaySummaryData } from "@/lib/attendance-today";

/**
 * The pictures on the public landing page. They are drawn from ChecIN's own components and colours,
 * with made-up sample people, so nothing is hot-linked from another site and every picture matches
 * the real product. Purely decorative: each one is hidden from screen readers (the text beside it
 * says what it shows) and cannot be clicked.
 */

const SAMPLE_TODAY: TodaySummaryData = {
  dayKey: "2026-10-16",
  timezone: "Africa/Accra",
  generatedAt: "2026-10-16T11:42:00.000Z",
  counts: { expected: 38, present: 34, onSite: 28, late: 3, lateExcused: 1, onLeave: 2, wfh: 2, absent: 2 },
  onTimeRate: { percent: 91, onTime: 31, total: 34 },
  avgShift: { completed: 6, inProgress: 28, avgMinutes: 410 },
  events: [],
  eventsTotal: 0,
  late: [
    { employeeId: "a", name: "Efua Mensah", department: "Operations", arrivedAt: "08:55" },
    { employeeId: "b", name: "Kojo Appiah", department: "Sales", arrivedAt: "09:12" },
    { employeeId: "c", name: "Abena Sarpong", department: "Support", arrivedAt: "09:30" },
  ],
  notArrived: [
    { employeeId: "d", name: "Yaw Darko", department: "Finance" },
    { employeeId: "e", name: "Esi Owusu", department: "Sales" },
  ],
  wfhPeople: [
    { employeeId: "f", name: "Nana Yeboah", department: "Operations" },
    { employeeId: "g", name: "Kofi Asante", department: "Sales" },
  ],
  truncated: false,
};

const SIDEBAR = [
  { label: "Roster", icon: Home, active: true },
  { label: "History", icon: Clock },
  { label: "Late arrivals", icon: AlarmClock },
  { label: "Shifts", icon: CalendarClock },
  { label: "Leave", icon: Umbrella },
  { label: "Reports", icon: FileBarChart },
  { label: "Departments", icon: Building2 },
];

/** The manager dashboard in a browser-style frame, using the real Today panel with sample numbers. */
export function DashboardPreview({ className = "h-[520px]" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#F8FAFC] text-left pointer-events-none select-none ${className}`} aria-hidden>
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-white border-b border-slate-200">
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="ml-3 text-[11px] font-semibold text-slate-500">ChecIN</span>
      </div>
      <div className="flex">
        <div className="hidden md:block w-44 shrink-0 bg-white border-r border-slate-200 p-3 space-y-0.5 min-h-[520px]">
          <div className="flex items-center gap-2 px-2 pb-3">
            <span className="w-6 h-6 rounded-lg bg-[#0E2322] text-[#C0FD9B] font-extrabold text-[11px] flex items-center justify-center">C</span>
            <span className="text-sm font-extrabold text-[#0E2322]">ChecIN</span>
          </div>
          {SIDEBAR.map(({ label, icon: Icon, active }) => (
            <div
              key={label}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                active ? "bg-[#0E2322] text-[#C0FD9B]" : "text-slate-700"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </div>
          ))}
        </div>
        <div className="flex-1 min-w-0 p-4 sm:p-6 space-y-5">
          <div>
            <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#0E2322]">Organization overview</h3>
            <p className="text-xs text-slate-500 mt-0.5">Who is in, who is late and who is away, today and over time.</p>
          </div>
          <TodayPanel data={SAMPLE_TODAY} loading={false} error={null} showActivity={false} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The rotating code
// ---------------------------------------------------------------------------

/** A QR-style pattern: three corner squares and a fixed scatter of cells. An illustration, not a real code. */
function QrPattern({ className = "" }: { className?: string }) {
  const n = 21;
  let seed = 11;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && next() > 0.52) cells.push({ x, y });
  const finder = (ox: number, oy: number) => (
    <g key={`${ox}-${oy}`}>
      <rect x={ox} y={oy} width="7" height="7" fill="#0E2322" />
      <rect x={ox + 1} y={oy + 1} width="5" height="5" fill="#fff" />
      <rect x={ox + 2} y={oy + 2} width="3" height="3" fill="#0E2322" />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className={className} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      {[finder(0, 0), finder(n - 7, 0), finder(0, n - 7)]}
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" fill="#0E2322" />
      ))}
    </svg>
  );
}

/** The entrance tablet showing a code that is about to change. */
export function QrTablet({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-5 pointer-events-none select-none" aria-hidden>
      <div className={`rounded-[22px] bg-slate-900 p-2.5 shadow-2xl ${compact ? "w-[150px]" : "w-[230px]"}`}>
        <div className="rounded-[14px] bg-white p-3">
          <QrPattern className="w-full h-auto" />
          <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Main entrance</p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <svg viewBox="0 0 44 44" className={compact ? "size-14" : "size-20"}>
          <circle cx="22" cy="22" r="18" fill="none" stroke={onDark ? "#3C5A52" : "#E2E8F0"} strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke={onDark ? "#C0FD9B" : "#0E2322"}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="113"
            strokeDashoffset="38"
            transform="rotate(-90 22 22)"
          />
          <text x="22" y="26" textAnchor="middle" fontSize="13" fontWeight="800" fill={onDark ? "#FFFFFF" : "#0E2322"}>
            15
          </text>
        </svg>
        <span className={`text-[11px] font-semibold ${onDark ? "text-white/70" : "text-slate-500"}`}>seconds left</span>
      </div>
    </div>
  );
}

/** A phone showing the real check-in confirmation. */
export function PhoneCheckIn() {
  return (
    <div className="relative mx-auto w-[210px] h-[400px] rounded-[36px] border-[7px] border-slate-800 bg-black shadow-2xl overflow-hidden pointer-events-none select-none" aria-hidden>
      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-16 h-3.5 rounded-full bg-slate-900 z-50" />
      <div className="relative w-[300px] h-[560px] scale-[0.68] origin-top-left">
        <ScanResultOverlay state={{ kind: "success", type: "in", time: "08:12", location: "Main entrance" }} onPrimary={() => {}} />
      </div>
    </div>
  );
}

const TEAM = [
  { name: "Ama Boateng", dept: "Operations", status: "In", cls: "bg-[#CBEED3] text-[#0E2322]", time: "08:02" },
  { name: "Kwesi Adjei", dept: "Sales", status: "In", cls: "bg-[#CBEED3] text-[#0E2322]", time: "08:10" },
  { name: "Efua Mensah", dept: "Support", status: "Late", cls: "bg-amber-100 text-amber-900", time: "08:55" },
  { name: "Nana Yeboah", dept: "Operations", status: "Home", cls: "bg-violet-100 text-violet-900", time: "" },
  { name: "Akosua Frimpong", dept: "Finance", status: "Leave", cls: "bg-[#FCF2CB] text-[#854D0E]", time: "" },
];

/** A short live list of who is in, late, at home or away. */
export function TeamList() {
  return (
    <div className="w-full max-w-[300px] rounded-2xl bg-white p-4 shadow-2xl pointer-events-none select-none" aria-hidden>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-[#0E2322]">Today</p>
        <p className="text-[11px] text-slate-500">34 of 38 in</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {TEAM.map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 shrink-0 rounded-full bg-[#0E2322] text-[#C0FD9B] text-[10px] font-extrabold flex items-center justify-center">
                {p.name.split(" ").map((w) => w[0]).join("")}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-[#0E2322] truncate">{p.name}</span>
                <span className="block text-[11px] text-slate-500 truncate">{p.dept}</span>
              </span>
            </div>
            <span className="flex items-center gap-1.5 shrink-0">
              {p.time && <span className="text-[11px] font-mono text-slate-500">{p.time}</span>}
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${p.cls}`}>{p.status}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A tablet that has been paired to one entrance, and the secret that makes it the real door. */
export function DoorPairing() {
  return (
    <div className="flex items-center justify-center gap-4 pointer-events-none select-none" aria-hidden>
      <div className="w-[120px] rounded-[18px] bg-slate-900 p-2 shadow-xl">
        <div className="rounded-xl bg-white p-3 flex flex-col items-center gap-1.5">
          <Tablet className="size-8 text-[#0E2322]" />
          <span className="text-[10px] font-semibold text-slate-500">Main entrance</span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="w-14 border-t-2 border-dashed border-emerald-700/60" />
        <span className="w-8 h-8 rounded-full bg-[#0E2322] text-[#C0FD9B] flex items-center justify-center">
          <Lock className="size-4" />
        </span>
        <span className="w-14 border-t-2 border-dashed border-emerald-700/60" />
      </div>
      <div className="rounded-xl bg-white px-3.5 py-3 shadow-lg border border-emerald-200">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Paired</p>
        <p className="text-sm font-bold text-[#0E2322]">Your account</p>
        <span className="mt-1 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#CBEED3] text-[#0E2322]">Verified</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The four capability pictures
// ---------------------------------------------------------------------------

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full bg-[#F8FAFC] flex items-center justify-center p-6 sm:p-8 pointer-events-none select-none" aria-hidden>
      {children}
    </div>
  );
}

const ACTIVITY = [
  { name: "Ama Boateng", where: "Main entrance", kind: "Clocked IN", time: "08:02", cls: "bg-[#CBEED3] text-[#0E2322]" },
  { name: "Kwesi Adjei", where: "Main entrance", kind: "Clocked IN", time: "08:10", cls: "bg-[#CBEED3] text-[#0E2322]" },
  { name: "Efua Mensah", where: "Main entrance", kind: "Clocked IN · Late", time: "08:55", cls: "bg-amber-100 text-amber-900" },
  { name: "Yaa Osei", where: "Back gate", kind: "Clocked OUT", time: "11:30", cls: "bg-slate-100 text-slate-700" },
];

export function ActivityPanel() {
  return (
    <Panel>
      <div className="w-full max-w-[460px] rounded-2xl bg-white p-5 shadow-xl border border-slate-200">
        <p className="text-sm font-bold text-[#0E2322]">Live activity</p>
        <p className="text-xs text-slate-500 mb-2">4 events today</p>
        <ul className="divide-y divide-slate-100">
          {ACTIVITY.map((a) => (
            <li key={a.name} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#0E2322] truncate">{a.name}</span>
                <span className="block text-xs text-slate-500">{a.where}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${a.cls}`}>{a.kind}</span>
                <span className="text-xs font-mono text-slate-600">{a.time}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

export function LeavePanel() {
  const rows = [
    { who: "Akosua Frimpong", what: "Annual leave · 12 to 14 Oct", days: "3 days", status: "Approved", cls: "bg-[#CBEED3] text-[#0E2322]" },
    { who: "Kojo Appiah", what: "Sick leave · 20 Oct", days: "1 day", status: "Pending", cls: "bg-amber-100 text-amber-900" },
    { who: "Esi Owusu", what: "Annual leave · 2 to 6 Nov", days: "5 days", status: "Pending", cls: "bg-amber-100 text-amber-900" },
  ];
  return (
    <Panel>
      <div className="w-full max-w-[470px] rounded-2xl bg-white p-5 shadow-xl border border-slate-200">
        <p className="text-sm font-bold text-[#0E2322] mb-2">Leave requests</p>
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.who} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#0E2322] truncate">{r.who}</span>
                <span className="block text-xs text-slate-500 truncate">{r.what} · {r.days}</span>
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${r.cls}`}>{r.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

export function NoticePanel() {
  return (
    <Panel>
      <div className="w-full max-w-[440px] space-y-3">
        <div className="rounded-2xl bg-white p-5 shadow-xl border border-slate-200">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1.5 rounded-lg bg-[#CBEED3] text-[#0E2322]">
              <Megaphone className="size-4" />
            </span>
            <p className="text-sm font-bold text-[#0E2322]">Office closes early on Friday</p>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            We close at 15:00 for the staff meeting. Please plan your last check-out for then.
          </p>
          <p className="mt-2 text-[11px] text-slate-500">Sent to everyone · 40 people</p>
        </div>
        <div className="rounded-xl bg-slate-900 text-white px-4 py-3 shadow-lg flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-[#C0FD9B] text-[#122300] font-extrabold text-xs flex items-center justify-center">C</span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold">ChecIN</span>
            <span className="block text-[11px] text-white/70 truncate">Office closes early on Friday</span>
          </span>
        </div>
      </div>
    </Panel>
  );
}

const REGISTER = [
  { name: "Ama Boateng", days: ["P", "P", "P", "L", "P"] },
  { name: "Kwesi Adjei", days: ["P", "P", "W", "P", "P"] },
  { name: "Efua Mensah", days: ["P", "A", "P", "P", "P"] },
  { name: "Yaa Osei", days: ["P", "P", "P", "P", "H"] },
];
const CELL: Record<string, string> = {
  P: "bg-[#CBEED3] text-[#0E2322]",
  L: "bg-[#FCF2CB] text-[#854D0E]",
  W: "bg-violet-100 text-violet-900",
  A: "bg-amber-100 text-amber-900",
  H: "bg-slate-100 text-slate-600",
};

export function RecordsPanel() {
  return (
    <Panel>
      <div className="w-full max-w-[470px] rounded-2xl bg-white p-5 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-[#0E2322]">Attendance register</p>
          <span className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700">Export CSV</span>
        </div>
        <div className="grid grid-cols-[1fr_repeat(5,2rem)] items-center gap-1.5 text-[11px] text-slate-500 mb-1.5">
          <span />
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
            <span key={d} className="text-center">{d}</span>
          ))}
        </div>
        {REGISTER.map((r) => (
          <div key={r.name} className="grid grid-cols-[1fr_repeat(5,2rem)] items-center gap-1.5 py-1">
            <span className="text-xs font-semibold text-[#0E2322] truncate">{r.name}</span>
            {r.days.map((d, i) => (
              <span key={i} className={`h-8 rounded-lg text-[11px] font-bold flex items-center justify-center ${CELL[d]}`}>
                {d}
              </span>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}
