import { createFileRoute } from "@tanstack/react-router";

/**
 * DEPRECATED & DISMANTLED:
 * Unauthenticated demo token minting is permanently disabled per AGENTS.md
 * Non-negotiable security principle #1. All clients must authenticate via
 * verified Firebase Auth credentials.
 */
export const Route = createFileRoute("/api/auth/demo-login")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json(
          {
            error:
              "Demo login has been permanently disabled. Please sign in with a verified account.",
          },
          { status: 410 },
        );
      },
    },
  },
});
