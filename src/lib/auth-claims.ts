import { firebaseAuth, onAuthStateChanged } from "@/integrations/firebase/config";

/**
 * ChecIN Corporate Tenancy & Roles Model (AGENTS.md)
 *
 * Tenancy and roles live exclusively in Firebase custom claims, set server-side
 * via Admin SDK routes. They are NEVER stored on client-writable Firestore docs.
 *
 * Custom claims on every authenticated user:
 *   { role: "org_admin" | "manager" | "employee", orgId: string, managerId?: string | null }
 *
 * - An org_admin can act across the whole organization (orgId).
 * - A manager is scoped to managerId == their own uid.
 * - An employee is scoped to their own records within their manager's team.
 */
export type CorporateRole = "org_admin" | "manager" | "employee";
export type AppRole = CorporateRole;

export interface ChecINClaimsState {
  uid: string | null;
  role: CorporateRole | null;
  /** The organization isolation boundary (company id). */
  orgId: string | null;
  /** The assigned manager's uid (for employees), or own uid (for managers). */
  managerId: string | null;
}

let current: ChecINClaimsState = {
  uid: null,
  role: null,
  orgId: null,
  managerId: null,
};

let readyPromise: Promise<void> = Promise.resolve();

async function refreshClaims(forceRefresh = false): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    current = { uid: null, role: null, orgId: null, managerId: null };
    return;
  }
  try {
    const tokenResult = await user.getIdTokenResult(forceRefresh);
    const role = (tokenResult.claims.role as CorporateRole | undefined) ?? null;
    const orgId = (tokenResult.claims.orgId as string | undefined) ?? null;
    const managerId = (tokenResult.claims.managerId as string | undefined) ?? null;
    current = { uid: user.uid, role, orgId, managerId };
  } catch {
    // Brand new user or unassigned claims
    current = { uid: user.uid, role: null, orgId: null, managerId: null };
  }
}

onAuthStateChanged(firebaseAuth, () => {
  readyPromise = refreshClaims();
});

/**
 * Call this immediately after a role or org assignment changes
 * (e.g. after registering an organization or accepting an invite)
 * so the new claims take effect without requiring a sign-out.
 */
export async function refreshUserClaims(): Promise<void> {
  await refreshClaims(true);
}

/** Resolves once initial claims load has settled. */
export function waitForClaims(): Promise<void> {
  return readyPromise;
}

/** The organization ID (hard tenant boundary). */
export function getOrgId(): string | undefined {
  return current.orgId ?? undefined;
}

/** The manager ID (for team-scoped queries). */
export function getManagerId(): string | undefined {
  return current.managerId ?? undefined;
}

/** The actual signed-in user's Firebase uid. */
export function getUid(): string | undefined {
  return current.uid ?? undefined;
}

/** Current corporate role ('org_admin' | 'manager' | 'employee' | null). */
export function getRole(): CorporateRole | null {
  return current.role;
}

export function isOrgAdminRole(): boolean {
  return current.role === "org_admin";
}

export function isManagerRole(): boolean {
  return current.role === "manager";
}

export function isEmployeeRole(): boolean {
  return current.role === "employee";
}
