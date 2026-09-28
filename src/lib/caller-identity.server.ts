import { verifyCallerToken } from "@/integrations/firebase/admin.server";
import type { AppRole } from "@/lib/auth-claims";

/**
 * Resolves who is actually calling a server route, from verifiable proof
 * only — never from a userId/role the client claims in a query param or
 * request body. Used by every route that reads or writes per-person data
 * (notifications, preferences, push subscriptions).
 *
 * Verifies the Firebase ID token in Authorization header.
 *
 * Returns null if token fails to verify — callers should treat that as 401.
 */
export interface CallerIdentity {
  /** The verified Firebase Auth uid. */
  userId: string;
  role: AppRole;
  isStaff: boolean;
}

export async function resolveCallerIdentity(request: Request): Promise<CallerIdentity | null> {
  const authHeader = request.headers.get("authorization");

  const caller = await verifyCallerToken(authHeader);
  if (caller) {
    const role = (caller.role as AppRole | undefined) ?? "employee";
    return { userId: caller.uid, role, isStaff: role === "org_admin" || role === "manager" };
  }

  return null;
}
