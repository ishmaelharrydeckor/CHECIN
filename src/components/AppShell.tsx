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
  X,
  Inbox,
} from "lucide-react";
import { firebaseAuth, fbSignOut } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
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
const MANAGER_ONLY_PATHS = ["/dashboard", "/reports", "/departments", "/settings"];

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

  const navLinks = canManage
    ? [
        { to: "/dashboard", label: "Roster", icon: Home },
        { to: "/history", label: "History", icon: Clock },
        { to: "/reports", label: "Reports", icon: FileBarChart },
        { to: "/announcements", label: "Notices", icon: Megaphone },
        { to: "/leave", label: "Leave", icon: Umbrella },
        { to: "/holidays", label: "Holidays", icon: CalendarDays },
        { to: "/settings", label: "Settings", icon: Settings },
      ]
    : [
        { to: "/history", label: "My History", icon: Clock },
        { to: "/announcements", label: "Notices", icon: Megaphone },
        { to: "/leave", label: "Leave", icon: Umbrella },
        { to: "/holidays", label: "Holidays", icon: CalendarDays },
      ];

  return (
    <div className="min-h-screen flex flex-col w-full bg-[#F8FAFC] font-sans">
      {/* Main Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-8 py-3 border-b border-slate-200 bg-white/95 backdrop-blur shadow-xs">
        <div className="flex items-center space-x-4 min-w-0">
          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition focus:outline-none"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

          {/* ChecIN Brand Mark */}
          <Link to={canManage ? "/dashboard" : "/history"} className="flex items-center space-x-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-[#0E2322] text-[#C0FD9B] font-extrabold flex items-center justify-center text-sm shadow-md group-hover:scale-105 transition-transform">
              C
            </div>
            <div className="font-extrabold text-base tracking-tight text-[#0E2322]">
              ChecIN
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map((item) => {
              const isActive = pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to as any}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
                    isActive
                      ? "bg-[#0E2322] text-[#C0FD9B]"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Action Icons & Profile */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Quick Launch Kiosk & Mobile Scan links */}
          {canManage && (
            <Link
              to="/kiosk"
              target="_blank"
              className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
              title="Open physical entrance tablet screen"
            >
              <span>📺 Kiosk</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>
          )}

          <Link
            to="/scan"
            target="_blank"
            className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
            title="Open employee mobile PWA scanner"
          >
            <span>📱 Scanner</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </Link>

          {/* Notifications */}
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

          {/* User Account / Sign Out */}
          <Link
            to="/account"
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
            title="My Account"
          >
            <User className="w-4 h-4" />
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            aria-label="Sign Out"
            className="h-8 px-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
            title="Sign out of ChecIN"
          >
            <LogOut className="w-3.5 h-3.5 mr-1" />
            <span className="hidden xs:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 py-3 space-y-1.5 shadow-sm">
          {navLinks.map((item) => {
            const isActive = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as any}
                onClick={() => setMobileMenuOpen(false)}
                className={`w-full px-3 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2.5 transition ${
                  isActive
                    ? "bg-[#0E2322] text-[#C0FD9B]"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            {canManage && (
              <Link
                to="/kiosk"
                target="_blank"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center space-x-1 py-1 text-slate-700 font-medium"
              >
                <span>📺 Open Kiosk</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </Link>
            )}
            <Link
              to="/scan"
              target="_blank"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center space-x-1 py-1 text-slate-700 font-medium"
            >
              <span>📱 Open Scanner</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>
          </div>
        </div>
      )}

      {/* Main Page Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8">
        {children}
      </main>
    </div>
  );
}
