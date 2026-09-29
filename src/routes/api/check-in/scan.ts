import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { verifyKioskToken } from "@/lib/kiosk-crypto.server";

export const Route = createFileRoute("/api/check-in/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          const caller = await verifyCallerToken(authHeader);

          if (!caller || !caller.uid) {
            return Response.json(
              { error: "Unauthorized: Please sign in with your employee account to scan" },
              { status: 401 },
            );
          }

          if (!caller.orgId) {
            return Response.json(
              { error: "Access Denied: Your account is not associated with an active organization" },
              { status: 403 },
            );
          }

          const body = await request.json();
          const token = (body?.token || "").trim();
          const locationId = (body?.locationId || "").trim();
          const deviceFingerprint = (body?.deviceFingerprint || "").trim();

          if (!token || !locationId) {
            return Response.json({ error: "Missing required token or locationId" }, { status: 400 });
          }

          // 1. Verify location & tenancy
          const kioskDoc = await firestoreAdmin.collection("kiosks").doc(locationId).get();
          if (!kioskDoc.exists) {
            return Response.json(
              { error: "Invalid entrance terminal. Location is not paired or has been revoked." },
              { status: 404 },
            );
          }

          const kiosk = kioskDoc.data()!;

          if (kiosk.orgId !== caller.orgId) {
            return Response.json(
              { error: "Security Violation: This entrance terminal belongs to another organization." },
              { status: 403 },
            );
          }

          // 2. Cryptographically verify the 15-second rotating HMAC token
          const tokenCheck = verifyKioskToken(token, locationId);
          if (!tokenCheck.valid) {
            return Response.json(
              { error: tokenCheck.reason || "Token expired. Please scan the current live QR code on screen." },
              { status: 400 },
            );
          }

          // 3. Prevent Rapid Double-Punch (60-second cooldown per employee)
          // Use single-field query to avoid missing composite index crashes
          const recentEventsSnap = await firestoreAdmin
            .collection("clock_events")
            .where("employeeId", "==", caller.uid)
            .limit(10)
            .get();

          const now = Date.now();
          let lastEvent = null;

          if (!recentEventsSnap.empty) {
            const sortedDocs = recentEventsSnap.docs
              .map((d) => d.data())
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            lastEvent = sortedDocs[0] || null;
            if (lastEvent) {
              const lastTime = new Date(lastEvent.timestamp).getTime();
              if (now - lastTime < 60 * 1000) {
                const secondsLeft = Math.ceil((60 * 1000 - (now - lastTime)) / 1000);
                return Response.json(
                  {
                    error: `Cooldown active: You checked ${lastEvent.type.toUpperCase()} recently. Please wait ${secondsLeft}s to prevent accidental double-clocking.`,
                  },
                  { status: 429 },
                );
              }
            }
          }

          // 4. Determine Direction (IN vs OUT) based on last event today
          // If no event today or last event was 'out' -> next is 'in'
          // If last event was 'in' -> next is 'out'
          const nextType: "in" | "out" = lastEvent && lastEvent.type === "in" ? "out" : "in";

          // 5. Create immutable audit record in clock_events
          const eventRef = firestoreAdmin.collection("clock_events").doc();
          const timestampIso = new Date().toISOString();
          let employeeName = caller.name || caller.email?.split("@")[0] || "Employee";
          let employeeDepartment = "General";

          try {
            const userDoc = await firestoreAdmin.collection("users").doc(caller.uid).get();
            if (userDoc.exists) {
              const udata = userDoc.data();
              if (udata?.displayName) employeeName = udata.displayName;
              if (udata?.department) employeeDepartment = udata.department;
            }
          } catch (e) {
            console.warn("Could not fetch user profile for scan event:", e);
          }

          const eventData = {
            eventId: eventRef.id,
            orgId: caller.orgId,
            managerId: (caller as any).managerId || null,
            employeeId: caller.uid,
            employeeName,
            employeeEmail: caller.email || "",
            department: employeeDepartment,
            type: nextType,
            timestamp: timestampIso,
            locationId,
            locationName: kiosk.locationName || "Main Entrance",
            deviceFingerprint: deviceFingerprint || "browser-client",
            verifiedBy: "kiosk_hmac_sha256",
          };

          await eventRef.set(eventData);

          // 6. Broadcast instantaneous scan confirmation to the kiosk terminal
          const timeDisplay = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          await firestoreAdmin.collection("recent_scans").doc(locationId).set({
            employeeName,
            type: nextType,
            time: timeDisplay,
            timestamp: now,
          });

          return Response.json({
            ok: true,
            eventId: eventRef.id,
            type: nextType,
            timestamp: timestampIso,
            timeDisplay,
            employeeName,
            locationName: eventData.locationName,
          });
        } catch (err: any) {
          console.error("POST /api/check-in/scan error:", err);
          return Response.json({ error: "Failed to record check-in scan" }, { status: 500 });
        }
      },
    },
  },
});
