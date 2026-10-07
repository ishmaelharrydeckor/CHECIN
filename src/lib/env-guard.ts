/**
 * Refuses to run a non-production deployment against the production Firebase
 * project. A Preview deployment that picks up production credentials would write
 * test data into real customer records (this happened once with staging).
 *
 * Pure function so it can be tested; admin.server.ts calls it at startup.
 */

/** The production Firebase project id (public, not a secret). Override only in tests. */
export const PRODUCTION_PROJECT_ID = "checin-d172e";

export interface EnvGuardInput {
  /** process.env.VERCEL_ENV: "production" | "preview" | "development" | undefined (not on Vercel) */
  vercelEnv?: string;
  /** The Firebase project the Admin SDK is about to use. */
  projectId: string;
  productionProjectId?: string;
}

export function assertEnvironmentSafe({
  vercelEnv,
  projectId,
  productionProjectId = PRODUCTION_PROJECT_ID,
}: EnvGuardInput): void {
  if (!projectId) {
    throw new Error("Firebase project id could not be determined; refusing to start.");
  }
  if (vercelEnv === "preview" && projectId === productionProjectId) {
    throw new Error(
      `Refusing to start: this is a Vercel PREVIEW deployment but it is configured for the ` +
        `production Firebase project (${productionProjectId}). Set the Preview-scope ` +
        `FIREBASE_SERVICE_ACCOUNT to the staging project's key.`,
    );
  }
}
