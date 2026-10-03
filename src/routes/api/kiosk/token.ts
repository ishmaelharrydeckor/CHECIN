import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { timingSafeHashMatch, generateKioskToken } from "@/lib/kiosk-crypto.server";
import {
  getKioskMode,
  KIOSK_MODE_LABEL,
  type KioskMode,
  type LocationHours,
} from "@/lib/attendance-windows";
import {
  getCachedKiosk,
  setCachedKiosk,
  pollIntervalFor,
  type KioskCacheEntry,
} from "@/lib/kiosk-cache.server";

/**
 * Loads everything the token route needs about a kiosk in one go (kiosk doc,
 * location hours, org timezone) and caches it. Returns null if the kiosk is
 * not paired / was revoked. The kiosk document holds the secret HASH and is
 * Admin-SDK only; it never leaves the server.
 */
async function loadKiosk(locationId: string): Promise<KioskCacheEntry | null> {
  const kioskDoc = await firestoreAdmin.collection("kiosks").doc(locationId).get();
  if (!kioskDoc.exists) return null;
  const kiosk = kioskDoc.data()!;

  let hours: LocationHours = {};
  let timezone = "UTC";
  try {
    const [locSnap, orgSnap] = await Promise.all([
      firestoreAdmin.collection("locations").doc(locationId).get(),
      firestoreAdmin.collection("organizations").doc(kiosk.orgId).get(),
    ]);
    // Only trust hours from a location that belongs to the kiosk's own org.
    if (locSnap.exists && locSnap.data()?.orgId === kiosk.orgId) hours = locSnap.data()!;
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
  };
  setCachedKiosk(locationId, entry);
  return entry;
}

export const Route = createFileRoute("/api/kiosk/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const secret = request.headers.get("x-kiosk-secret");
          if (!secret) {
            return Response.json({ error: "Missing x-kiosk-secret header" }, { status: 401 });
          }

          const body = await request.json();
          const locationId = (body?.locationId || "").trim();

          if (!locationId) {
            return Response.json({ error: "Missing locationId" }, { status: 400 });
          }

          // Kiosk record (secret hash, org, location hours, timezone): cached for a
          // short TTL so a poll no longer costs 3 extra reads. See kiosk-cache.server.ts.
          let entry = getCachedKiosk(locationId);
          const fromCache = entry !== null;
          if (!entry) entry = await loadKiosk(locationId);
          if (!entry) {
            return Response.json({ error: "Kiosk not paired or location revoked" }, { status: 401 });
          }

          // Verify secret in constant time on EVERY request, cached or not.
          let isValid = timingSafeHashMatch(secret, entry.secretHash);
          if (!isValid && fromCache) {
            // The kiosk may have been re-paired since we cached it: reload once.
            entry = await loadKiosk(locationId);
            if (!entry) {
              return Response.json({ error: "Kiosk not paired or location revoked" }, { status: 401 });
            }
            isValid = timingSafeHashMatch(secret, entry.secretHash);
          }
          if (!isValid) {
            return Response.json({ error: "Invalid kiosk device secret" }, { status: 401 });
          }

          const now = Date.now();
          const timeBucket = Math.floor(now / 15000);
          const secondsRemaining = 15 - Math.floor((now % 15000) / 1000);

          // Mint fresh rotating HMAC token
          const token = generateKioskToken(locationId, timeBucket);

          // Check if there is an active scan notification for this kiosk (within last 12 seconds)
          let recentScan = null;
          try {
            const scanSnap = await firestoreAdmin.collection("recent_scans").doc(locationId).get();
            if (scanSnap.exists) {
              const scanData = scanSnap.data()!;
              const scanTs = Number(scanData.timestamp) || 0;
              if (now - scanTs < 12000) {
                recentScan = {
                  employeeName: scanData.employeeName,
                  type: scanData.type, // "in" | "out"
                  time: scanData.time,
                  timestamp: scanTs,
                };
              }
            }
          } catch (scanErr) {
            console.warn("Could not check recent_scans for kiosk:", scanErr);
          }

          // Display label from the location's hours in the ORG's timezone (server clock only).
          // Cosmetic: never affects whether a scan succeeds or its direction.
          let mode: KioskMode = "idle";
          try {
            mode = getKioskMode(entry.hours, new Date(now), entry.timezone);
          } catch (modeErr) {
            console.warn("Could not compute kiosk mode:", modeErr);
          }

          return Response.json({
            ok: true,
            token,
            timeBucket,
            secondsRemaining,
            mode,
            label: KIOSK_MODE_LABEL[mode],
            locationName: entry.locationName,
            recentScan,
            // How soon to ask again. Fast around reporting/closing time (greeting),
            // never slower than 12 s (the QR token must be refreshed in time).
            pollMs: pollIntervalFor(mode),
          });
        } catch (err: any) {
          console.error("POST /api/kiosk/token error:", err);
          return Response.json(
            { error: "Failed to mint kiosk token", detail: err?.message || "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
