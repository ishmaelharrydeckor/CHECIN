import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { resolveCallerIdentity } from "@/lib/caller-identity.server";

/**
 * Notification preferences (which categories a person wants pushed).
 *
 * Previously took `userId` straight from the query string / body with no
 * verification — anyone could read or silently rewrite another person's
 * preferences (e.g. turning off someone else's attendance alerts). Identity
 * now always comes from a verified student session token or Firebase ID
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
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        const identity = await resolveCallerIdentity(request);
        if (!identity) {
          return Response.json({ error: "Not authenticated" }, { status: 401 });
        }

        try {
          const body = await request.json();
          const { preferences } = body;

          const toSave = {
            ...preferences,
            userId: identity.userId,
            updatedAt: new Date().toISOString(),
          };

          await firestoreAdmin
            .collection("notification_preferences")
            .doc(identity.userId)
            .set(toSave, { merge: true });

          return Response.json({ success: true, preferences: toSave });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },
  },
});
