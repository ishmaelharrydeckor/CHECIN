import { firestoreAdmin } from "../src/integrations/firebase/admin.server";

const collections = [
  "organizations",
  "users",
  "locations",
  "kiosks",
  "kiosk_pairings",
  "clock_events",
  "leave_requests",
  "announcements",
  "staff_invites",
  "user_devices",
  "push_subscriptions",
  "in_app_notifications",
  "notification_preferences",
  "rate_limits",
  "recent_scans",
];

async function clearCollections() {
  console.log("Starting database cleanup for all ChecIN collections...");
  for (const colName of collections) {
    try {
      const snap = await firestoreAdmin.collection(colName).get();
      console.log(`Collection ${colName}: found ${snap.size} documents.`);
      if (snap.empty) continue;

      const batchSize = 400;
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = firestoreAdmin.batch();
        const chunk = docs.slice(i, i + batchSize);
        for (const doc of chunk) {
          batch.delete(doc.ref);
        }
        await batch.commit();
      }
      console.log(`Successfully deleted ${snap.size} documents from ${colName}.`);
    } catch (err: any) {
      console.error(`Error clearing collection ${colName}:`, err?.message || err);
    }
  }
  console.log("Database cleanup finished.");
}

clearCollections()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  });
