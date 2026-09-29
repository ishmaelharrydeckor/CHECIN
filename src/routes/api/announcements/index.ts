import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import {
  sendNotificationToOrg,
  sendNotificationToTeam,
  NotificationPayload,
} from "@/lib/push-service.server";

export const Route = createFileRoute("/api/announcements/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          let orgId = caller.orgId;
          if (!orgId) {
            try {
              const uDoc = await firestoreAdmin.collection("users").doc(caller.uid).get();
              if (uDoc.exists && uDoc.data()?.orgId) {
                orgId = uDoc.data()!.orgId;
              }
            } catch (e) {
              console.warn("Could not check user doc for orgId:", e);
            }
          }

          if (!orgId) {
            return Response.json({ error: "No organization associated with this account" }, { status: 403 });
          }

          let query: FirebaseFirestore.Query = firestoreAdmin
            .collection("announcements")
            .where("orgId", "==", orgId);

          let snap;
          try {
            snap = await query.orderBy("createdAt", "desc").limit(50).get();
          } catch (err: any) {
            console.warn("[Announcements] Index fallback:", err?.message);
            snap = await query.limit(50).get();
          }

          let docs = snap.docs;
          docs.sort((a, b) => {
            const timeA = new Date(a.data().createdAt || 0).getTime();
            const timeB = new Date(b.data().createdAt || 0).getTime();
            return timeB - timeA;
          });

          // Team-level visibility scoping per AGENTS.md
          if (caller.role === "employee") {
            docs = docs.filter((d) => {
              const mId = d.data().managerId;
              return !mId || mId === caller.managerId;
            });
          } else if (caller.role === "manager") {
            docs = docs.filter((d) => {
              const mId = d.data().managerId;
              return !mId || mId === caller.uid;
            });
          }

          const announcements = docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: data.title || "Notice",
              body: data.body || "",
              scope: data.scope || (data.managerId ? "Team" : "Organization-wide"),
              author: data.authorName || "Administration",
              authorUid: data.authorUid || "",
              authorRole: data.authorRole || "org_admin",
              managerId: data.managerId || null,
              createdAt: data.createdAt || new Date().toISOString(),
              isImportant: Boolean(data.isImportant),
            };
          });

          return Response.json({ ok: true, announcements });
        } catch (err: any) {
          console.error("GET /api/announcements error:", err);
          return Response.json({ error: "Failed to load notices" }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          let orgId = caller.orgId;
          if (!orgId) {
            try {
              const uDoc = await firestoreAdmin.collection("users").doc(caller.uid).get();
              if (uDoc.exists && uDoc.data()?.orgId) {
                orgId = uDoc.data()!.orgId;
              }
            } catch (e) {
              console.warn("Could not check user doc for orgId in POST announcement:", e);
            }
          }

          if (!orgId) {
            return Response.json({ error: "Unauthorized: Missing organization membership" }, { status: 401 });
          }

          if (caller.role !== "org_admin" && caller.role !== "manager") {
            return Response.json({ error: "Forbidden: Only admins and managers can post announcements" }, { status: 403 });
          }

          const body = await request.json();
          const title = (body?.title || "").trim();
          const content = (body?.body || "").trim();
          const isImportant = Boolean(body?.isImportant);
          const requestedScope = body?.scope || "Organization-wide";

          if (!title || !content) {
            return Response.json({ error: "Title and content are required" }, { status: 400 });
          }

          // Org admins can post org-wide or team notices; managers can ONLY post team notices to their team
          const isOrgWide = caller.role === "org_admin" && requestedScope === "Organization-wide";
          const targetManagerId = isOrgWide
            ? null
            : (caller.role === "manager" ? caller.uid : body?.managerId || null);

          const newDocRef = firestoreAdmin.collection("announcements").doc();
          const now = new Date().toISOString();
          const authorName = caller.name || caller.email?.split("@")[0] || "Management";

          const noticeData = {
            orgId,
            managerId: targetManagerId,
            title,
            body: content,
            scope: isOrgWide ? "Organization-wide" : "Team",
            authorName,
            authorUid: caller.uid,
            authorRole: caller.role,
            isImportant,
            createdAt: now,
          };

          await newDocRef.set(noticeData);

          // Dispatch push notification to relevant employees
          const pushPayload: NotificationPayload = {
            type: "ANNOUNCEMENT",
            title: isImportant ? `🚨 ${title}` : title,
            body: content.slice(0, 140) + (content.length > 140 ? "..." : ""),
            url: "/announcements",
            tag: `announcement_${newDocRef.id}`,
            entityId: newDocRef.id,
            entityType: "announcement",
          };

          if (isOrgWide) {
            sendNotificationToOrg(orgId, pushPayload).catch(() => {});
          } else if (targetManagerId) {
            sendNotificationToTeam(targetManagerId, orgId, pushPayload).catch(() => {});
          }

          return Response.json({
            ok: true,
            announcement: {
              id: newDocRef.id,
              ...noticeData,
              author: authorName,
            },
          });
        } catch (err: any) {
          console.error("POST /api/announcements error:", err);
          return Response.json({ error: "Failed to publish announcement" }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) {
            return Response.json({ error: "Missing announcement ID" }, { status: 400 });
          }

          const docRef = firestoreAdmin.collection("announcements").doc(id);
          const docSnap = await docRef.get();
          if (!docSnap.exists) {
            return Response.json({ error: "Announcement not found" }, { status: 404 });
          }

          const data = docSnap.data()!;
          if (data.orgId !== caller.orgId) {
            return Response.json({ error: "Forbidden: Cross-tenant access denied" }, { status: 403 });
          }

          if (caller.role !== "org_admin" && data.authorUid !== caller.uid) {
            return Response.json({ error: "Forbidden: Cannot delete notices published by other users" }, { status: 403 });
          }

          await docRef.delete();
          return Response.json({ ok: true });
        } catch (err: any) {
          console.error("DELETE /api/announcements error:", err);
          return Response.json({ error: "Failed to delete notice" }, { status: 500 });
        }
      },
    },
  },
});
