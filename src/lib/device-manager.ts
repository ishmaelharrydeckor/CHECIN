import { firestoreDb } from "@/integrations/firebase/config";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";

export const MAX_DEVICES_PER_ACCOUNT = 6;

export interface UserDevice {
  id: string; // `${userId}_${deviceId}`
  user_id: string;
  device_id: string;
  device_name: string;
  device_type: "desktop" | "mobile" | "tablet";
  browser: string;
  os: string;
  last_active: string;
  created_at: string;
  status: "active" | "revoked";
}

/**
 * Retrieves or generates a persistent device ID for this client browser/device.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server-instance";
  const KEY = "checin_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "dev_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    localStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * Analyzes browser navigator to identify OS, browser, and device type.
 */
export function getDeviceInfo(): {
  name: string;
  type: "desktop" | "mobile" | "tablet";
  browser: string;
  os: string;
} {
  if (typeof window === "undefined") {
    return { name: "Server", type: "desktop", browser: "Unknown", os: "Unknown" };
  }

  const ua = navigator.userAgent;

  // OS detection
  let os = "Unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  // Browser detection
  let browser = "Web Browser";
  if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/OPR|Opera/i.test(ua)) browser = "Opera";

  // Device type
  let type: "desktop" | "mobile" | "tablet" = "desktop";
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    type = "tablet";
  } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/i.test(ua)) {
    type = "mobile";
  }

  const name = `${browser} on ${os}`;
  return { name, type, browser, os };
}

/**
 * Checks and registers this device for the authenticated user.
 * Enforces the MAX_DEVICES_PER_ACCOUNT (4) limit.
 */
export async function registerOrVerifyDevice(userId: string): Promise<{
  allowed: boolean;
  limitReached: boolean;
  currentDeviceId: string;
  activeDevices: UserDevice[];
}> {
  const currentDeviceId = getDeviceId();
  const info = getDeviceInfo();
  const docId = `${userId}_${currentDeviceId}`;

  try {
    const q = query(
      collection(firestoreDb, "user_devices"),
      where("user_id", "==", userId),
      where("status", "==", "active"),
    );
    const snap = await getDocs(q);
    const activeDevices: UserDevice[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    // Check if this device is already in active list
    const existing = activeDevices.find((d) => d.device_id === currentDeviceId);

    if (existing) {
      // Update last active
      const now = new Date().toISOString();
      await updateDoc(doc(firestoreDb, "user_devices", docId), {
        last_active: now,
        device_name: info.name,
      }).catch(() => {});
      return { allowed: true, limitReached: false, currentDeviceId, activeDevices };
    }

    // If account has reached max registered active devices, archive the oldest session
    if (activeDevices.length >= MAX_DEVICES_PER_ACCOUNT) {
      const sorted = [...activeDevices].sort(
        (a, b) => new Date(a.last_active || 0).getTime() - new Date(b.last_active || 0).getTime(),
      );
      const oldest = sorted[0];
      if (oldest) {
        await updateDoc(doc(firestoreDb, "user_devices", oldest.id), {
          status: "revoked",
        }).catch(() => {});
      }
    }

    // Capacity available: register this device
    const now = new Date().toISOString();
    const newDevice: UserDevice = {
      id: docId,
      user_id: userId,
      device_id: currentDeviceId,
      device_name: info.name,
      device_type: info.type,
      browser: info.browser,
      os: info.os,
      last_active: now,
      created_at: now,
      status: "active",
    };

    await setDoc(doc(firestoreDb, "user_devices", docId), newDevice);
    activeDevices.push(newDevice);

    return { allowed: true, limitReached: false, currentDeviceId, activeDevices };
  } catch (err) {
    console.warn("Could not sync device session to Firestore:", err);
    // Allow gracefully so network blips don't block user
    return { allowed: true, limitReached: false, currentDeviceId, activeDevices: [] };
  }
}

/**
 * Fetch all registered devices for a user.
 */
export async function getUserDevices(userId: string): Promise<UserDevice[]> {
  const q = query(collection(firestoreDb, "user_devices"), where("user_id", "==", userId));
  const snap = await getDocs(q);
  const list: UserDevice[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  return list
    .filter((d) => d.status === "active")
    .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime());
}

/**
 * Revokes access for a specific device.
 */
export async function revokeDevice(deviceDocId: string): Promise<void> {
  const ref = doc(firestoreDb, "user_devices", deviceDocId);
  await updateDoc(ref, { status: "revoked" }).catch(async () => {
    await deleteDoc(ref);
  });
}

/**
 * Revokes all other devices for this user except the current device.
 */
export async function revokeOtherDevices(userId: string, keepDeviceId: string): Promise<void> {
  const q = query(
    collection(firestoreDb, "user_devices"),
    where("user_id", "==", userId),
    where("status", "==", "active"),
  );
  const snap = await getDocs(q);
  const promises = snap.docs
    .filter((d) => (d.data() as any).device_id !== keepDeviceId)
    .map((d) => updateDoc(d.ref, { status: "revoked" }));
  await Promise.all(promises);
}

/**
 * Listens in real-time to detect if the current device has been revoked from another session.
 */
export function listenToDeviceStatus(
  userId: string,
  deviceId: string,
  onRevoked: () => void,
): () => void {
  const docId = `${userId}_${deviceId}`;
  const ref = doc(firestoreDb, "user_devices", docId);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.status === "revoked") {
          onRevoked();
        }
      }
    },
    (err) => {
      // Gracefully handle listener errors (network glitches or transitions)
      console.warn("Device status listener notice:", err.message);
    },
  );
}
