import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { resolveCallerIdentity } from "@/lib/caller-identity.server";
import { sanitizePreferences } from "@/lib/notification-preferences";

/**
 * Notification preferences (which categories a person wants pushed).
 *
 * Previously took `userId` straight from the query string / body with no
 * verification — anyone could read or silently rewrite another person's
 * preferences (e.g. turning off someone else's attendance alerts). Identity
 * now always comes from a verified employee session token or Firebase ID
 * token.
 */
export const Route = createFileRoute("/api/push/preferences")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const identity = await resolveCallerIdentity(request);
        if (!identity) {
          return Response.json({ error: "Not authenticated" }, { status: 401 });
        }

        try {
          const snap = await firestoreAdmin
            .collection("notification_preferences")
            .doc(identity.userId)
            .get();
          const defaults = {
            pushEnabled: true,
            attendance: true,
            announcements: true,
            assignments: true,
            deadlines: true,
            system: true,
          };
          const pref = snap.exists ? (snap.data() as any) : null;
          return Response.json({ preferences: pref ? { ...defaults, ...pref } : defaults });
        } catch (err) {
          console.error("GET /api/push/preferences error:", err);
          return Response.json({ error: "We couldn't load your notification settings." }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        const identity = await resolveCallerIdentity(request);
        if (!identity) {
          return Response.json({ error: "Not authenticated" }, { status: 401 });
        }

        try {
          // Only the known on/off switches are kept; anything else in the request is dropped.
          const body = await request.json().catch(() => null);
          const parsed = sanitizePreferences(body?.preferences);
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

          const toSave = {
            ...parsed.value,
            userId: identity.userId,
            updatedAt: new Date().toISOString(),
          };

          await firestoreAdmin
            .collection("notification_preferences")
            .doc(identity.userId)
            .set(toSave, { merge: true });

          return Response.json({ success: true, preferences: toSave });
        } catch (err) {
          console.error("POST /api/push/preferences error:", err);
          return Response.json({ error: "We couldn't save your notification settings." }, { status: 500 });
        }
      },
    },
  },
});
