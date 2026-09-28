/**
 * One-off bootstrap: grants the lecturer role to an existing account.
 *
 * Roles live in Firebase custom claims and are granted through
 * /api/admin/roles — but that endpoint requires an already-privileged caller,
 * so the first account has to be seeded out of band. Run this once per
 * existing lecturer, then use the app's Teaching Assistants page for
 * everything after.
 *
 * Usage:
 *   1. Firebase Console > Project Settings > Service Accounts >
 *      "Generate new private key". Save as service-account.json in this
 *      folder. DO NOT COMMIT IT.
 *   2. Firebase Console > Authentication > Users. Copy the target UID.
 *   3. node scripts/bootstrap-role.mjs <uid> [lecturer|admin|super_admin]
 *   4. Have that user sign out and back in so their token picks up the claim.
 *   5. Delete service-account.json when you're done.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";

const [, , uid, roleArg] = process.argv;
const role = roleArg || "lecturer";

if (!uid) {
  console.error("Usage: node scripts/bootstrap-role.mjs <uid> [lecturer|admin|super_admin]");
  process.exit(1);
}
if (!["lecturer", "admin", "super_admin"].includes(role)) {
  console.error(`Invalid role "${role}". Use lecturer, admin, or super_admin.`);
  console.error("Teaching assistants are invited through the app, not this script.");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(new URL("./service-account.json", import.meta.url)));
} catch {
  console.error("Could not read scripts/service-account.json — see the header of this file.");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();

try {
  const user = await auth.getUser(uid);
  // A lecturer owns their own data, so ownerId is their own uid. Platform
  // admins get the same shape so any owner_id-scoped query still resolves.
  await auth.setCustomUserClaims(uid, { role, ownerId: uid });
  console.log(`Granted "${role}" to ${user.email || uid}.`);
  console.log("They must sign out and back in for the change to take effect.");
} catch (err) {
  console.error("Failed:", err.message);
  process.exit(1);
}
