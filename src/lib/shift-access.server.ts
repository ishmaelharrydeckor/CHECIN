import { getAuthAdmin } from "@/integrations/firebase/admin.server";
import { canEditShift, canManageShifts, type CallerLike } from "@/lib/shift-requests";

/** Extracts the verified shift-permission fields from a decoded Firebase ID token. */
export function callerFromToken(caller: {
  uid: string;
  role?: unknown;
  shiftAdmin?: unknown;
}): CallerLike {
  return {
    uid: caller.uid,
    role: typeof caller.role === "string" ? caller.role : null,
    shiftAdmin: caller.shiftAdmin === true,
  };
}

/** Org admins always; managers only when an admin has turned on their `shiftAdmin` claim. */
export function canCallerManageShifts(caller: {
  uid: string;
  role?: unknown;
  shiftAdmin?: unknown;
}): boolean {
  return canManageShifts(callerFromToken(caller));
}

/** Org admins can edit any shift in their org; managers with `shiftAdmin` only shifts they created. */
export function canCallerEditShift(
  caller: { uid: string; role?: unknown; shiftAdmin?: unknown },
  shiftCreatedBy: string | null,
): boolean {
  return canEditShift(callerFromToken(caller), shiftCreatedBy);
}

/**
 * Grants or removes a manager's shift-management permission by merging `shiftAdmin`
 * into their existing custom claims so `role`, `orgId`, `managerId` and `kioskAdmin`
 * remain intact.
 */
export async function setShiftAdminClaim(targetUid: string, allowed: boolean): Promise<void> {
  const user = await getAuthAdmin().getUser(targetUid);
  const claims: Record<string, unknown> = { ...(user.customClaims ?? {}) };
  if (allowed) claims.shiftAdmin = true;
  else delete claims.shiftAdmin;
  await getAuthAdmin().setCustomUserClaims(targetUid, claims);
}
