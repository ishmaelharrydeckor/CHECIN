import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import type { LocationHours } from "@/lib/attendance-windows";
import { getCachedKiosk, setCachedKiosk, type KioskCacheEntry } from "@/lib/kiosk-cache.server";

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

  let hours: LocationHours = {};
  let timezone = "UTC";
  let greeting = false;
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
    timezone = orgSnap.data()?.timezone || "UTC";
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
  };
  setCachedKiosk(locationId, entry);
  return entry;
}

/** The cached kiosk entry if fresh, otherwise a fresh load. */
export async function getKioskEntry(locationId: string): Promise<KioskCacheEntry | null> {
  return getCachedKiosk(locationId) ?? (await loadKiosk(locationId));
}
