import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { dayKey } from "@/lib/attendance-day";

/** The organization's timezone (UTC when none is set), read on the server. */
export async function loadOrgTimezone(orgId: string): Promise<string> {
  const orgSnap = await firestoreAdmin.collection("organizations").doc(orgId).get();
  const rawTz = orgSnap.exists ? orgSnap.data()?.timezone : undefined;
  return typeof rawTz === "string" && rawTz.trim().length > 0 ? rawTz.trim() : "UTC";
}

/** Today's date (YYYY-MM-DD) in the organization's timezone, from the server clock. Never the client's. */
export async function loadOrgToday(orgId: string): Promise<string> {
  const timezone = await loadOrgTimezone(orgId);
  return dayKey(Date.now(), timezone) || new Date().toISOString().slice(0, 10);
}
