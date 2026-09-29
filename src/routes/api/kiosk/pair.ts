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

          // Atomic validation and single-use claim
          const pairing = await firestoreAdmin.runTransaction(async (t) => {
            const snap = await t.get(pairingRef);
            if (!snap.exists) {
              throw new Error("INVALID: Invalid pairing code. Please generate a fresh pairing code in Settings.");
            }
            const data = snap.data()!;
            if (data.status !== "pending") {
              throw new Error("USED: This pairing code has already been used.");
            }
            if (new Date(data.expiresAt).getTime() < Date.now()) {
              t.update(pairingRef, { status: "expired" });
              throw new Error("EXPIRED: This pairing code has expired (10-minute limit). Please generate a new one.");
            }

            t.update(pairingRef, {
              status: "used",
              pairedAt: new Date().toISOString(),
            });

            return data;
          });

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

          // Return raw secret to the tablet ONCE
          return Response.json({
            ok: true,
            locationId: pairing.locationId,
            locationName: pairing.locationName,
            orgId: pairing.orgId,
            deviceSecret,
          });
        } catch (err: any) {
          const msg = err?.message || "";
          if (msg.startsWith("INVALID:") || msg.startsWith("USED:") || msg.startsWith("EXPIRED:")) {
            return Response.json({ error: msg.replace(/^[A-Z_]+:\s*/, "") }, { status: 400 });
          }
          console.error("POST /api/kiosk/pair error:", err);
          return Response.json({ error: "Failed to pair tablet" }, { status: 500 });
        }
      },
    },
  },
});
