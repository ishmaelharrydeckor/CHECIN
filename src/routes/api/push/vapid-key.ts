import { createFileRoute } from "@tanstack/react-router";
import { VAPID_PUBLIC_KEY, pushNotConfigured } from "@/lib/push-service.server";

export const Route = createFileRoute("/api/push/vapid-key")({
  server: {
    handlers: {
      GET: async () => {
        const notConfigured = pushNotConfigured();
        if (notConfigured) {
          // Say so plainly, and do not let anything cache the "not set up" answer.
          return Response.json(
            { error: notConfigured },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
        return Response.json(
          { publicKey: VAPID_PUBLIC_KEY },
          {
            headers: {
              "Cache-Control": "public, max-age=86400",
            },
          },
        );
      },
    },
  },
});
