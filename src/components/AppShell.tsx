import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LogOut,
  FileBarChart,
  Settings,
  Megaphone,
  Home,
  Clock,
  ExternalLink,
  User,
} from "lucide-react";
import { firebaseAuth, fbSignOut } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  registerOrVerifyDevice,
  getDeviceId,
  listenToDeviceStatus,
  type UserDevice,
} from "@/lib/device-manager";
import { DeviceLimitDialog } from "@/components/DeviceLimitDialog";
import { InAppNotificationCenter } from "@/components/PushNotificationManager";
import { toast } from "sonner";
import { clearUserAppCache } from "@/lib/query-client";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role, orgId, isOrgAdmin, isManager } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [deviceLimitOpen, setDeviceLimitOpen] = useState(false);
  const [activeDevices, setActiveDevices] = useState<UserDevice[]>([]);

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

  // Device session limit check
  useEffect(() => {
    if (!user?.id) return;
    const deviceId = getDeviceId();

    registerOrVerifyDevice(user.id).then((res) => {
      if (res.limitReached) {
        setActiveDevices(res.activeDevices);
        setDeviceLimitOpen(true);
      }
    });

    const unsub = listenToDeviceStatus(user.id, deviceId, () => {
      toast.error("This device session has been revoked from another device.");
      fbSignOut(firebaseAuth);
      navigate({ to: "/auth" });
    });

    return () => unsub();
  }, [user?.id, navigate]);

  const navLinks = [
    { to: "/dashboard", label: "Roster", icon: Home },
    { to: "/history", label: "History", icon: Clock },
    { to: "/reports", label: "Reports", icon: FileBarChart },
    { to: "/announcements", label: "Notices", icon: Megaphone },
    ...(isOrgAdmin ? [{ to: "/settings", label: "Settings", icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col w-full bg-[#F8FAFC] font-sans">
      {user?.id && (
        <DeviceLimitDialog
          open={deviceLimitOpen}
          userId={user.id}
          devices={activeDevices}
          onResolved={() => setDeviceLimitOpen(false)}
        />
      )}

      {/* Main Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-8 py-3 border-b border-slate-200 bg-white/95 backdrop-blur shadow-xs">
        <div className="flex items-center space-x-6 min-w-0">
          {/* ChecIN Brand Mark */}
          <Link to="/dashboard" className="flex items-center space-x-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-[#0E2322] text-[#C0FD9B] font-extrabold flex items-center justify-center text-sm shadow-md group-hover:scale-105 transition-transform">
              C
            </div>
            <div className="font-extrabold text-base tracking-tight text-[#0E2322]">
              ChecIN
            </div>
          </Link>

          {/* Navigation Links */}
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
          <Link
            to="/kiosk"
            target="_blank"
            className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
            title="Open physical entrance tablet screen"
          >
            <span>📺 Kiosk</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </Link>

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

      {/* Main Page Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8">
        {children}
      </main>
    </div>
  );
}
