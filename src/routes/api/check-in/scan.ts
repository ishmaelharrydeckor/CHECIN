import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { verifyKioskToken } from "@/lib/kiosk-crypto.server";
import { getKioskEntry } from "@/lib/kiosk-loader.server";
import { computeScanFlags } from "@/lib/attendance-windows";
import { dayKey, formatClock } from "@/lib/attendance-day";
import {
  applyEventToSummary,
  cooldownFromSummary,
  nextTypeFromSummary,
  summaryDocId,
  summaryFromEvents,
  type DailySummary,
  type SummaryEvent,
} from "@/lib/daily-summary";
import { correlationId, logEvent } from "@/lib/log.server";
import { createTtlCache } from "@/lib/ttl-cache.server";

/**
 * Check-in / check-out.
 *
 * Cost per scan after the summaries work (docs/SCALE-PLAN.md, P2): the kiosk
 * record and the person's display name come from short per-instance caches, so
 * the only Firestore read is today's `daily_summaries` document (one `get`, no
 * query, no index). One transaction then writes the immutable `clock_events`
 * record, the updated summary and the kiosk greeting.
 *
 * Retried requests: the phone sends a `scanId`; the event document id is
 * `{uid}_{scanId}` and is created with `create`, so the same request sent twice
 * records once and the second call gets the original result back.
 */

const SCAN_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

// Display name and department change rarely; a few minutes of staleness is fine.
const profileCache = createTtlCache<{ name: string; department: string }>(5 * 60_000, 5000);

/**
 * While rolling out, days that already have events but no summary document would
 * make the first scan after deploy pick the wrong direction. Set
 * SUMMARY_LEGACY_FALLBACK=1 for the first day after deploy (or run
 * scripts/backfill-summaries.mjs instead) and then remove it.
 */
const LEGACY_FALLBACK = process.env.SUMMARY_LEGACY_FALLBACK === "1";

function isAlreadyExists(err: any): boolean {
  return err?.code === 6 || /ALREADY_EXISTS/.test(String(err?.message || ""));
}

export const Route = createFileRoute("/api/check-in/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cid = correlationId(request);
        let scanActor: { uid?: string; orgId?: string | null } = {};
        let requestScanId = "";
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

          scanActor = { uid: caller.uid, orgId: caller.orgId };
          const body = await request.json();
          const token = (body?.token || "").trim();
          const locationId = (body?.locationId || "").trim();
          const deviceFingerprint = (body?.deviceFingerprint || "").trim();
          const rawScanId = typeof body?.scanId === "string" ? body.scanId.trim() : "";

          if (!token || !locationId) {
            return Response.json({ error: "Missing required token or locationId" }, { status: 400 });
          }
          if (rawScanId && !SCAN_ID_PATTERN.test(rawScanId)) {
            return Response.json({ error: "Invalid scanId" }, { status: 400 });
          }
          // Older clients send no scanId: they still work, they just are not retry-safe.
          const scanId = rawScanId || crypto.randomUUID();
          requestScanId = rawScanId;

          // 1. Verify location & tenancy (cached for a short time; see kiosk-cache.server.ts)
          const kiosk = await getKioskEntry(locationId);
          if (!kiosk) {
            return Response.json(
              { error: "Invalid entrance terminal. Location is not paired or has been revoked." },
              { status: 404 },
            );
          }

          if (kiosk.orgId !== caller.orgId) {
            return Response.json(
              { error: "Security Violation: This entrance terminal belongs to another organization." },
              { status: 403 },
            );
          }

          // 2. Cryptographically verify the rotating HMAC token
          const tokenCheck = verifyKioskToken(token, locationId);
          if (!tokenCheck.valid) {
            return Response.json(
              { error: tokenCheck.reason || "Token expired. Please scan the current live QR code on screen." },
              { status: 400 },
            );
          }

          // 3. Display name for the record (cached)
          let profile = profileCache.get(caller.uid);
          if (!profile) {
            profile = {
              name: caller.name || caller.email?.split("@")[0] || "Employee",
              department: "General",
            };
            try {
              const userDoc = await firestoreAdmin.collection("users").doc(caller.uid).get();
              if (userDoc.exists) {
                const udata = userDoc.data();
                if (udata?.displayName) profile.name = udata.displayName;
                if (udata?.department) profile.department = udata.department;
              }
              profileCache.set(caller.uid, profile);
            } catch (e) {
              console.warn("Could not fetch user profile for scan event:", e);
            }
          }
          const employeeName = profile.name;
          const employeeDepartment = profile.department;

          // 4. One transaction: cooldown, direction, event, summary, kiosk greeting.
          const orgTimezone = kiosk.timezone;
          const now = Date.now();
          const nowIso = new Date(now).toISOString();
          const today = dayKey(now, orgTimezone) ?? nowIso.slice(0, 10);
          const managerId = (caller as any).managerId || null;

          const eventRef = firestoreAdmin.collection("clock_events").doc(`${caller.uid}_${scanId}`);
          const summaryRef = firestoreAdmin
            .collection("daily_summaries")
            .doc(summaryDocId(caller.uid, today));
          const identity = {
            orgId: caller.orgId,
            managerId,
            employeeId: caller.uid,
            employeeName,
            dayKey: today,
          };

          const scanResult = await firestoreAdmin.runTransaction(async (t) => {
            const summarySnap = await t.get(summaryRef);
            let prev: DailySummary | null = summarySnap.exists ? (summarySnap.data() as DailySummary) : null;

            if (!prev && LEGACY_FALLBACK) {
              const recent = await t.get(
                firestoreAdmin
                  .collection("clock_events")
                  .where("orgId", "==", caller.orgId)
                  .where("employeeId", "==", caller.uid)
                  .orderBy("timestamp", "desc")
                  .limit(20),
              );
              const todays: SummaryEvent[] = [];
              for (const d of recent.docs) {
                const e = d.data();
                if ((e.dayKey ?? dayKey(e.timestamp, orgTimezone)) === today) {
                  todays.push({
                    type: e.type === "out" ? "out" : "in",
                    timestamp: e.timestamp,
                    late: e.late === true,
                    earlyDeparture: e.earlyDeparture === true,
                  });
                }
              }
              prev = summaryFromEvents(todays, identity, nowIso);
            }

            const secondsLeft = cooldownFromSummary(prev, now);
            if (secondsLeft > 0) {
              throw new Error(`COOLDOWN:${secondsLeft}:${String(prev?.lastEventType ?? "").toUpperCase()}`);
            }

            // Direction is based on today's summary (org timezone): a forgotten
            // check-out yesterday must not turn today's first scan into an "out".
            const nextType = nextTypeFromSummary(prev);
            const flags = computeScanFlags(nextType, kiosk.hours, new Date(now), orgTimezone);
            const timeDisplay = formatClock(now, orgTimezone);

            const eventData = {
              eventId: eventRef.id,
              orgId: caller.orgId,
              managerId,
              employeeId: caller.uid,
              employeeName,
              employeeEmail: caller.email || "",
              department: employeeDepartment,
              type: nextType,
              late: flags.late,
              earlyDeparture: flags.earlyDeparture,
              timestamp: nowIso,
              dayKey: today,
              locationId,
              locationName: kiosk.locationName,
              deviceFingerprint: deviceFingerprint || "browser-client",
              verifiedBy: "kiosk_hmac_sha256",
              schemaVersion: 1,
            };

            const next = applyEventToSummary(
              prev,
              { type: nextType, timestamp: nowIso, late: flags.late, earlyDeparture: flags.earlyDeparture },
              identity,
              nowIso,
            );

            t.create(eventRef, eventData); // fails with ALREADY_EXISTS if this scanId was used
            t.set(summaryRef, next);

            // Scan confirmation for the kiosk terminal's greeting
            t.set(firestoreAdmin.collection("recent_scans").doc(locationId), {
              employeeName,
              type: nextType,
              time: timeDisplay,
              timestamp: now,
            });

            return {
              eventId: eventRef.id,
              type: nextType,
              late: flags.late,
              earlyDeparture: flags.earlyDeparture,
              timestamp: nowIso,
              timeDisplay,
              employeeName,
              locationName: eventData.locationName,
              replayed: false,
            };
          });

          logEvent({
            action: "scan.record",
            outcome: "ok",
            correlationId: cid,
            ...scanActor,
            fields: { type: scanResult.type, late: scanResult.late, locationId },
          });

          return Response.json({ ok: true, ...scanResult });
        } catch (err: any) {
          // A retry of a request that already succeeded: answer with the original result.
          const isCooldown = err?.message?.startsWith("COOLDOWN:");
          if (isCooldown || isAlreadyExists(err)) {
            const replay = await replayOf(scanActor, requestScanId);
            if (replay) {
              logEvent({ action: "scan.record", outcome: "ok", correlationId: cid, ...scanActor, fields: { replayed: true } });
              return Response.json({ ok: true, ...replay });
            }
            if (isAlreadyExists(err)) {
              return Response.json({ error: "This scan could not be recorded. Please scan again." }, { status: 409 });
            }
          }
          if (isCooldown) {
            const [, secondsLeft, lastType] = err.message.split(":");
            logEvent({ action: "scan.record", outcome: "denied", correlationId: cid, ...scanActor, fields: { reason: "cooldown" } });
            return Response.json(
              {
                error: `Cooldown active: You checked ${lastType} recently. Please wait ${secondsLeft}s to prevent accidental double-clocking.`,
              },
              { status: 429 },
            );
          }
          logEvent({ action: "scan.record", outcome: "error", correlationId: cid, ...scanActor });
          console.error("POST /api/check-in/scan error:", err);
          return Response.json({ error: "Failed to record check-in scan" }, { status: 500 });
        }
      },
    },
  },
});

/**
 * If the request carries a scanId whose event already exists for THIS caller,
 * rebuild the original response from the stored event (a safe retry). Returns
 * null when there is no such event.
 */
async function replayOf(
  actor: { uid?: string; orgId?: string | null },
  scanId: string,
): Promise<Record<string, unknown> | null> {
  try {
    if (!actor.uid || !actor.orgId) return null;
    if (!SCAN_ID_PATTERN.test(scanId)) return null;
    const snap = await firestoreAdmin.collection("clock_events").doc(`${actor.uid}_${scanId}`).get();
    if (!snap.exists) return null;
    const e = snap.data()!;
    if (e.employeeId !== actor.uid || e.orgId !== actor.orgId) return null;
    const kiosk = await getKioskEntry(String(e.locationId));
    return {
      eventId: snap.id,
      type: e.type,
      late: e.late === true,
      earlyDeparture: e.earlyDeparture === true,
      timestamp: e.timestamp,
      timeDisplay: formatClock(e.timestamp, kiosk?.timezone ?? "UTC"),
      employeeName: e.employeeName,
      locationName: e.locationName,
      replayed: true,
    };
  } catch {
    return null;
  }
}
