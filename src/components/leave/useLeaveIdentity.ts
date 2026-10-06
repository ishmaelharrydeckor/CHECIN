import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/config";

export type LeaveRole = "org_admin" | "manager" | "employee";

export type LeaveIdentity =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "invalid" } // signed in but claims are missing/unknown
  | {
      status: "ready";
      uid: string;
      role: LeaveRole;
      orgId: string;
      managerId: string | null;
    };

const ROLES: readonly string[] = ["org_admin", "manager", "employee"];

/**
 * Identity comes ONLY from the verified ID token claims,
 * never from a form field or URL.
 */
export function useLeaveIdentity(): LeaveIdentity {
  const [identity, setIdentity] = useState<LeaveIdentity>({ status: "loading" });

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        setIdentity({ status: "signed-out" });
        return;
      }
      try {
        const { claims } = await user.getIdTokenResult();
        const role = claims.role as string | undefined;
        const orgId = claims.orgId as string | undefined;
        const managerId = (claims.managerId as string | undefined) ?? null;

        if (!role || !ROLES.includes(role) || !orgId) {
          setIdentity({ status: "invalid" });
          return;
        }
        setIdentity({
          status: "ready",
          uid: user.uid,
          role: role as LeaveRole,
          orgId,
          managerId,
        });
      } catch {
        setIdentity({ status: "invalid" });
      }
    });
  }, []);

  return identity;
}