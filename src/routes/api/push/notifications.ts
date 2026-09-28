import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { resolveCallerIdentity } from "@/lib/caller-identity.server";

/**
 * In-app notification history.
 *
 * Previously took `userId`/`altId` straight from the query string (GET) or
 * request body (POST), with no verification — anyone could read another
 * person's notification history (grades, deadlines, admin alerts, whatever
 * gets pushed to that id) or mark an arbitrary notification as read just by
 * knowing or guessing its id. Identity now always comes from a verified
 * student session token or Firebase ID token, never from the request.
 */

const BROADCAST_MARKERS = ["all", "students", "broadcast_student"];

/** For a student, notifications may be filed under either their index
 * number or their Firestore student doc id (a course-targeted send resolves
 * both — see push-service.server.ts). Resolve the doc id server-side rather
 * than trusting a client-supplied altId. */
async function resolveQueryIds(identity: { userId: string; role: string }): Promise<string[]> {
  const ids = new Set<string>([identity.userId, ...BROADCAST_MARKERS]);
  if (identity.role === "student") {
    const snap = await firestoreAdmin
      .collection("students")
      .where("index_number", "==", identity.userId)
      .get();
    for (const doc of snap.docs) ids.add(doc.id);
  }
  return Array.from(ids);
}

export const Route = createFileRoute("/api/push/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const identity = await resolveCallerIdentity(request);
        if (!identity) {
          return Response.json({ notifications: [], unreadCount: 0 });
        }

        try {
          const idsToQuery = await resolveQueryIds(identity);

          const lists = await Promise.all(
            idsToQuery.map((targetId) =>
              firestoreAdmin
                .collection("in_app_notifications")
                .where("userId", "==", targetId)
                .limit(30)
                .get()
                .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })))
                .catch(() => [] as any[]),
            ),
          );

          const seen = new Set<string>();
          const combined: any[] = [];
          for (const list of lists) {
            for (const item of list) {
              if (item.id && !seen.has(item.id)) {
                seen.add(item.id);
                combined.push(item);
              }
            }
          }

          combined.sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
          });

          return Response.json({ notifications: combined });
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
          const { notificationId, markAllRead } = body;

          if (markAllRead) {
            const idsToQuery = await resolveQueryIds(identity);
            let count = 0;
            for (const targetId of idsToQuery) {
              const snap = await firestoreAdmin
                .collection("in_app_notifications")
                .where("userId", "==", targetId)
                .where("isRead", "==", false)
                .limit(50)
                .get();
              await Promise.all(snap.docs.map((d) => d.ref.set({ isRead: true }, { merge: true })));
              count += snap.size;
            }
            return Response.json({ success: true, count });
          }

          if (notificationId) {
            // Ownership check: the previous version marked ANY id as read
            // with no verification it belonged to the caller.
            const ref = firestoreAdmin.collection("in_app_notifications").doc(notificationId);
            const snap = await ref.get();
            if (!snap.exists) {
              return Response.json({ error: "Notification not found" }, { status: 404 });
            }
            const idsToQuery = await resolveQueryIds(identity);
            const ownerId = (snap.data() as any)?.userId;
            if (!idsToQuery.includes(ownerId)) {
              return Response.json(
                { error: "You do not have access to this notification" },
                { status: 403 },
              );
            }
            await ref.set({ isRead: true }, { merge: true });
            return Response.json({ success: true });
          }

          return Response.json({ error: "Invalid parameters" }, { status: 400 });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      },
    },
  },
});
