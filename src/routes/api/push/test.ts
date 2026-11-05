import { createFileRoute } from "@tanstack/react-router";
import { verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { pushNotConfigured, sendNotificationToUser } from "@/lib/push-service.server";

/**
 * "Send me a test": a real end-to-end push to the signed-in person's own devices.
 * Anyone signed in may use it, so it can only ever reach the caller: who the caller is comes
 * from the verified token, and nothing at all is read from the request body.
 */
export const Route = createFileRoute("/api/push/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }

          // A test is a nicety, not a tool: a few a quarter of an hour per person.
          const rate = await checkRateLimit(`push_test_${caller.uid}`, { limit: 5 });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many tests. Please wait ${rate.retryAfterMinutes} minute(s).` },
              { status: 429 },
            );
          }

          const notConfigured = pushNotConfigured();
          if (notConfigured) {
            return Response.json({ error: notConfigured }, { status: 503 });
          }

          const result = await sendNotificationToUser(caller.uid, {
            type: "TEST",
            title: "ChecIN test notification",
            body: "If you can read this, notifications work on this device.",
            url: "/account",
          });

          if (result.targetDevices === 0) {
            return Response.json(
              { error: "No device is switched on for your account. Turn notifications on first." },
              { status: 409 },
            );
          }
          return Response.json({ success: true, delivered: result.successful, devices: result.targetDevices });
        } catch (err) {
          console.error("Push test error:", err);
          return Response.json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
});
