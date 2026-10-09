import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { firebaseAuth, googleProvider } from "@/integrations/firebase/config";
import { linkWithPopup } from "firebase/auth";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Building2,
  Tablet,
  Plus,
  RefreshCw,
  Trash2,
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  Smartphone,
  Laptop,
  Pencil,
} from "lucide-react";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { TimezonePicker } from "@/components/TimezonePicker";
import {
  getUserDevices,
  revokeDevice,
  revokeOtherDevices,
  getDeviceId,
  type UserDevice,
} from "@/lib/device-manager";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Organization Settings & Kiosk Pairing — ChecIN" }] }),
  component: SettingsPage,
});

interface KioskLocation {
  id: string;
  name: string;
  isPaired: boolean;
  pairedAt?: string;
  reportingTime?: string | null;
  closingTime?: string | null;
  checkoutWindowMinutes?: number;
  kioskGreeting?: boolean;
}

function SettingsPage() {
  const { user, orgId, isOrgAdmin, isManager, canManageKiosks, loading } = useAuth();
  const navigate = useNavigate();
  const canAccessSettings = isOrgAdmin || isManager;
  // Work hours: any admin or manager. Pairing and revoking tablets need canManageKiosks.
  const canEditHours = isOrgAdmin || isManager;

  useEffect(() => {
    if (!loading && user && !canAccessSettings) {
      toast.error("Access Denied: Administrator or Manager privileges are required.");
      navigate({ to: "/dashboard" });
    }
  }, [loading, user, canAccessSettings, navigate]);

  const [locations, setLocations] = useState<KioskLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [newLocName, setNewLocName] = useState("");
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [pairingLocationName, setPairingLocationName] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Team members + admin-generated password reset links
  const [members, setMembers] = useState<
    { uid: string; displayName: string; email: string; department?: string }[]
  >([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [resettingUid, setResettingUid] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; email: string; link: string } | null>(
    null,
  );
  const [copiedResetLink, setCopiedResetLink] = useState(false);

  // Which managers may pair and revoke tablets (org admin only)
  const [managerAccess, setManagerAccess] = useState<
    { uid: string; displayName: string; email: string; kioskAdmin: boolean }[]
  >([]);
  const [loadingManagerAccess, setLoadingManagerAccess] = useState(true);
  const [savingAccessUid, setSavingAccessUid] = useState<string | null>(null);

  // Organization Profile State
  const [orgDetails, setOrgDetails] = useState<{
    name: string;
    id: string;
    plan: string;
    timezone: string;
  }>({
    name: "Loading Organization...",
    id: orgId || "Loading...",
    plan: "Growth (14-Day Trial)",
    timezone: "UTC",
  });
  const [editingOrg, setEditingOrg] = useState(false);
  const [orgNameInput, setOrgNameInput] = useState("");
  const [orgTimezoneInput, setOrgTimezoneInput] = useState("UTC");
  const [savingOrg, setSavingOrg] = useState(false);

  // Reporting/closing hours editing (one location at a time)
  const [editingHoursId, setEditingHoursId] = useState<string | null>(null);
  const [hoursDraft, setHoursDraft] = useState({
    reportingTime: "",
    closingTime: "",
    checkoutWindowMinutes: "120",
    kioskGreeting: false,
  });
  const [savingHours, setSavingHours] = useState(false);

  // Device Sessions
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

  const fetchLocations = async () => {
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/locations", {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      const data = await res.json();
      if (data.ok && data.locations) {
        setLocations(data.locations);
      }
    } catch (err) {
      console.error("Error fetching locations:", err);
    } finally {
      setLoadingLocations(false);
    }
  };

  const fetchOrg = async () => {
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/organization", {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      const data = await res.json();
      if (data.ok && data.organization) {
        setOrgDetails(data.organization);
        setOrgNameInput(data.organization.name);
        setOrgTimezoneInput(data.organization.timezone || "UTC");
      }
    } catch (e) {
      console.warn("Could not fetch org details:", e);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchLocations();
    fetchOrg();
  }, [user, orgId]);

  const handleUpdateOrgName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgNameInput.trim() || orgNameInput.trim().length < 2) {
      toast.error("Please enter a valid company name (at least 2 characters)");
      return;
    }
    setSavingOrg(true);
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ name: orgNameInput.trim(), timezone: orgTimezoneInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setOrgDetails((prev) => ({
          ...prev,
          name: orgNameInput.trim(),
          timezone: orgTimezoneInput.trim() || prev.timezone,
        }));
        setEditingOrg(false);
        toast.success("Organization details updated successfully!");
      } else {
        toast.error(data.error || "Failed to update organization");
      }
    } catch {
      toast.error("Error updating organization");
    } finally {
      setSavingOrg(false);
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName.trim()) return;

    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ name: newLocName.trim() }),
      });
      const data = await res.json();
      if (data.ok && data.location) {
        setLocations((prev) => [...prev, data.location]);
        const createdName = newLocName.trim();
        setNewLocName("");
        // Generate pairing code
        await handleGeneratePairingCode(data.location);
        toast.success(`Location "${createdName}" added! Generated pairing code.`);
      } else {
        toast.error(data.error || "Failed to add location");
      }
    } catch (err) {
      toast.error("Error creating location");
    }
  };

  const handleGeneratePairingCode = async (loc: KioskLocation) => {
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/kiosk/pair-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ locationId: loc.id }),
      });
      const data = await res.json();
      if (data.ok && data.code) {
        setGeneratedCode(data.code);
        setPairingLocationName(loc.name);
        setPairingModalOpen(true);
      } else {
        toast.error(data.error || "Failed to generate pairing code");
      }
    } catch (err) {
      toast.error("Error generating pairing code");
    }
  };

  const startEditHours = (loc: KioskLocation) => {
    setHoursDraft({
      reportingTime: loc.reportingTime || "",
      closingTime: loc.closingTime || "",
      checkoutWindowMinutes: String(loc.checkoutWindowMinutes ?? 120),
      kioskGreeting: loc.kioskGreeting === true,
    });
    setEditingHoursId(loc.id);
  };

  const handleSaveHours = async (locId: string) => {
    if (!hoursDraft.reportingTime || !hoursDraft.closingTime) {
      toast.error("Please set both a reporting time and a closing time");
      return;
    }
    setSavingHours(true);
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/locations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          locationId: locId,
          reportingTime: hoursDraft.reportingTime,
          closingTime: hoursDraft.closingTime,
          checkoutWindowMinutes: Number(hoursDraft.checkoutWindowMinutes),
          kioskGreeting: hoursDraft.kioskGreeting,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setLocations((prev) =>
          prev.map((l) =>
            l.id === locId
              ? {
                  ...l,
                  reportingTime: data.reportingTime,
                  closingTime: data.closingTime,
                  checkoutWindowMinutes: data.checkoutWindowMinutes,
                  kioskGreeting: data.kioskGreeting === true,
                }
              : l,
          ),
        );
        setEditingHoursId(null);
        toast.success("Reporting and closing hours saved");
      } else {
        toast.error(data.error || "Failed to save hours");
      }
    } catch {
      toast.error("Error saving hours");
    } finally {
      setSavingHours(false);
    }
  };

  const handleRevokeKiosk = async (locId: string) => {
    if (!confirm("Are you sure you want to revoke this entrance tablet? It will stop issuing valid QR codes.")) return;
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/locations/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ locationId: locId }),
      });
      const data = await res.json();
      if (data.ok) {
        setLocations(
          locations.map((l) => (l.id === locId ? { ...l, isPaired: false, pairedAt: undefined } : l)),
        );
        toast.success("Tablet pairing revoked.");
      } else {
        toast.error(data.error || "Failed to revoke tablet");
      }
    } catch {
      toast.error("Error revoking kiosk");
    }
  };

  const fetchManagerAccess = async () => {
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/kiosk-access", {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.managers)) setManagerAccess(data.managers);
    } catch (err) {
      console.error("Error fetching manager tablet access:", err);
    } finally {
      setLoadingManagerAccess(false);
    }
  };

  useEffect(() => {
    if (user && isOrgAdmin) void fetchManagerAccess();
    else setLoadingManagerAccess(false);
  }, [user, isOrgAdmin]);

  const handleSetAllKioskAccess = async (allowed: boolean) => {
    setSavingAccessUid("all");
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/kiosk-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ all: true, allowed }),
      });
      const data = await res.json();
      if (data.ok) {
        setManagerAccess((prev) => prev.map((m) => ({ ...m, kioskAdmin: allowed })));
        toast.success(
          allowed
            ? "All managers can now manage locations and tablets. They'll be asked to sign in again."
            : "No manager can manage locations and tablets now.",
        );
      } else {
        toast.error(data.error || "Failed to update permissions");
      }
    } catch {
      toast.error("Error updating permissions");
    } finally {
      setSavingAccessUid(null);
    }
  };

  const handleToggleKioskAccess = async (uid: string, allowed: boolean) => {
    setSavingAccessUid(uid);
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/kiosk-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ targetUid: uid, allowed }),
      });
      const data = await res.json();
      if (data.ok) {
        setManagerAccess((prev) => prev.map((m) => (m.uid === uid ? { ...m, kioskAdmin: allowed } : m)));
        toast.success(
          allowed
            ? "Manager can now pair and revoke tablets. They'll be asked to sign in again."
            : "Manager can no longer pair or revoke tablets.",
        );
      } else {
        toast.error(data.error || "Failed to update permission");
      }
    } catch {
      toast.error("Error updating permission");
    } finally {
      setSavingAccessUid(null);
    }
  };

  const fetchMembers = async () => {
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/staff-invites", {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.members)) {
        setMembers(data.members);
      }
    } catch (err) {
      console.error("Error fetching team members:", err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (user && canAccessSettings) void fetchMembers();
  }, [user, canAccessSettings]);

  const handleGenerateResetLink = async (member: { uid: string; displayName: string; email: string }) => {
    setResettingUid(member.uid);
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/reset-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ targetUid: member.uid }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.link) {
        setCopiedResetLink(false);
        setResetResult({ name: member.displayName, email: data.email || member.email, link: data.link });
      } else {
        toast.error(data.error || "Could not generate a reset link");
      }
    } catch {
      toast.error("Error generating reset link");
    } finally {
      setResettingUid(null);
    }
  };

  const copyResetLink = () => {
    if (!resetResult) return;
    navigator.clipboard.writeText(resetResult.link);
    setCopiedResetLink(true);
    setTimeout(() => setCopiedResetLink(false), 2000);
    toast.success("Reset link copied");
  };

  const copyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast.success("Pairing code copied to clipboard");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <RefreshCw className="size-6 animate-spin text-[#0E2322] mb-3" />
        <p className="text-xs font-semibold text-slate-500">Loading settings...</p>
      </div>
    );
  }

  if (!canAccessSettings) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
          <ShieldCheck className="size-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Access Denied</h2>
        <p className="text-xs text-slate-500 mb-5">
          Organization Administrator or Manager privileges are required to access Settings.
        </p>
        <Link
          to="/dashboard"
          className="px-4 py-2 bg-[#0E2322] text-[#C0FD9B] rounded-xl text-xs font-bold hover:opacity-90 transition"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Settings &amp; Physical Kiosks</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure entrance kiosk pairing, physical presence security, and notifications.
        </p>
      </div>

      {/* COMPANY / ORGANIZATION PROFILE */}
      <Card className="border-border/80 shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Building2 className="size-5 text-[#0E2322]" /> Company Profile &amp; Tenancy
              </CardTitle>
              <CardDescription className="text-xs">
                Your registered business identity, subscription plan, and hard multi-tenant boundary.
              </CardDescription>
            </div>
            <Badge className="bg-[#E8FCE4] text-[#122300] border-none text-xs font-medium">
              {orgDetails.plan}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editingOrg ? (
            <form onSubmit={handleUpdateOrgName} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1.5 w-full">
                <Label htmlFor="companyNameInput" className="text-xs font-medium">
                  Registered Business Name
                </Label>
                <Input
                  id="companyNameInput"
                  value={orgNameInput}
                  onChange={(e) => setOrgNameInput(e.target.value)}
                  className="h-10 text-sm font-medium"
                  required
                />
              </div>
              <div className="space-y-1.5 w-full sm:w-80">
                <Label htmlFor="orgTimezoneInput" className="text-xs font-medium">
                  Timezone
                </Label>
                <TimezonePicker
                  id="orgTimezoneInput"
                  value={orgTimezoneInput}
                  onChange={setOrgTimezoneInput}
                  detected={typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={savingOrg}
                  className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs h-10 font-medium"
                >
                  {savingOrg ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingOrg(false)}
                  className="text-xs h-10 border-slate-300"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[#0E2322]">{orgDetails.name}</span>
                  {isOrgAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOrgNameInput(orgDetails.name);
                        setOrgTimezoneInput(orgDetails.timezone);
                        setEditingOrg(true);
                      }}
                      className="h-7 px-2 text-xs text-slate-600 hover:text-[#0E2322] hover:bg-slate-200/60"
                    >
                      <Pencil className="size-3 mr-1" /> Edit Details
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Tenant ID: <code className="font-mono bg-slate-200/70 px-1 py-0.5 rounded text-[11px] text-slate-700">{orgDetails.id}</code></span>
                  <span>Timezone: <span className="font-medium text-slate-700">{orgDetails.timezone}</span></span>
                  <span>Your Role: <span className="font-medium text-slate-700">{isOrgAdmin ? "Organization Administrator" : "Team Manager"}</span></span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KIOSK HARDWARE PAIRING (Mandated by AGENTS.md) */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Tablet className="size-5 text-[#0E2322]" /> Entrance Tablet Kiosks
              </CardTitle>
              <CardDescription className="text-xs">
                Physical entrance tablets prove that scans take place on-premises. Kiosks rotate codes every
                15 seconds using a private device secret.
              </CardDescription>
            </div>
            <Badge className="bg-[#E8FCE4] text-[#122300] border-none text-xs font-medium">
              <ShieldCheck className="size-3 mr-1" /> Hardware Guarded
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Adding locations, pairing and revoking need canManageKiosks (the server enforces this too) */}
          {!canManageKiosks && (
            <p className="text-xs text-muted-foreground rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              Your organization admin decides who can add locations and pair or revoke tablets. You can
              set work hours below.
            </p>
          )}
          {canManageKiosks && (
            <form onSubmit={handleCreateLocation} className="flex gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="locName" className="text-xs font-medium">
                  Add New Entrance Point
                </Label>
                <Input
                  id="locName"
                  placeholder="e.g. North Gate, 4th Floor Reception"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <Button
                type="submit"
                className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs h-10 font-medium"
              >
                <Plus className="size-4 mr-1.5" /> Add Location
              </Button>
            </form>
          )}

          {/* Active Locations Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-muted-foreground uppercase border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">Location</th>
                  <th className="py-3 px-4 font-semibold">Work Hours</th>
                  <th className="py-3 px-4 font-semibold">Hardware Status</th>
                  <th className="py-3 px-4 font-semibold">Paired Date</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingLocations ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                      <RefreshCw className="size-4 animate-spin inline mr-2 text-[#0E2322]" />
                      Loading entrance locations...
                    </td>
                  </tr>
                ) : locations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                      No entrance locations configured yet. Add a location above to pair a tablet kiosk.
                    </td>
                  </tr>
                ) : (
                  locations.map((loc) => (
                    <tr key={loc.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-medium text-[#0E2322]">{loc.name}</td>
                      <td className="py-3 px-4 text-xs">
                        {editingHoursId === loc.id ? (
                          <div className="space-y-2 min-w-[210px]">
                            <div className="flex items-center gap-2">
                              <Label className="w-16 text-[11px] text-muted-foreground">Report</Label>
                              <Input
                                type="time"
                                value={hoursDraft.reportingTime}
                                onChange={(e) => setHoursDraft((d) => ({ ...d, reportingTime: e.target.value }))}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="w-16 text-[11px] text-muted-foreground">Close</Label>
                              <Input
                                type="time"
                                value={hoursDraft.closingTime}
                                onChange={(e) => setHoursDraft((d) => ({ ...d, closingTime: e.target.value }))}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="w-16 text-[11px] text-muted-foreground">Window (min)</Label>
                              <Input
                                type="number"
                                min={15}
                                max={720}
                                value={hoursDraft.checkoutWindowMinutes}
                                onChange={(e) =>
                                  setHoursDraft((d) => ({ ...d, checkoutWindowMinutes: e.target.value }))
                                }
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="flex items-start gap-2">
                              <Switch
                                id={`greeting-${loc.id}`}
                                checked={hoursDraft.kioskGreeting}
                                onCheckedChange={(v) => setHoursDraft((d) => ({ ...d, kioskGreeting: v }))}
                              />
                              <Label htmlFor={`greeting-${loc.id}`} className="text-[11px] leading-snug text-muted-foreground">
                                Show a welcome on the tablet after each scan. Employees already see their result on
                                their phone. Turning this on makes the tablet refresh more often.
                              </Label>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={savingHours}
                                onClick={() => handleSaveHours(loc.id)}
                                className="h-7 text-xs bg-[#0E2322] hover:bg-[#163331] text-white"
                              >
                                {savingHours ? "Saving..." : "Save"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingHoursId(null)}
                                className="h-7 text-xs border-slate-300"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {loc.reportingTime && loc.closingTime ? (
                              <span className="text-slate-700">
                                {loc.reportingTime} – {loc.closingTime}
                                <span className="text-muted-foreground">
                                  {" "}
                                  (+{loc.checkoutWindowMinutes ?? 120}m)
                                </span>
                                {loc.kioskGreeting && <span className="text-muted-foreground"> · Welcome on</span>}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Not set</span>
                            )}
                            {canEditHours && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditHours(loc)}
                                className="h-6 px-1.5 text-slate-600 hover:bg-slate-200/60"
                              >
                                <Pencil className="size-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {loc.isPaired ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#E8FCE4] text-[#122300]">
                            <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            Paired &amp; Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900">
                            Awaiting Tablet Pairing
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        {loc.pairedAt ? new Date(loc.pairedAt).toLocaleDateString() : "Not paired yet"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {loc.isPaired ? (
                          canManageKiosks ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeKiosk(loc.id)}
                              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            >
                              Revoke Secret
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Admin can revoke</span>
                          )
                        ) : canManageKiosks ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGeneratePairingCode(loc)}
                            className="text-xs border-slate-300"
                          >
                            <KeyRound className="size-3 mr-1" /> Pair Tablet
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Admin can pair</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* TABLET PERMISSIONS — org admin decides which managers can pair/revoke tablets */}
      {isOrgAdmin && (
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Tablet className="size-5 text-[#0E2322]" /> Who can manage locations &amp; tablets
              </CardTitle>
              <CardDescription className="text-xs">
                Managers you switch on can add entrance locations, and pair and revoke tablets. Managers
                you leave off can still set work hours. A manager is asked to sign in again when you
                change this.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={savingAccessUid !== null || managerAccess.length === 0}
                onClick={() => handleSetAllKioskAccess(true)}
                className="text-xs bg-[#0E2322] hover:bg-[#163331] text-white"
              >
                {savingAccessUid === "all" ? "Saving..." : "Turn on for all managers"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={savingAccessUid !== null || managerAccess.length === 0}
                onClick={() => handleSetAllKioskAccess(false)}
                className="text-xs border-slate-300"
              >
                Turn off for all
              </Button>
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-muted-foreground uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Manager</th>
                    <th className="py-3 px-4 font-semibold text-right">Can manage locations &amp; tablets</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingManagerAccess ? (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-xs text-muted-foreground">
                        <RefreshCw className="size-4 animate-spin inline mr-2 text-[#0E2322]" />
                        Loading managers...
                      </td>
                    </tr>
                  ) : managerAccess.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-xs text-muted-foreground">
                        No managers yet. Invite a manager from the dashboard.
                      </td>
                    </tr>
                  ) : (
                    managerAccess.map((m) => (
                      <tr key={m.uid} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#0E2322]">{m.displayName}</div>
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Switch
                            aria-label={`Allow ${m.displayName} to manage locations and tablets`}
                            checked={m.kioskAdmin}
                            disabled={savingAccessUid !== null}
                            onCheckedChange={(v) => handleToggleKioskAccess(m.uid, v)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TEAM MEMBERS — admin-generated password reset links */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <KeyRound className="size-5 text-[#0E2322]" /> Team Members &amp; Password Help
            </CardTitle>
            <CardDescription className="text-xs">
              {isOrgAdmin
                ? "If someone is locked out, generate a one-time reset link and send it to them privately."
                : "If someone on your team is locked out, generate a one-time reset link and send it to them privately."}{" "}
              Works even if their email address isn't a real inbox.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-muted-foreground uppercase border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">Name</th>
                  <th className="py-3 px-4 font-semibold">Email</th>
                  <th className="py-3 px-4 font-semibold text-right">Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingMembers ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                      <RefreshCw className="size-4 animate-spin inline mr-2 text-[#0E2322]" />
                      Loading team members...
                    </td>
                  </tr>
                ) : members.filter((m) => m.uid !== user?.id).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                      No other team members yet. Invite people from the dashboard.
                    </td>
                  </tr>
                ) : (
                  members
                    .filter((m) => m.uid !== user?.id)
                    .map((m) => (
                      <tr key={m.uid} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-medium text-[#0E2322]">{m.displayName}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{m.email}</td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resettingUid === m.uid}
                            onClick={() => handleGenerateResetLink(m)}
                            className="text-xs border-slate-300"
                          >
                            {resettingUid === m.uid ? "Generating..." : "Generate reset link"}
                          </Button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* RESET LINK MODAL */}
      {resetResult && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-2xl border-border bg-white rounded-2xl animate-in zoom-in-95">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto size-12 rounded-full bg-[#E8FCE4] text-[#0E2322] flex items-center justify-center mb-2">
                <KeyRound className="size-6" />
              </div>
              <CardTitle className="text-xl font-bold text-[#0E2322]">Password reset link</CardTitle>
              <CardDescription className="text-xs">
                For <span className="font-semibold text-slate-800">{resetResult.name}</span> ({resetResult.email})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-mono break-all text-slate-700 max-h-28 overflow-auto">
                {resetResult.link}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Send this link only to <strong>{resetResult.name}</strong>, in person or in a private message.
                It works once and expires in about an hour. Anyone who has it can set a new password for
                this account, so don't post it in a group chat.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={copyResetLink}
                  className="flex-1 bg-[#0E2322] hover:bg-[#163331] text-white text-xs h-10 font-medium"
                >
                  {copiedResetLink ? (
                    <>
                      <Check className="size-4 mr-1.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-4 mr-1.5" /> Copy link
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetResult(null)}
                  className="text-xs h-10 border-slate-300"
                >
                  Done
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* PAIRING CODE MODAL */}
      {pairingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-2xl border-border bg-white rounded-2xl animate-in zoom-in-95">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto size-12 rounded-full bg-[#E8FCE4] text-[#0E2322] flex items-center justify-center mb-2">
                <Tablet className="size-6 text-[#122300]" />
              </div>
              <CardTitle className="text-xl font-bold">Pair Entrance Tablet</CardTitle>
              <CardDescription className="text-xs">
                Location: <span className="font-semibold text-slate-800">{pairingLocationName}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <p className="text-xs text-center text-muted-foreground">
                On the physical entrance tablet, navigate to <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">/kiosk</code> and enter this single-use code:
              </p>

              <div className="flex items-center justify-center gap-2 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-mono text-3xl font-extrabold tracking-widest text-[#0E2322]">
                  {generatedCode}
                </span>
                <Button variant="ghost" size="sm" onClick={copyCode} className="h-9 px-2">
                  {copiedCode ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                </Button>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-900 border border-amber-200">
                <b>Security Notice:</b> This code expires in 10 minutes. The tablet will exchange it for a hardware secret stored only on the physical device.
              </div>

              <Button
                className="w-full bg-[#0E2322] hover:bg-[#163331] text-white"
                onClick={() => setPairingModalOpen(false)}
              >
                Done
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* PUSH NOTIFICATIONS */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Push Notifications</CardTitle>
          <CardDescription className="text-xs">
            Receive instant push alerts for shift reminders and clock-in confirmations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PushNotificationManager />
        </CardContent>
      </Card>
    </div>
  );
}
