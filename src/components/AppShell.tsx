import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LogOut,
  FileBarChart,
  Settings,
  Megaphone,
  CalendarDays,
  Umbrella,
  Home,
  Clock,
  ExternalLink,
  User,
  Menu,
  Inbox,
  CalendarClock,
  AlarmClock,
  Building2,
  Tablet,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import { firebaseAuth, fbSignOut } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  registerOrVerifyDevice,
  getDeviceId,
  listenToDeviceStatus,
} from "@/lib/device-manager";
import { InAppNotificationCenter } from "@/components/PushNotificationManager";
import { ReportProblemButton } from "@/components/ReportProblemDialog";
import { useIsPlatformOwner } from "@/lib/platform-owner-client";
import { toast } from "sonner";
import { clearUserAppCache } from "@/lib/query-client";

// Pages employees must never see (management views); they are sent to their own history instead
const MANAGER_ONLY_PATHS = ["/dashboard", "/reports", "/departments", "/settings", "/shifts", "/late-arrivals"];

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  /** Small heading above the group; omitted for a single short list. */
  heading?: string;
  items: NavItem[];
}

/** The menu, in groups. Employees get their own short list; everyone else is default-denied to it. */
function navGroupsFor(canManage: boolean): NavGroup[] {
  if (canManage) {
    return [
      {
        heading: "Dashboards",
        items: [
          { to: "/dashboard", label: "Roster", icon: Home },
          { to: "/history", label: "History", icon: Clock },
        ],
      },
      {
        heading: "Manage",
        items: [
          { to: "/late-arrivals", label: "Late arrivals", icon: AlarmClock },
          { to: "/shifts", label: "Shifts", icon: CalendarClock },
          { to: "/leave", label: "Leave", icon: Umbrella },
          { to: "/holidays", label: "Holidays", icon: CalendarDays },
          { to: "/announcements", label: "Notices", icon: Megaphone },
        ],
      },
      {
        heading: "Reports",
        items: [{ to: "/reports", label: "Reports", icon: FileBarChart }],
      },
      {
        heading: "Admin",
        items: [
          { to: "/departments", label: "Departments", icon: Building2 },
          { to: "/settings", label: "Settings", icon: Settings },
        ],
      },
    ];
  }
  return [
    {
      heading: "My workspace",
      items: [
        { to: "/me", label: "My Page", icon: User },
        { to: "/history", label: "My History", icon: Clock },
        { to: "/my-shifts", label: "My Shifts", icon: CalendarClock },
        { to: "/leave", label: "Leave", icon: Umbrella },
        { to: "/holidays", label: "Holidays", icon: CalendarDays },
        { to: "/announcements", label: "Notices", icon: Megaphone },
      ],
    },
  ];
}

/** The grouped links, used by the desktop sidebar and the phone drawer. */
function NavList({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((group) => (
        <div key={group.heading ?? "main"}>
          {group.heading && (
            <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {group.heading}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to as any}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      isActive
                        ? "bg-[#0E2322] text-[#C0FD9B]"
                        : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isOrgAdmin, isManager, loading } = useAuth();
  // Only decides whether to SHOW the inbox link; the server checks every request itself.
  const isPlatformOwner = useIsPlatformOwner(user?.id);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Default-deny UI: anyone who is not an org admin or manager (employees, or a role that
  // has not loaded yet) gets the limited employee menu. Data is also scoped server-side.
  const canManage = isOrgAdmin || isManager;

  useEffect(() => {
    if (loading || !user || canManage) return;
    if (MANAGER_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
      navigate({ to: "/history", replace: true });
    }
  }, [loading, user, canManage, pathname, navigate]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      clearUserAppCache();
      await fbSignOut(firebaseAuth);
      toast.success("Signed out successfully");
      navigate({ to: "/auth" });
    } catch {
      toast.error("Could not sign out completely");
    }
  };

  // Device session registration for /account audit (without intrusive lockout popups)
  useEffect(() => {
    if (!user?.id) return;
    const deviceId = getDeviceId();

    registerOrVerifyDevice(user.id).catch(() => {});

    const unsub = listenToDeviceStatus(user.id, deviceId, () => {
      toast.error("This device session has been revoked from another device.");
      fbSignOut(firebaseAuth);
      navigate({ to: "/auth" });
    });

    return () => unsub();
  }, [user?.id, navigate]);

  const groups = navGroupsFor(canManage);
  const currentLabel = groups.flatMap((g) => g.items).find((i) => pathname.startsWith(i.to))?.label ?? "";
  const homePath = canManage ? "/dashboard" : "/history";
  const closeMenu = () => setMobileMenuOpen(false);

  const brand = (
    <Link to={homePath} onClick={closeMenu} className="flex items-center gap-2.5 group">
      <div className="w-8 h-8 rounded-xl bg-[#0E2322] text-[#C0FD9B] font-extrabold flex items-center justify-center text-sm shadow-md group-hover:scale-105 transition-transform">
        C
      </div>
      <div className="font-extrabold text-base tracking-tight text-[#0E2322]">ChecIN</div>
    </Link>
  );

  /** Tools that open in their own tab, then the person's own account and sign out. */
  const footer = (
    <div className="space-y-1 pt-3 border-t border-slate-200">
      {canManage && (
        <Link
          to="/kiosk"
          target="_blank"
          onClick={closeMenu}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
          title="Open the entrance tablet screen in a new tab"
        >
          <Tablet className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">Kiosk</span>
          <ExternalLink className="size-3 text-slate-400" aria-hidden />
        </Link>
      )}
      <Link
        to="/scan"
        target="_blank"
        onClick={closeMenu}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
        title="Open the phone scanner in a new tab"
      >
        <ScanLine className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">Scanner</span>
        <ExternalLink className="size-3 text-slate-400" aria-hidden />
      </Link>
      <Link
        to="/account"
        onClick={closeMenu}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
        title="My account"
      >
        <User className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 min-w-0">
          <span className="block truncate">{user?.displayName || "My account"}</span>
          {user?.email && <span className="block truncate text-xs font-normal text-slate-500">{user.email}</span>}
        </span>
      </Link>
      <Button
        variant="ghost"
        onClick={handleSignOut}
        aria-label="Sign Out"
        className="w-full justify-start h-9 px-3 text-sm font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
        title="Sign out of ChecIN"
      >
        <LogOut className="size-4 mr-2.5" aria-hidden />
        Sign Out
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex w-full bg-[#F8FAFC] font-sans">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 sticky top-0 h-screen border-r border-slate-200 bg-white">
        <div className="px-5 py-4">{brand}</div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavList groups={groups} pathname={pathname} />
        </div>
        <div className="px-3 pb-3">{footer}</div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Slim top bar: the phone menu button, where you are, and the quick icons */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 h-14 px-4 sm:px-8 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition focus:outline-none"
              aria-label="Open navigation menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="md:hidden">{brand}</div>
            {currentLabel && (
              <p className="hidden md:block text-sm font-semibold text-[#0E2322] truncate">{currentLabel}</p>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {user?.id && <InAppNotificationCenter userId={user.id} />}
            {isPlatformOwner && (
              <Link
                to="/owner/reports"
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                title="Reports inbox"
                aria-label="Reports inbox"
              >
                <Inbox className="w-4 h-4" />
              </Link>
            )}
            <ReportProblemButton variant="icon" />
          </div>
        </header>

        {/* Phone drawer: the same menu, in a panel that slides in from the left */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-72 p-0 flex flex-col md:hidden">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <SheetDescription className="sr-only">Pages you can open</SheetDescription>
            <div className="px-5 py-4">{brand}</div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <NavList groups={groups} pathname={pathname} onNavigate={closeMenu} />
            </div>
            <div className="px-3 pb-3">{footer}</div>
          </SheetContent>
        </Sheet>

        {/* Main Page Canvas */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
