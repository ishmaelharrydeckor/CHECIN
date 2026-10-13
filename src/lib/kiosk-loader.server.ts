import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import type { LocationHours } from "@/lib/attendance-windows";
import { getCachedKiosk, setCachedKiosk, type KioskCacheEntry } from "@/lib/kiosk-cache.server";
import { isValidChannelId } from "@/lib/kiosk-channel";
import { DEFAULT_SHIFT_SETTINGS, readShiftSettings, type ShiftSettings } from "@/lib/shift-requests";

/**
 * Loads everything the kiosk token route and the scan route need about a kiosk
 * in one go (kiosk doc, location hours, org timezone) and caches it. Returns
 * null if the kiosk is not paired / was revoked. The kiosk document holds the
 * secret HASH and is Admin-SDK only; it never leaves the server.
 */
export async function loadKiosk(locationId: string): Promise<KioskCacheEntry | null> {
  const kioskDoc = await firestoreAdmin.collection("kiosks").doc(locationId).get();
  if (!kioskDoc.exists) return null;
  const kiosk = kioskDoc.data()!;
  // A revoked tablet keeps its document (so admins can see it was revoked) but has no secret.
  if (!kiosk.kiosk_secret_hash) return null;

  let hours: LocationHours = {};
  let timezone = "UTC";
  let greeting = false;
  let shifts: ShiftSettings = { ...DEFAULT_SHIFT_SETTINGS };
  try {
    const [locSnap, orgSnap] = await Promise.all([
      firestoreAdmin.collection("locations").doc(locationId).get(),
      firestoreAdmin.collection("organizations").doc(kiosk.orgId).get(),
    ]);
    // Only trust hours from a location that belongs to the kiosk's own org.
    if (locSnap.exists && locSnap.data()?.orgId === kiosk.orgId) {
      hours = locSnap.data()!;
      greeting = locSnap.data()?.kioskGreeting === true;
    }
    const orgData = orgSnap.data();
    timezone = orgData?.timezone || "UTC";
    shifts = readShiftSettings(orgData);
  } catch (modeErr) {
    console.warn("Could not load location hours for kiosk mode:", modeErr);
  }

  const entry: KioskCacheEntry = {
    loadedAt: Date.now(),
    orgId: kiosk.orgId,
    secretHash: kiosk.kiosk_secret_hash,
    locationName: kiosk.locationName || "Main Entrance",
    hours,
    timezone,
    greeting,
    shifts,
    channelId: isValidChannelId(kiosk.channelId) ? kiosk.channelId : undefined,
    channelRotatedAt: typeof kiosk.channelRotatedAt === "number" ? kiosk.channelRotatedAt : undefined,
  };
  setCachedKiosk(locationId, entry);
  return entry;
}

/** The cached kiosk entry if fresh, otherwise a fresh load. */
export async function getKioskEntry(locationId: string): Promise<KioskCacheEntry | null> {
  return getCachedKiosk(locationId) ?? (await loadKiosk(locationId));
}
