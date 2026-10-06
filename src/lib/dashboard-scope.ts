/**
 * Who may see team attendance, and how much (AGENTS.md rule 1: identity, role and
 * organization come ONLY from the verified ID token's claims, never from a request).
 *
 *  - org_admin  -> the whole organization
 *  - manager    -> only people and events with managerId == their own uid
 *  - anyone else (employee, missing or unknown role, no organization) -> nothing
 */
export interface DashboardScope {
  uid: string;
  role: "org_admin" | "manager";
  orgId: string;
}

export function resolveDashboardScope(caller: {
  uid?: unknown;
  role?: unknown;
  orgId?: unknown;
}): DashboardScope | null {
  if (typeof caller.uid !== "string" || !caller.uid) return null;
  if (typeof caller.orgId !== "string" || !caller.orgId) return null;
  if (caller.role === "org_admin") return { uid: caller.uid, role: "org_admin", orgId: caller.orgId };
  if (caller.role === "manager") return { uid: caller.uid, role: "manager", orgId: caller.orgId };
  return null;
}
