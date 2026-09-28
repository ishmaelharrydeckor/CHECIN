import { createFileRoute } from "@tanstack/react-router";
import {
  sendNotificationToUser,
  sendNotificationToUsers,
  sendNotificationToAllActive,
  NotificationPayload,
} from "@/lib/push-service.server";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import type { CorporateRole } from "@/lib/auth-claims";

export const Route = createFileRoute("/api/push/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
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

          if (!payload || !payload.title) {
            return Response.json(
              { error: "Notification payload with title is required" },
              { status: 400 },
            );
          }

          // Case 1: Organization-wide broadcast (Admin only)
          if (broadcast) {
            if (role !== "org_admin") {
              return Response.json(
                { error: "Only organization admins can broadcast company-wide notifications" },
                { status: 403 },
              );
            }
            const res = await sendNotificationToAllActive(payload);
            return Response.json({
              success: true,
              mode: "broadcast",
              totalDevices: res.totalDevices,
              totalDelivered: res.totalDelivered,
            });
          }

          // Case 2: Specific team members / users
          if (Array.isArray(userIds) && userIds.length > 0) {
            const res = await sendNotificationToUsers(userIds, payload);
            return Response.json({
              success: true,
              mode: "users",
              totalUsers: res.totalUsers,
              delivered: res.totalDelivered,
            });
          }

          // Case 3: Single user notification
          if (userId) {
            const res = await sendNotificationToUser(userId, payload);
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
