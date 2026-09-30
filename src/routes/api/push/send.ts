import { createFileRoute } from "@tanstack/react-router";
import {
  sendNotificationToUser,
  sendNotificationToUsers,
  sendNotificationToOrg,
  NotificationPayload,
} from "@/lib/push-service.server";
import { resolveTargetInScope, verifyCallerToken } from "@/integrations/firebase/admin.server";
import type { CorporateRole } from "@/lib/auth-claims";

export const Route = createFileRoute("/api/push/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });
          if (!caller) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          const role = (caller.role as CorporateRole | undefined) ?? null;
          const orgId = (caller.orgId as string | undefined) ?? null;

          if (!orgId || (role !== "org_admin" && role !== "manager")) {
            return Response.json(
              { error: "Only organization admins and managers can send push notifications" },
              { status: 403 },
            );
          }

          const body = await request.json();
          const { userId, userIds, broadcast, payload } = body as {
            userId?: string;
            userIds?: string[];
            broadcast?: boolean;
            payload: NotificationPayload;
          };

          if (!payload || typeof payload.title !== "string" || !payload.title.trim()) {
            return Response.json(
              { error: "Notification payload with title is required" },
              { status: 400 },
            );
          }

          // Bound the content and keep links inside this app (no external phishing URLs)
          if (payload.title.length > 120 || (payload.body && String(payload.body).length > 500)) {
            return Response.json({ error: "Notification title or body is too long" }, { status: 400 });
          }
          if (payload.url !== undefined && payload.url !== null) {
            const u = String(payload.url);
            if (!u.startsWith("/") || u.startsWith("//")) {
              return Response.json({ error: "Notification url must be a relative in-app path" }, { status: 400 });
            }
          }

          // Case 1: Organization-wide broadcast (Admin only)
          if (broadcast) {
            if (role !== "org_admin") {
              return Response.json(
                { error: "Only organization admins can broadcast company-wide notifications" },
                { status: 403 },
              );
            }
            const res = await sendNotificationToOrg(orgId, payload);
            return Response.json({
              success: true,
              mode: "broadcast",
              totalUsers: res.totalUsers,
              totalDelivered: res.totalDelivered,
            });
          }

          // Case 2: Specific team members / users — every id must be in the caller's scope
          // (org for admins, own team for managers). Out-of-scope ids are dropped.
          if (Array.isArray(userIds) && userIds.length > 0) {
            if (userIds.length > 200) {
              return Response.json({ error: "Too many recipients (max 200)" }, { status: 400 });
            }
            const checks = await Promise.all(
              userIds.map(async (id) => ((await resolveTargetInScope(caller, String(id))) ? String(id) : null)),
            );
            const allowedIds = checks.filter((id): id is string => id !== null);
            if (allowedIds.length === 0) {
              return Response.json({ error: "No recipients in your organization or team" }, { status: 403 });
            }
            const res = await sendNotificationToUsers(allowedIds, payload);
            return Response.json({
              success: true,
              mode: "users",
              totalUsers: res.totalUsers,
              delivered: res.totalDelivered,
            });
          }

          // Case 3: Single user notification
          if (userId) {
            if (!(await resolveTargetInScope(caller, String(userId)))) {
              return Response.json({ error: "Recipient not found in your organization or team" }, { status: 403 });
            }
            const res = await sendNotificationToUser(String(userId), payload);
            return Response.json({
              success: true,
              mode: "user",
              targetDevices: res.targetDevices,
              delivered: res.successful,
            });
          }

          return Response.json({ error: "Invalid target specification" }, { status: 400 });
        } catch (err: any) {
          console.error("Push dispatch error:", err);
          return Response.json({ error: "Internal dispatch error" }, { status: 500 });
        }
      },
    },
  },
});
