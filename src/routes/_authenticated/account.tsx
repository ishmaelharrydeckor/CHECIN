import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { firebaseAuth, fbSignOut } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChangePasswordCard } from "@/components/ChangePasswordCard";
import { ReportProblemCard } from "@/components/ReportProblemDialog";
import { toast } from "sonner";
import {
  User,
  ShieldCheck,
  Building2,
  QrCode,
  Laptop,
  Smartphone,
  Tablet,
  Trash2,
  RefreshCw,
  LogOut,
  ExternalLink,
} from "lucide-react";
import {
  getUserDevices,
  revokeDevice,
  revokeOtherDevices,
  getDeviceId,
  type UserDevice,
} from "@/lib/device-manager";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "My Account & Profile — ChecIN" },
      {
        name: "description",
        content: "View your ChecIN corporate profile, assigned manager, and active device sessions.",
      },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user, role, orgId, isOrgAdmin, isManager, isEmployee } = useAuth();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const currentDeviceId = getDeviceId();

  const fetchDevices = async () => {
    if (!user?.id) return;
    setLoadingDevices(true);
    try {
      const list = await getUserDevices(user.id);
      setDevices(list);
    } catch (err) {
      console.error("Error fetching devices:", err);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    void fetchDevices();
  }, [user?.id]);

  const handleRevokeDevice = async (d: UserDevice) => {
    try {
      await revokeDevice(d.id);
      toast.success(`Revoked ${d.device_name}`);
      await fetchDevices();
      if (d.device_id === currentDeviceId) {
        await fbSignOut(firebaseAuth);
        navigate({ to: "/auth" });
      }
    } catch {
      toast.error("Failed to revoke device session");
    }
  };

  const handleSignOut = async () => {
    await fbSignOut(firebaseAuth);
    navigate({ to: "/auth" });
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Account &amp; Security</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your ChecIN profile, verified devices, and active login sessions.
        </p>
      </div>

      {/* Profile Card */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-14 rounded-2xl bg-[#0E2322] text-[#C0FD9B] font-bold text-xl flex items-center justify-center shadow-sm">
                {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : "U"}
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">{user?.displayName || "Corporate User"}</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">{user?.email}</CardDescription>
              </div>
            </div>
            <Badge className="bg-[#E8FCE4] text-[#122300] border-none text-xs font-semibold px-3 py-1">
              {role === "org_admin"
                ? "Organization Admin"
                : role === "manager"
                  ? "Team Manager"
                  : "Employee"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-muted-foreground">Organization Tenant ID</div>
              <div className="font-mono text-xs font-semibold text-slate-800 mt-1">
                {orgId || "Primary Tenant"}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-muted-foreground">Authentication Provider</div>
              <div className="text-xs font-semibold text-slate-800 mt-1 flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-emerald-600" />
                Firebase Auth (Verified)
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change password (email/password accounts only) */}
      <ChangePasswordCard />

      {/* Report a problem */}
      <ReportProblemCard />

      {/* Quick Access Client Portals */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Access Portals</CardTitle>
          <CardDescription className="text-xs">
            Open the dedicated client interface for this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/scan"
            target="_blank"
            className="p-4 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition flex items-center justify-between no-underline"
          >
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-[#E8FCE4] text-[#122300] flex items-center justify-center font-bold">
                📱
              </div>
              <div>
                <div className="font-semibold text-sm text-[#0E2322]">Mobile Scanner (PWA)</div>
                <div className="text-xs text-muted-foreground">Check-in camera screen</div>
              </div>
            </div>
            <ExternalLink className="size-4 text-muted-foreground" />
          </Link>

          <Link
            to="/kiosk"
            target="_blank"
            className="p-4 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition flex items-center justify-between no-underline"
          >
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-[#0E2322] text-[#C0FD9B] flex items-center justify-center font-bold">
                📺
              </div>
              <div>
                <div className="font-semibold text-sm text-[#0E2322]">Entrance Tablet (Kiosk)</div>
                <div className="text-xs text-muted-foreground">Rotating 15s QR code display</div>
              </div>
            </div>
            <ExternalLink className="size-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      {/* Active Device Sessions */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Active Login Sessions</CardTitle>
            <CardDescription className="text-xs">
              Devices currently authenticated to your ChecIN account.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDevices}
            disabled={loadingDevices}
            className="h-8 text-xs"
          >
            <RefreshCw className={`size-3 mr-1 ${loadingDevices ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm"
              >
                <div className="flex items-center gap-3">
                  {d.device_type === "mobile" ? (
                    <Smartphone className="size-5 text-slate-600" />
                  ) : d.device_type === "tablet" ? (
                    <Tablet className="size-5 text-slate-600" />
                  ) : (
                    <Laptop className="size-5 text-slate-600" />
                  )}
                  <div>
                    <div className="font-medium text-[#0E2322] flex items-center gap-2">
                      {d.device_name}
                      {d.device_id === currentDeviceId && (
                        <Badge className="bg-[#E8FCE4] text-[#122300] border-none text-[10px] py-0 px-2">
                          This Device
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last active: {new Date(d.last_active).toLocaleString()}
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevokeDevice(d)}
                  className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8"
                >
                  <Trash2 className="size-3.5 mr-1" /> Revoke
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sign Out Button */}
      <div className="pt-2">
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 font-medium text-xs h-10"
        >
          <LogOut className="size-4 mr-1.5" /> Sign Out of ChecIN
        </Button>
      </div>
    </div>
  );
}
