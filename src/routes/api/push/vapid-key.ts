import { createFileRoute } from "@tanstack/react-router";
import { VAPID_PUBLIC_KEY } from "@/lib/push-service.server";

export const Route = createFileRoute("/api/push/vapid-key")({
  server: {
    handlers: {
      GET: async () => {
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
