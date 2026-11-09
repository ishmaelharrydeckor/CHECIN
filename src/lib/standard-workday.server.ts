import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { parseStoredWorkday, type StandardWorkday } from "@/lib/standard-workday";

/**
 * The organization's standard workday, read fresh from its own document (one read), so a change an admin just made
 * shows on the next timesheet. If it cannot be read, it reads as "not set": nobody is ever given an expected time
 * that was not chosen.
 */
export async function loadStandardWorkday(orgId: string): Promise<StandardWorkday | null> {
  try {
    const snap = await firestoreAdmin.collection("organizations").doc(orgId).get();
    return snap.exists ? parseStoredWorkday(snap.data()) : null;
  } catch {
    return null;
  }
}
