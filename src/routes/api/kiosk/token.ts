import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { timingSafeHashMatch, generateKioskToken } from "@/lib/kiosk-crypto.server";
import { getKioskMode, KIOSK_MODE_LABEL, type KioskMode } from "@/lib/attendance-windows";
import { getCachedKiosk, pollIntervalFor, setCachedKiosk } from "@/lib/kiosk-cache.server";
import { ensureChannelId, readChannelNote } from "@/lib/kiosk-channel.server";
import { noteForFallback } from "@/lib/kiosk-channel";
import { loadKiosk } from "@/lib/kiosk-loader.server";

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

          // Live greeting (only where the location has it switched on). The tablet watches its
          // private channel directly, so this route no longer reads anything per poll. The channel
          // address is created on first use, so tablets paired earlier need no re-pairing.
          let channelId = entry.channelId;
          if (entry.greeting && !channelId) {
            try {
              channelId = (await ensureChannelId(locationId)) ?? undefined;
              if (channelId) setCachedKiosk(locationId, { ...entry, channelId });
            } catch (chErr) {
              console.warn("Could not create the greeting channel:", chErr);
            }
          }

          // Fallback: the tablet's live connection is down, so it asks for the latest scan here
          // (one read, only while it is down). It says which scan it last saw, so none is missed.
          const inFallback = entry.greeting && body?.fallback === true && Boolean(channelId);
          let note = null;
          if (inFallback) {
            const since = Number(body?.since);
            note = noteForFallback(await readChannelNote(channelId), Number.isFinite(since) ? since : 0, now);
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
            greeting: entry.greeting,
            // The private address the tablet watches (null when the greeting is off), the server's
            // clock (so the tablet can judge how old a note is), and the org timezone for display.
            channelId: entry.greeting ? (channelId ?? null) : null,
            serverNow: now,
            timezone: entry.timezone,
            note,
            // How soon to ask again: 12 s normally (the QR token must be refreshed in time),
            // 4 s only while the tablet is in fallback and asking for scans.
            pollMs: pollIntervalFor(inFallback),
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
