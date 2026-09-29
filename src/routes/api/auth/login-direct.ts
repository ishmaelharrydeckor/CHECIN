import { createFileRoute } from "@tanstack/react-router";

/**
 * DEPRECATED / REMOVED:
 * Direct unverified custom token minting has been permanently dismantled
 * per AGENTS.md Principle #1. All clients must authenticate via client-side
 * Firebase Auth SDK (signInWithEmailAndPassword or Google Provider).
 */
export const Route = createFileRoute("/api/auth/login-direct")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json(
          {
            error:
              "This endpoint has been permanently deprecated. Please authenticate directly via the Firebase Auth client SDK.",
          },
          { status: 410 },
        );
      },
    },
  },
});
