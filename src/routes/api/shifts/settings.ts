import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { dayKey } from "@/lib/attendance-day";
import { parseSettingsInput, readShiftSettings } from "@/lib/shift-requests";
import { gateFeature } from "@/lib/plan-gate.server";

export const Route = createFileRoute("/api/shifts/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (
            caller.role !== "org_admin" &&
            caller.role !== "manager" &&
            caller.role !== "employee"
          ) {
            return Response.json(
              { error: "You do not have access to this organization." },
              { status: 403 },
            );
          }

          const orgSnap = await firestoreAdmin.collection("organizations").doc(orgId).get();
          const settings = readShiftSettings(orgSnap.exists ? orgSnap.data() : undefined);

          // The organization's own "today", so the rota screens never rely on the device's clock.
          const rawTz = orgSnap.exists ? orgSnap.data()?.timezone : undefined;
          const timezone = typeof rawTz === "string" && rawTz.trim().length > 0 ? rawTz.trim() : "UTC";
          const today = dayKey(Date.now(), timezone) ?? new Date().toISOString().slice(0, 10);

          return Response.json({ ok: true, ...settings, settings, timezone, today });
        } catch (err) {
          console.error("GET /api/shifts/settings error:", err);
          return Response.json({ error: "Could not load shift settings." }, { status: 500 });
        }
      },

      PUT: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (caller.role !== "org_admin") {
            return Response.json(
              { error: "Only an organization admin can change shift settings." },
              { status: 403 },
            );
          }

          const rate = await checkRateLimit(`shifts_settings_${caller.uid}`, {
            limit: 60,
            windowMs: 60 * 60 * 1000,
          });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
              { status: 429 },
            );
          }

          const body = await request.json().catch(() => null);
          const parsed = parseSettingsInput(body);
          if (!parsed.ok) {
            return Response.json({ error: parsed.error }, { status: 400 });
          }

          // Turning a paid feature ON needs the plan that includes it. Turning one off is always allowed.
          if (parsed.value.shiftsEnabled === true) {
            const blocked = await gateFeature(orgId, "shifts", { uid: caller.uid, request });
            if (blocked) return blocked;
          }
          if (parsed.value.breaksEnabled === true) {
            const blocked = await gateFeature(orgId, "breaks", { uid: caller.uid, request });
            if (blocked) return blocked;
          }

          const orgRef = firestoreAdmin.collection("organizations").doc(orgId);
          await orgRef.set(
            {
              ...parsed.value,
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );

          const updatedSnap = await orgRef.get();
          const settings = readShiftSettings(updatedSnap.exists ? updatedSnap.data() : parsed.value);

          logEvent({
            action: "shift.settings",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { ...parsed.value },
          });

          return Response.json({ ok: true, ...settings, settings });
        } catch (err) {
          console.error("PUT /api/shifts/settings error:", err);
          return Response.json({ error: "Could not save shift settings." }, { status: 500 });
        }
      },
    },
  },
});
