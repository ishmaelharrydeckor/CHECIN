import { createFileRoute } from "@tanstack/react-router";
import {
  savePushSubscription,
  removePushSubscription,
} from "@/lib/push-service.server";
import { verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit.server";
import type { CorporateRole } from "@/lib/auth-claims";

/**
 * Registers / removes a Web Push subscription for a verified ChecIN user.
 * Every user (employee, manager, org_admin) authenticates with a real Firebase ID token.
 */
export const Route = createFileRoute("/api/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const rate = await checkRateLimit(`push_sub_${clientIpFrom(request)}`, { limit: 20 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many attempts. Please wait ${rate.retryAfterMinutes} minute(s).` },
              { status: 429 },
            );
          }

          const body = await request.json();
          const { subscription, userContext, device } = body;

          if (!subscription || !subscription.endpoint || !subscription.keys) {
            return Response.json({ error: "Invalid push subscription object" }, { status: 400 });
          }

          // Verified caller token
          const authHeader =
            request.headers.get("authorization") ||
            (userContext?.token ? `Bearer ${userContext.token}` : null);

          const caller = await verifyCallerToken(authHeader);
          if (!caller) {
            return Response.json(
              { error: "Authentication required to register push notifications" },
              { status: 401 },
            );
          }

          const verifiedUserId = caller.uid;
          const verifiedRole = (caller.role as CorporateRole | undefined) ?? "employee";

          await savePushSubscription(
            verifiedUserId,
            verifiedRole as any,
            subscription,
            device,
          );

          return Response.json({ success: true, message: "Device subscribed successfully" });
        } catch (err: any) {
          console.error("Push subscribe error:", err);
          return Response.json({ error: "Internal server error" }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const body = await request.json();
          const { endpoint, userContext } = body;

          if (!endpoint) {
            return Response.json({ error: "Subscription endpoint required" }, { status: 400 });
          }

          const authHeader =
            request.headers.get("authorization") ||
            (userContext?.token ? `Bearer ${userContext.token}` : null);

          const caller = await verifyCallerToken(authHeader);
          if (!caller) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }

          await removePushSubscription(caller.uid, endpoint);
          return Response.json({ success: true, message: "Subscription removed successfully" });
        } catch (err: any) {
          console.error("Push unsubscribe error:", err);
          return Response.json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
});
