import { createFileRoute } from "@tanstack/react-router";
import {
  savePushSubscription,
  removePushSubscription,
  pushNotConfigured,
} from "@/lib/push-service.server";
import { verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { subscriptionOwnerFromClaims } from "@/lib/push-rules";

/**
 * Registers / removes a Web Push subscription for a verified ChecIN user.
 * Every user (employee, manager, org_admin) authenticates with a real Firebase ID token, sent in
 * the Authorization header. Who the device belongs to, and its org and team, come from that token
 * only: nothing identity-related is read from the request body.
 */
export const Route = createFileRoute("/api/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller) {
            return Response.json(
              { error: "Authentication required to register push notifications" },
              { status: 401 },
            );
          }

          // Keyed by the signed-in person, not the network address: a whole office shares one address.
          const rate = await checkRateLimit(`push_sub_${caller.uid}`, { limit: 20 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many attempts. Please wait ${rate.retryAfterMinutes} minute(s).` },
              { status: 429 },
            );
          }

          const notConfigured = pushNotConfigured();
          if (notConfigured) {
            return Response.json({ error: notConfigured }, { status: 503 });
          }

          const body = await request.json();
          const { subscription, device } = body;

          if (!subscription || !subscription.endpoint || !subscription.keys) {
            return Response.json({ error: "Invalid push subscription object" }, { status: 400 });
          }

          await savePushSubscription(subscriptionOwnerFromClaims(caller), subscription, {
            platform: device?.platform,
            browser: device?.browser,
            userAgent: device?.userAgent,
            isStandalone: device?.isStandalone,
          });

          return Response.json({ success: true, message: "Device subscribed successfully" });
        } catch (err: any) {
          console.error("Push subscribe error:", err);
          return Response.json({ error: "Internal server error" }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }

          const body = await request.json();
          const { endpoint } = body;

          if (!endpoint) {
            return Response.json({ error: "Subscription endpoint required" }, { status: 400 });
          }

          // Endpoint first, caller second. Only the device's current owner can switch it off.
          const removed = await removePushSubscription(endpoint, caller.uid);
          if (!removed) {
            return Response.json(
              { error: "That device is not registered to your account" },
              { status: 403 },
            );
          }
          return Response.json({ success: true, message: "Subscription removed successfully" });
        } catch (err: any) {
          console.error("Push unsubscribe error:", err);
          return Response.json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
});
