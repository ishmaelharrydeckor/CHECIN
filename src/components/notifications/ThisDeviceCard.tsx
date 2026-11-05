import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DevicePushCard } from "./DevicePushCard";
import { devicePushStateFrom, type DevicePushState } from "@/lib/notifications";
import {
  authHeaders,
  getExistingPushSubscription,
  getPushPermissionStatus,
  subscribeDeviceToPush,
  unsubscribeDeviceFromPush,
} from "@/lib/push-client";
import { useAuth } from "@/lib/auth";

/**
 * "This device" on the Account page: works out whether this phone or computer is switched on, and
 * does turn on, turn off and "Send me a test". The server works out who is asking from the token.
 */
export function ThisDeviceCard() {
  const { user } = useAuth();
  const [state, setState] = useState<DevicePushState>("off");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const permission = getPushPermissionStatus();
      const subscribed = permission === "granted" ? Boolean(await getExistingPushSubscription()) : false;
      setState(devicePushStateFrom(permission, subscribed));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const turnOn = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await subscribeDeviceToPush({ userId: user?.id ?? "" });
      if (!result.success) setErrorMessage(result.message ?? "We couldn't switch notifications on.");
    } catch {
      setErrorMessage("We couldn't switch notifications on. Please try again.");
    } finally {
      await check();
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const ok = await unsubscribeDeviceFromPush({ userId: user?.id ?? "" });
      if (!ok) setErrorMessage("We couldn't switch notifications off. Please try again.");
    } finally {
      await check();
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST", headers: await authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(data?.error || "The test could not be sent.");
      } else {
        toast.success("Test sent. It should arrive in a few seconds.");
      }
    } catch {
      setErrorMessage("The test could not be sent. Check your connection and try again.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <DevicePushCard
      state={state}
      loading={loading}
      busy={busy}
      testing={testing}
      errorMessage={errorMessage}
      onTurnOn={turnOn}
      onTurnOff={turnOff}
      onSendTest={sendTest}
      onRetry={check}
    />
  );
}
