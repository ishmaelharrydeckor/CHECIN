import { useEffect, useState } from "react";
import { firebaseAuth, onAuthStateChanged } from "@/integrations/firebase/config";
import { clearUserAppCache } from "./query-client";
import {
  type CorporateRole,
  type AppRole,
  getOrgId,
  getManagerId,
  getRole,
  canManageKiosksRole,
  waitForClaims,
  refreshUserClaims,
} from "./auth-claims";

export type { CorporateRole, AppRole };

export interface AppUser {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  photoURL?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
  provider?: "google" | "password";
}

function toAppUser(fbUser: NonNullable<typeof firebaseAuth.currentUser>): AppUser {
  const providerId = fbUser.providerData?.[0]?.providerId === "google.com" ? "google" : "password";
  const name = fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "User";
  return {
    id: fbUser.uid,
    email: fbUser.email ?? undefined,
    name,
    displayName: name,
    photoURL: fbUser.photoURL ?? undefined,
    user_metadata: {
      full_name: name,
      avatar_url: fbUser.photoURL ?? undefined,
    },
    provider: providerId,
  };
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(() => {
    const fbUser = firebaseAuth.currentUser;
    return fbUser ? toAppUser(fbUser) : null;
  });

  const [role, setRole] = useState<CorporateRole | null>(() => getRole());
  const [orgId, setOrgId] = useState<string | undefined>(() => getOrgId());
  const [managerId, setManagerId] = useState<string | undefined>(() => getManagerId());
  const [canManageKiosks, setCanManageKiosks] = useState(() => canManageKiosksRole());
  const [loading, setLoading] = useState(() => {
    const fbUser = firebaseAuth.currentUser;
    if (!fbUser) return true;
    return getRole() === null;
  });

  useEffect(() => {
    let mounted = true;

    const unsubFirebase = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (!mounted) return;
      if (fbUser) {
        setUser(toAppUser(fbUser));
        await waitForClaims();
        if (!mounted) return;
        setRole(getRole());
        setOrgId(getOrgId());
        setManagerId(getManagerId());
        setCanManageKiosks(canManageKiosksRole());
        setLoading(false);
      } else {
        clearUserAppCache();
        setUser(null);
        setRole(null);
        setOrgId(undefined);
        setManagerId(undefined);
        setCanManageKiosks(false);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubFirebase();
    };
  }, []);

  const isOrgAdmin = role === "org_admin";
  const isManager = role === "manager";
  const isEmployee = role === "employee";
  const isMember = role !== null && orgId !== undefined;

  return {
    session: user ? { user } : null,
    user,
    role,
    orgId,
    managerId,
    loading,
    isOrgAdmin,
    isManager,
    isEmployee,
    isMember,
    canManageKiosks,
    refreshClaims: refreshUserClaims,
  };
}
