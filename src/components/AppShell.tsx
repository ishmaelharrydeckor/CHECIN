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

// Whether the menu is the slim icon rail. A per-person convenience, so a failure to read or write it is ignored.
const COLLAPSE_KEY = "checin.menu.collapsed";

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
  collapsed = false,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
  /** Icons only, with the name as a tooltip and for screen readers. */
  collapsed?: boolean;
}) {
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((group, index) => (
        <div key={group.heading ?? "main"}>
          {group.heading && !collapsed && (
            <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {group.heading}
            </p>
          )}
          {collapsed && index > 0 && <div className="mx-3 mb-2 border-t border-slate-200" aria-hidden />}
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
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-2.5 py-1.5 rounded-lg text-sm font-medium transition ${
                      collapsed ? "justify-center px-0" : "px-3"
                    } ${
                      isActive
                        ? "bg-[#0E2322] text-[#C0FD9B]"
                        : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
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
  const [collapsed, setCollapsed] = useState(false);

  // Remember the choice on this device. Starts expanded so the first paint matches the server.
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      // Private window or blocked storage: the menu simply starts expanded.
    }
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((was) => {
      const next = !was;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Not remembered, but the menu still collapses.
      }
      return next;
    });

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

  const brandMark = (
    <Link to={homePath} aria-label="ChecIN home" className="flex items-center justify-center group">
      <div className="w-8 h-8 rounded-xl bg-[#0E2322] text-[#C0FD9B] font-extrabold flex items-center justify-center text-sm shadow-md group-hover:scale-105 transition-transform">
        C
      </div>
    </Link>
  );

  /** Tools that open in their own tab, then the person's own account and sign out. Icons only when collapsed. */
  const renderFooter = (rail: boolean) => (
    <div className="space-y-0.5 pt-3 border-t border-slate-200">
      {canManage && (
        <Link
          to="/kiosk"
          target="_blank"
          onClick={closeMenu}
          className={`flex items-center gap-2.5 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition ${rail ? "justify-center px-0" : "px-3"}`}
          title="Open the entrance tablet screen in a new tab"
        >
          <Tablet className="size-4 shrink-0" aria-hidden />
          <span className={rail ? "sr-only" : "flex-1"}>Kiosk</span>
          {!rail && <ExternalLink className="size-3 text-slate-400" aria-hidden />}
        </Link>
      )}
      <Link
        to="/scan"
        target="_blank"
        onClick={closeMenu}
        className={`flex items-center gap-2.5 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition ${rail ? "justify-center px-0" : "px-3"}`}
        title="Open the phone scanner in a new tab"
      >
        <ScanLine className="size-4 shrink-0" aria-hidden />
        <span className={rail ? "sr-only" : "flex-1"}>Scanner</span>
        {!rail && <ExternalLink className="size-3 text-slate-400" aria-hidden />}
      </Link>
      <Link
        to="/account"
        onClick={closeMenu}
        className={`flex items-center gap-2.5 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition ${rail ? "justify-center px-0" : "px-3"}`}
        title={rail ? user?.displayName || "My account" : "My account"}
      >
        <User className="size-4 shrink-0" aria-hidden />
        <span className={rail ? "sr-only" : "flex-1 min-w-0"}>
          <span className="block truncate">{user?.displayName || "My account"}</span>
          {user?.email && <span className="block truncate text-xs font-normal text-slate-500">{user.email}</span>}
        </span>
      </Link>
      <Button
        variant="ghost"
        onClick={handleSignOut}
        aria-label="Sign Out"
        className={`w-full h-9 text-sm font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer ${rail ? "justify-center px-0" : "justify-start px-3"}`}
        title="Sign out of ChecIN"
      >
        <LogOut className={`size-4 ${rail ? "" : "mr-2.5"}`} aria-hidden />
        {rail ? <span className="sr-only">Sign Out</span> : "Sign Out"}
      </Button>
      {!rail && (
        <p className="px-3 pt-2 text-[11px] text-slate-400">
          <Link to="/terms" target="_blank" className="hover:text-slate-600 underline-offset-2 hover:underline">
            Terms
          </Link>
          {" · "}
          <Link to="/privacy" target="_blank" className="hover:text-slate-600 underline-offset-2 hover:underline">
            Privacy
          </Link>
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex w-full bg-[#F8FAFC] font-sans">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-[#0E2322] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex md:flex-col shrink-0 sticky top-0 h-screen border-r border-slate-200 bg-white transition-[width] duration-200 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className={collapsed ? "px-3 py-4" : "px-5 py-4"}>{collapsed ? brandMark : brand}</div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavList groups={groups} pathname={pathname} collapsed={collapsed} />
        </div>
        <div className="px-3 pb-3">{renderFooter(collapsed)}</div>
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
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden md:inline-flex p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition focus:outline-none"
              aria-label={collapsed ? "Expand the menu" : "Collapse the menu"}
              aria-expanded={!collapsed}
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
            <div className="px-3 pb-3">{renderFooter(false)}</div>
          </SheetContent>
        </Sheet>

        {/* Main Page Canvas */}
        <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
