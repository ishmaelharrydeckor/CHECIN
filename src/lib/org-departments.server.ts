import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { departmentsInUse, storedDepartments } from "@/lib/departments";

/**
 * The organization's department list.
 *
 * Organizations created before the list existed have none saved. The first time anyone asks, the
 * list is built once from the departments people already have and saved, so nothing disappears and
 * every later call is a single document read. The save only happens if no list exists yet, so it
 * can never overwrite an admin's edit that landed in between.
 */
export async function loadOrgDepartments(orgId: string): Promise<string[]> {
  const orgRef = firestoreAdmin.collection("organizations").doc(orgId);
  const snap = await orgRef.get();
  if (!snap.exists) return storedDepartments(undefined);
  const saved = snap.data()?.departments;
  if (Array.isArray(saved)) return storedDepartments(saved);

  const users = await firestoreAdmin.collection("users").where("orgId", "==", orgId).limit(2000).get();
  const derived = departmentsInUse(users.docs.map((d) => d.data().department));

  return firestoreAdmin.runTransaction(async (tx) => {
    const fresh = await tx.get(orgRef);
    const now = fresh.data()?.departments;
    if (Array.isArray(now)) return storedDepartments(now);
    tx.set(orgRef, { departments: derived, updatedAt: new Date().toISOString() }, { merge: true });
    return derived;
  });
}
