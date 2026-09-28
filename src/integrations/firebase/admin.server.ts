if (typeof globalThis !== "undefined") {
  if (typeof (globalThis as any).__dirname === "undefined") {
    (globalThis as any).__dirname =
      typeof process !== "undefined" && process.cwd ? process.cwd() : "/";
  }
  if (typeof (globalThis as any).__filename === "undefined") {
    (globalThis as any).__filename =
      typeof process !== "undefined" && process.cwd ? process.cwd() + "/index.js" : "/index.js";
  }
}

import { getApps, initializeApp, getApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";
import type { AppRole } from "@/lib/auth-claims";

let adminApp: App | undefined;
let firestoreAdminInstance: Firestore | undefined;
let authAdminInstance: Auth | undefined;

let parsedServiceAccount: any = null;

/**
 * Resolves Admin SDK credentials.
 *
 * Application Default Credentials work on Google-hosted runtimes (Cloud Run,
 * App Hosting, Cloud Functions) but NOT on Vercel, which has no ambient GCP
 * identity. A service account is required and we fail loudly if it's missing.
 *
 * Set FIREBASE_SERVICE_ACCOUNT in the environment to either:
 *   - the raw service-account JSON, or
 *   - that JSON base64-encoded.
 */
function resolveCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    const onGoogleRuntime = Boolean(
      process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.GAE_ENV,
    );
    if (onGoogleRuntime) return undefined;

    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not set. The Admin SDK cannot authenticate " +
        "on this host. Add the service-account JSON — raw or base64-encoded — " +
        "as the FIREBASE_SERVICE_ACCOUNT environment variable.",
    );
  }

  let parsed: any;
  try {
    const trimmed = raw.trim();
    const json = trimmed.startsWith("{")
      ? trimmed
      : Buffer.from(trimmed, "base64").toString("utf8");
    parsed = JSON.parse(json);
    parsedServiceAccount = parsed;
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT could not be parsed. It must be the " +
        "service-account JSON, either raw or base64-encoded.",
    );
  }

  // Vercel's env UI turns real newlines in the private key into literal \n.
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }

  return cert({
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  });
}

function getAdminApp(): App {
  if (!adminApp) {
    if (getApps().length) {
      adminApp = getApp();
    } else {
      const credential = resolveCredential();
      const projectId =
        parsedServiceAccount?.project_id ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.VITE_FIREBASE_PROJECT_ID ||
        "checin-d172e";

      adminApp = initializeApp({
        projectId,
        ...(credential ? { credential } : {}),
      });
    }
  }
  return adminApp;
}

export function getFirestoreAdmin(): Firestore {
  if (!firestoreAdminInstance) {
    const app = getAdminApp();
    const dbId =
      process.env.FIREBASE_DATABASE_ID ||
      process.env.VITE_FIREBASE_DATABASE_ID ||
      undefined;

    firestoreAdminInstance = dbId && dbId !== "(default)" ? getFirestore(app, dbId) : getFirestore(app);
  }
  return firestoreAdminInstance;
}

export function getAuthAdmin(): Auth {
  if (!authAdminInstance) {
    authAdminInstance = getAuth(getAdminApp());
  }
  return authAdminInstance;
}

export const firestoreAdmin = new Proxy({} as Firestore, {
  get(_target, prop) {
    const admin = getFirestoreAdmin();
    const value = (admin as any)[prop];
    if (typeof value === "function") {
      return value.bind(admin);
    }
    return value;
  },
});

/**
 * Verifies the caller's Firebase ID token (sent as `Authorization: Bearer
 * <token>`) and returns its decoded claims, or null if missing/invalid.
 * Every privileged server route must call this first — never trust a
 * uid/role/ownerId sent in the request body itself.
 */
export async function verifyCallerToken(
  authorizationHeader: string | null | undefined,
): Promise<DecodedIdToken | null> {
  const match = authorizationHeader?.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    return await getAuthAdmin().verifyIdToken(match[1]);
  } catch {
    return null;
  }
}

/**
 * Grants a role + tenant scope to a target user via custom claims. This is
 * the ONLY supported way to change a user's role — there is deliberately no
 * client-writable Firestore path for this (see firestore.rules and AGENTS.md).
 */
export async function setStaffRoleClaims(
  targetUid: string,
  role: AppRole,
  orgId: string,
  managerId?: string | null,
): Promise<void> {
  await getAuthAdmin().setCustomUserClaims(targetUid, {
    role,
    orgId,
    managerId: managerId ?? (role === "manager" ? targetUid : null),
  });
}

export async function getUserClaims(
  uid: string,
): Promise<{ role: AppRole | null; orgId: string | null; managerId: string | null }> {
  const user = await getAuthAdmin().getUser(uid);
  const claims = user.customClaims ?? {};
  return {
    role: (claims.role as AppRole | undefined) ?? null,
    orgId: (claims.orgId as string | undefined) ?? null,
    managerId: (claims.managerId as string | undefined) ?? null,
  };
}
