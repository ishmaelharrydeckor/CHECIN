import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { dayKey, formatClock, nextScanType } from "@/lib/attendance-day";
import { summaryDocId, type DailySummary } from "@/lib/daily-summary";
import { assignmentId, type ShiftAssignment } from "@/lib/shift-engine";
import { readShiftSettings, type ShiftSettings } from "@/lib/shift-requests";
import { assignmentFromDoc, candidateShiftDays, planShiftStatus } from "@/lib/shift-scan";
import { correlationId, logEvent } from "@/lib/log.server";
import { createTtlCache } from "@/lib/ttl-cache.server";

/**
 * Read-only: is the signed-in employee currently clocked in today?
 * Reads today's `daily_summaries` document (one `get`), the same record the scan
 * route uses to pick the direction, so the scan screen's tag can never disagree
 * with what the next scan will do. Identity comes from the verified ID token
 * only; nothing is read from the request.
 */

// Cached for 60s (matching kiosk-cache.server.ts) so timezone and shift settings stay aligned.
const orgMetaCache = createTtlCache<{ timezone: string; shifts: ShiftSettings }>(60_000, 2000);
const SHIFT_ASSIGNMENT_TIMEOUT_MS = 800;

// See scan.ts: only needed for the first day after the summaries are deployed.
const LEGACY_FALLBACK = process.env.SUMMARY_LEGACY_FALLBACK === "1";

export const Route = createFileRoute("/api/check-in/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          if (!caller.orgId) {
            return Response.json({ error: "Access Denied: no active organization" }, { status: 403 });
          }

          let orgMeta = orgMetaCache.get(caller.orgId);
          if (!orgMeta) {
            const orgSnap = await firestoreAdmin.collection("organizations").doc(caller.orgId).get();
            const orgData = orgSnap.data();
            orgMeta = {
              timezone: orgData?.timezone || "UTC",
              shifts: readShiftSettings(orgData),
            };
            orgMetaCache.set(caller.orgId, orgMeta);
          }
          const tz = orgMeta.timezone;
          const now = Date.now();
          const today = dayKey(now, tz) ?? new Date(now).toISOString().slice(0, 10);
          const days = candidateShiftDays(now, tz);

          let fallbackTodaySummary: { loaded: true; summary: DailySummary | null } | null = null;
          if (orgMeta.shifts.shiftsEnabled && process.env.SHIFTS_DISABLED !== "1" && days.length > 0) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              const assignRefs = days.map((day) =>
                firestoreAdmin.collection("shift_assignments").doc(assignmentId(caller.uid, day)),
              );
              const assignSnaps = await Promise.race([
                firestoreAdmin.getAll(...assignRefs),
                new Promise<never>((_, reject) => {
                  timer = setTimeout(
                    () => reject(new Error("SHIFT_ASSIGNMENT_TIMEOUT")),
                    SHIFT_ASSIGNMENT_TIMEOUT_MS,
                  );
                }),
              ]);
              const assignments: ShiftAssignment[] = [];
              for (let i = 0; i < assignSnaps.length; i++) {
                const snap = assignSnaps[i];
                if (!snap || !snap.exists) continue;
                const parsed = assignmentFromDoc(snap.data(), caller.orgId, days[i]);
                if (parsed) assignments.push(parsed);
              }
              if (assignments.length > 0) {
                const summaryRefs = days.map((day) =>
                  firestoreAdmin.collection("daily_summaries").doc(summaryDocId(caller.uid, day)),
                );
                const summarySnaps = await Promise.race([
                  firestoreAdmin.getAll(...summaryRefs),
                  new Promise<never>((_, reject) => {
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(
                      () => reject(new Error("SHIFT_SUMMARY_TIMEOUT")),
                      SHIFT_ASSIGNMENT_TIMEOUT_MS,
                    );
                  }),
                ]);
                const summaries: Record<string, DailySummary | null> = {};
                for (let i = 0; i < days.length; i++) {
                  const s = summarySnaps[i];
                  summaries[days[i]] = s && s.exists ? (s.data() as DailySummary) : null;
                }
                const planned = planShiftStatus({
                  settings: orgMeta.shifts,
                  disabled: process.env.SHIFTS_DISABLED === "1",
                  nowMs: now,
                  timezone: tz,
                  assignments,
                  summaries,
                });
                if (planned.kind === "shift") {
                  const summary = planned.summary;
                  const status: "in" | "out" = summary?.state === "in" ? "in" : "out";
                  const lastTime = summary ? formatClock(summary.lastEventAt, tz) || null : null;
                  return Response.json({ status, lastTime });
                }
                fallbackTodaySummary = { loaded: true, summary: summaries[today] ?? null };
              }
            } catch (shiftErr) {
              // Any error or timeout reading shift data falls back to today's legacy status behaviour.
              fallbackTodaySummary = null;
              logEvent({
                action: "status.shift_fallback",
                outcome: "error",
                correlationId: correlationId(request),
                uid: caller.uid,
                orgId: caller.orgId,
                fields: {
                  reason:
                    shiftErr instanceof Error && /TIMEOUT/.test(shiftErr.message) ? "timeout" : "read_error",
                },
              });
            } finally {
              if (timer) clearTimeout(timer);
            }
          }

          let todaySummary: DailySummary | null = null;
          if (fallbackTodaySummary) {
            todaySummary = fallbackTodaySummary.summary;
          } else {
            const summarySnap = await firestoreAdmin
              .collection("daily_summaries")
              .doc(summaryDocId(caller.uid, today))
              .get();
            todaySummary = summarySnap.exists ? (summarySnap.data() as DailySummary) : null;
          }

          let status: "in" | "out";
          let lastTime: string | null = null; // when the latest scan today was recorded, in the org timezone
          if (todaySummary) {
            status = todaySummary.state === "in" ? "in" : "out";
            lastTime = formatClock(todaySummary.lastEventAt, tz) || null;
          } else if (LEGACY_FALLBACK) {
            const lastSnap = await firestoreAdmin
              .collection("clock_events")
              .where("orgId", "==", caller.orgId)
              .where("employeeId", "==", caller.uid)
              .orderBy("timestamp", "desc")
              .limit(1)
              .get();
            const last = lastSnap.empty ? null : lastSnap.docs[0].data();
            status = nextScanType(last, now, tz) === "out" ? "in" : "out";
            lastTime = last && dayKey(last.timestamp, tz) === today ? formatClock(last.timestamp, tz) || null : null;
          } else {
            status = "out"; // no scan yet today
          }

          return Response.json({ status, lastTime });
        } catch (error: any) {
          console.error("check-in status error:", error);
          return Response.json({ error: "Could not load status" }, { status: 500 });
        }
      },
    },
  },
});
