import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit.server";
import { hashDeviceSecret } from "@/lib/kiosk-crypto.server";

export const Route = createFileRoute("/api/kiosk/pair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Rate-limit by client IP to prevent brute-forcing pairing codes
          const ip = clientIpFrom(request);
          const rate = await checkRateLimit(`kiosk_pair_${ip}`, {
            limit: 6,
            windowMs: 10 * 60 * 1000,
          });

          if (!rate.allowed) {
            return Response.json(
              { error: `Too many pairing attempts. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const body = await request.json();
          let code = (body?.code || "").trim().toUpperCase();

          if (!code.startsWith("CHK-")) {
            code = `CHK-${code}`;
          }

          const pairingRef = firestoreAdmin.collection("kiosk_pairings").doc(code);
          const pairingSnap = await pairingRef.get();

          if (!pairingSnap.exists) {
            return Response.json({ error: "Invalid pairing code. Please generate a fresh pairing code in Settings." }, { status: 400 });
          }

          const pairing = pairingSnap.data()!;

          if (pairing.status !== "pending") {
            return Response.json({ error: "This pairing code has already been used." }, { status: 400 });
          }

          if (new Date(pairing.expiresAt).getTime() < Date.now()) {
            return Response.json({ error: "This pairing code has expired (10-minute limit). Please generate a new one." }, { status: 400 });
          }

          // Generate 32-byte cryptographically secure random device secret
          const deviceSecret = crypto.randomBytes(32).toString("hex");
          const secretHash = hashDeviceSecret(deviceSecret);

          // Store hash in Admin-SDK-only `kiosks/{locationId}` collection (AGENTS.md Non-negotiable security principle #5)
          await firestoreAdmin.collection("kiosks").doc(pairing.locationId).set({
            orgId: pairing.orgId,
            locationId: pairing.locationId,
            locationName: pairing.locationName,
            kiosk_secret_hash: secretHash,
            kiosk_paired_at: new Date().toISOString(),
          });

          // Mark pairing code as used
          await pairingRef.update({
            status: "used",
            pairedAt: new Date().toISOString(),
          });

          // Return raw secret to the tablet ONCE
          return Response.json({
            ok: true,
            locationId: pairing.locationId,
            locationName: pairing.locationName,
            orgId: pairing.orgId,
            deviceSecret,
          });
        } catch (err: any) {
          console.error("POST /api/kiosk/pair error:", err);
          return Response.json({ error: "Failed to pair tablet" }, { status: 500 });
        }
      },
    },
  },
});
