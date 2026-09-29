import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { timingSafeHashMatch, generateKioskToken } from "@/lib/kiosk-crypto.server";

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

          // Fetch Admin-SDK-only kiosk document
          const kioskDoc = await firestoreAdmin.collection("kiosks").doc(locationId).get();
          if (!kioskDoc.exists) {
            return Response.json({ error: "Kiosk not paired or location revoked" }, { status: 401 });
          }

          const kiosk = kioskDoc.data()!;
          const storedHash = kiosk.kiosk_secret_hash;

          // Verify secret in constant time
          const isValid = timingSafeHashMatch(secret, storedHash);
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

          return Response.json({
            ok: true,
            token,
            timeBucket,
            secondsRemaining,
            locationName: kiosk.locationName || "Main Entrance",
            recentScan,
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
