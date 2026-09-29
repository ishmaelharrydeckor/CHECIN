import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { firebaseAuth, googleProvider } from "@/integrations/firebase/config";
import { linkWithPopup } from "firebase/auth";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
}

const INITIAL_LOCATIONS: KioskLocation[] = [
  {
    id: "loc-01",
    name: "Main Lobby Entrance",
    isPaired: true,
    pairedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
  },
  {
    id: "loc-02",
    name: "South Gate Entrance",
    isPaired: true,
    pairedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
];

function SettingsPage() {
  const { user, orgId, isOrgAdmin } = useAuth();
  const isDemo = false;
  const canManageKiosks = isOrgAdmin;

  const [locations, setLocations] = useState<KioskLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [newLocName, setNewLocName] = useState("");
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [pairingLocationName, setPairingLocationName] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

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
  const [savingOrg, setSavingOrg] = useState(false);

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
        body: JSON.stringify({ name: orgNameInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setOrgDetails((prev) => ({ ...prev, name: orgNameInput.trim() }));
        setEditingOrg(false);
        toast.success("Organization name updated successfully!");
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

  const copyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast.success("Pairing code copied to clipboard");
  };

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
                  {(isOrgAdmin || isDemo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOrgNameInput(orgDetails.name);
                        setEditingOrg(true);
                      }}
                      className="h-7 px-2 text-xs text-slate-600 hover:text-[#0E2322] hover:bg-slate-200/60"
                    >
                      <Pencil className="size-3 mr-1" /> Edit Name
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
          {/* Add Location Form */}
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
                  <th className="py-3 px-4 font-semibold">Hardware Status</th>
                  <th className="py-3 px-4 font-semibold">Paired Date</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {locations.map((loc) => (
                  <tr key={loc.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-medium text-[#0E2322]">{loc.name}</td>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeKiosk(loc.id)}
                          className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        >
                          Revoke Secret
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGeneratePairingCode(loc)}
                          className="text-xs border-slate-300"
                        >
                          <KeyRound className="size-3 mr-1" /> Pair Tablet
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
