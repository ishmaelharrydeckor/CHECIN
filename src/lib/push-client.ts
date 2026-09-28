// Client-side Web Push Notification Manager
// Kwame Nkrumah University of Science and Technology (KNUST)

export interface PushUserContext {
  userId: string;
  userRole?: string;
  studentId?: string;
  token?: string; // Session token or Firebase Auth ID Token
}

export type PushPermissionStatus =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported"
  | "ios_pwa_required";

export interface PushDeviceDetails {
  platform: string;
  browser: string;
  userAgent: string;
  isStandalone: boolean;
}

/** Check if running on iOS (iPhone / iPad) */
export function isIOS(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isApple = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isApple || isIPadOS;
}

/** Check if the PWA is installed and running in standalone display mode */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true ||
    document.referrer.includes("android-app://")
  );
}

/** Check whether this browser supports Web Push */
export function isPushSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const hasSW = "serviceWorker" in navigator;
  const hasPush = "PushManager" in window;
  const hasNotification = "Notification" in window;
  return hasSW && hasPush && hasNotification;
}

/** Detect device details for audit and multi-device differentiation */
export function getDeviceDetails(): PushDeviceDetails {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { platform: "unknown", browser: "unknown", userAgent: "", isStandalone: false };
  }
  const ua = navigator.userAgent;
  let platform = "desktop";
  if (/Android/i.test(ua)) platform = "android";
  else if (isIOS()) platform = "ios";
  else if (/Macintosh|Mac OS X/i.test(ua)) platform = "macos";
  else if (/Windows/i.test(ua)) platform = "windows";
  else if (/Linux/i.test(ua)) platform = "linux";

  let browser = "other";
  if (/Edg/i.test(ua)) browser = "edge";
  else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = "chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "safari";
  else if (/Firefox/i.test(ua)) browser = "firefox";
  else if (/OPR|Opera/i.test(ua)) browser = "opera";

  return {
    platform,
    browser,
    userAgent: ua,
    isStandalone: isStandalone(),
  };
}

/** Get the current permission status with iOS Home Screen awareness */
export function getPushPermissionStatus(): PushPermissionStatus {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";

  // iOS Safari requires Add to Home Screen before PushManager and Notification are available
  if (isIOS() && !isStandalone()) {
    return "ios_pwa_required";
  }

  if (!isPushSupported()) {
    return "unsupported";
  }

  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "prompt";
}

/** Convert base64 VAPID public key to Uint8Array for PushManager */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Fetch public VAPID key from server */
export async function getVapidPublicKey(): Promise<string> {
  const envKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY;
  if (envKey) return envKey;

  const res = await fetch("/api/push/vapid-key");
  if (!res.ok) {
    throw new Error("Could not load the push notification key from the server.");
  }
  const data = await res.json();
  if (!data.publicKey) {
    throw new Error("Server did not return a push notification key.");
  }
  return data.publicKey;
  // No hardcoded fallback key here on purpose: the previous fallback was a
  // real, currently-active key duplicated from push-service.server.ts,
  // committed to a public repo. If the env var and the server endpoint are
  // both unavailable, subscribing should fail loudly rather than silently
  // using a key that may no longer match the server's rotated private key.
}

/** Register or retrieve the Service Worker registration */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.error("Service Worker registration failed:", err);
    return null;
  }
}

/** Get existing PushSubscription if one already exists in browser */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await registerPushServiceWorker();
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Subscribe device to Web Push and register in Firestore
 */
export async function subscribeDeviceToPush(userContext: PushUserContext): Promise<{
  success: boolean;
  status: PushPermissionStatus;
  message?: string;
  subscription?: PushSubscription;
}> {
  const currentStatus = getPushPermissionStatus();

  if (currentStatus === "ios_pwa_required") {
    return {
      success: false,
      status: "ios_pwa_required",
      message: "On iPhone/iPad, please add KNUST ATTENDANCE APP to your Home Screen first to enable push notifications.",
    };
  }

  if (currentStatus === "unsupported") {
    return {
      success: false,
      status: "unsupported",
      message: "Push notifications are not supported in this browser.",
    };
  }

  // 1. Request user permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      success: false,
      status: permission === "denied" ? "denied" : "prompt",
      message:
        permission === "denied"
          ? "Notification permission is blocked in browser settings. Please allow notifications to receive attendance updates."
          : "Notification permission was dismissed.",
    };
  }

  // 2. Register Service Worker
  const reg = await registerPushServiceWorker();
  if (!reg) {
    return {
      success: false,
      status: "unsupported",
      message: "Failed to initialize service worker.",
    };
  }

  // 3. Create or retrieve PushSubscription from PushManager
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    let publicKey: string;
    try {
      publicKey = await getVapidPublicKey();
    } catch (err: any) {
      return {
        success: false,
        status: "unsupported",
        message: err?.message || "Could not load the push notification key from the server.",
      };
    }
    const appServerKey = urlBase64ToUint8Array(publicKey);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey as unknown as BufferSource,
    });
  }

  // 4. Send subscription securely to server
  const subJSON = sub.toJSON();
  const device = getDeviceDetails();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userContext.token) {
    headers["Authorization"] = `Bearer ${userContext.token}`;
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers,
    body: JSON.stringify({
      subscription: subJSON,
      userContext: {
        userId: userContext.userId,
        userRole: userContext.userRole,
      },
      device,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return {
      success: false,
      status: "granted",
      message: err.error || "Failed to register subscription with server.",
    };
  }

  return {
    success: true,
    status: "granted",
    message: "Notifications enabled successfully!",
    subscription: sub,
  };
}

/**
 * Unsubscribe device from Web Push and notify server
 */
export async function unsubscribeDeviceFromPush(userContext: PushUserContext): Promise<boolean> {
  try {
    const sub = await getExistingPushSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userContext.token) {
        headers["Authorization"] = `Bearer ${userContext.token}`;
      }

      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers,
        body: JSON.stringify({
          endpoint,
          userId: userContext.userId,
        }),
      });
    }
    return true;
  } catch (err) {
    console.error("Failed to unsubscribe:", err);
    return false;
  }
}
