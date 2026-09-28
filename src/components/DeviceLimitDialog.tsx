import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Laptop,
  Smartphone,
  Tablet,
  Trash2,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import {
  revokeDevice,
  registerOrVerifyDevice,
  type UserDevice,
  MAX_DEVICES_PER_ACCOUNT,
} from "@/lib/device-manager";
import { firebaseAuth } from "@/integrations/firebase/config";
import { toast } from "sonner";

interface DeviceLimitDialogProps {
  open: boolean;
  userId: string;
  devices: UserDevice[];
  onResolved: () => void;
}

export function DeviceLimitDialog({
  open,
  userId,
  devices,
  onResolved,
}: DeviceLimitDialogProps) {
  const [deviceList, setDeviceList] = useState<UserDevice[]>(devices);
  const [revoking, setRevoking] = useState<string | null>(null);

  const handleRevoke = async (device: UserDevice) => {
    setRevoking(device.id);
    try {
      await revokeDevice(device.id);
      toast.success(`Removed ${device.device_name}`);
      // Try registering again
      const result = await registerOrVerifyDevice(userId);
      if (result.allowed) {
        toast.success("This device is now registered and active!");
        onResolved();
      } else {
        setDeviceList(result.activeDevices);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove device");
    } finally {
      setRevoking(null);
    }
  };

  const handleSignOut = async () => {
    await firebaseAuth.signOut();
    window.location.href = "/auth";
  };

  const getDeviceIcon = (type: string) => {
    if (type === "mobile")
      return <Smartphone className="size-5 text-primary shrink-0" />;
    if (type === "tablet")
      return <Tablet className="size-5 text-primary shrink-0" />;
    return <Laptop className="size-5 text-primary shrink-0" />;
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto size-12 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 grid place-items-center mb-2">
            <ShieldAlert className="size-6" />
          </div>
          <DialogTitle className="text-center text-lg font-bold">
            Device Limit Reached (Max {MAX_DEVICES_PER_ACCOUNT})
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-muted-foreground">
            Your ChecIN account is currently signed in on {deviceList.length}{" "}
            devices (the maximum allowed). Please remove an old device below to
            continue on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 my-2 max-h-64 overflow-y-auto pr-1">
          {deviceList.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between p-3 rounded-xl border bg-muted/40 text-sm gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {getDeviceIcon(d.device_type)}
                <div className="min-w-0">
                  <div className="font-semibold truncate text-xs sm:text-sm">
                    {d.device_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    Last active: {new Date(d.last_active).toLocaleString()}
                  </div>
                </div>
              </div>

              <Button
                variant="destructive"
                size="sm"
                className="shrink-0 h-8 px-2.5 text-xs"
                disabled={revoking === d.id}
                onClick={() => void handleRevoke(d)}
              >
                <Trash2 className="size-3.5 mr-1" />
                {revoking === d.id ? "Removing..." : "Remove"}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t">
          <Button
            variant="outline"
            className="w-full text-xs"
            onClick={handleSignOut}
          >
            <LogOut className="size-3.5 mr-1.5" /> Sign Out Instead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
