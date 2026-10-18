import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { dayKey } from "@/lib/attendance-day";

/** Today's date (YYYY-MM-DD) in the organization's timezone, from the server clock. Never the client's. */
export async function loadOrgToday(orgId: string): Promise<string> {
  const orgSnap = await firestoreAdmin.collection("organizations").doc(orgId).get();
  const rawTz = orgSnap.exists ? orgSnap.data()?.timezone : undefined;
  const timezone = typeof rawTz === "string" && rawTz.trim().length > 0 ? rawTz.trim() : "UTC";
  return dayKey(Date.now(), timezone) || new Date().toISOString().slice(0, 10);
}
