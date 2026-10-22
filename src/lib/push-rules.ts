/**
 * Small, pure rules for push notifications, kept apart from the server code so
 * they can be tested without Firebase.
 */

export interface PushEnv {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

/**
 * Returns a plain-language reason push cannot work with this environment, or
 * null when it is set up. The two keys are required; the contact subject is
 * checked only if it is set.
 */
export function pushConfigProblem(env: PushEnv): string | null {
  const missing: string[] = [];
  if (!env.VAPID_PUBLIC_KEY?.trim()) missing.push("VAPID_PUBLIC_KEY");
  if (!env.VAPID_PRIVATE_KEY?.trim()) missing.push("VAPID_PRIVATE_KEY");
  if (missing.length > 0) {
    return `Push notifications are not set up: missing ${missing.join(" and ")}.`;
  }
  const subject = env.VAPID_SUBJECT?.trim();
  if (subject && !/^(mailto:|https:\/\/)/.test(subject)) {
    return "Push notifications are not set up: VAPID_SUBJECT must start with mailto: or https://.";
  }
  return null;
}

export type PushRole = "org_admin" | "manager" | "employee";

export interface PushOwner {
  userId: string;
  userRole: PushRole;
  orgId: string | null;
  managerId: string | null;
}

/**
 * Who a push subscription belongs to, taken ONLY from the verified ID token's
 * claims. Nothing here ever reads a request body (AGENTS rule 1).
 */
export function subscriptionOwnerFromClaims(claims: {
  uid: string;
  role?: unknown;
  orgId?: unknown;
  managerId?: unknown;
}): PushOwner {
  const role: PushRole =
    claims.role === "org_admin" || claims.role === "manager" ? claims.role : "employee";
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    userId: claims.uid,
    userRole: role,
    orgId: text(claims.orgId),
    managerId: text(claims.managerId),
  };
}
