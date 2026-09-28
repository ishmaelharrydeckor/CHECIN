// Centralized Web Push Notification Engine
// ChecIN Workforce Attendance SaaS
import webpush from "web-push";
import { createHash } from "crypto";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@checin.app";

let webPushInitialized = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    webPushInitialized = true;
  } catch (err) {
    console.error("[WebPush] Initialization error:", err);
  }
} else {
  console.warn("[WebPush] VAPID keys not configured in environment. Push notifications are disabled.");
}

export type NotificationType =
  | "ATTENDANCE"
  | "ANNOUNCEMENT"
  | "ASSIGNMENT"
  | "DEADLINE"
  | "SYSTEM"
  | "TEST";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  entityId?: string;
  entityType?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  timestamp?: number;
  actions?: Array<{ action: string; title: string }>;
}

export interface StoredPushSubscription {
  id: string;
  userId: string;
  userRole: "student" | "lecturer" | "admin";
  studentId?: string | null;
  indexNumber?: string | null;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  platform: string;
  browser: string;
  userAgent: string;
  isStandalone: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  failureCount?: number;
}

/** Deterministic document ID from push endpoint to prevent device duplicates */
export function getSubscriptionDocId(endpoint: string): string {
  const hash = createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
  return `sub_${hash}`;
}

const subscriptionsCol = () => firestoreAdmin.collection("push_subscriptions");

/** Save or update a device's push subscription in Firestore */
export async function savePushSubscription(
  userId: string,
  userRole: "student" | "lecturer" | "admin",
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  deviceInfo: {
    platform?: string;
    browser?: string;
    userAgent?: string;
    isStandalone?: boolean;
    studentId?: string;
    indexNumber?: string;
  } = {},
): Promise<StoredPushSubscription> {
  if (
    !subscription ||
    !subscription.endpoint ||
    !subscription.keys?.p256dh ||
    !subscription.keys?.auth
  ) {
    throw new Error("Invalid push subscription format");
  }

  const docId = getSubscriptionDocId(subscription.endpoint);
  const now = new Date().toISOString();
  const cleanUserId = String(userId).trim();

  const existingSnap = await subscriptionsCol().doc(docId).get();
  const existing = existingSnap.exists ? (existingSnap.data() as StoredPushSubscription) : null;

  const subDoc: StoredPushSubscription = {
    id: docId,
    userId: cleanUserId,
    userRole,
    studentId: deviceInfo.studentId || existing?.studentId || null,
    indexNumber:
      deviceInfo.indexNumber ||
      (userRole === "student" ? cleanUserId : null) ||
      existing?.indexNumber ||
      null,
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    platform: deviceInfo.platform || "unknown",
    browser: deviceInfo.browser || "unknown",
    userAgent: deviceInfo.userAgent || "",
    isStandalone: Boolean(deviceInfo.isStandalone),
    isActive: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    failureCount: 0,
    lastSuccessAt: existing?.lastSuccessAt || null,
    lastFailureAt: null,
  };

  await subscriptionsCol().doc(docId).set(subDoc, { merge: true });
  console.log(
    `[WebPush] Subscription saved for ${userRole} ${cleanUserId} on ${subDoc.platform}/${subDoc.browser}`,
  );
  return subDoc;
}

/** Deactivate or remove a push subscription */
export async function removePushSubscription(endpoint: string, userId?: string): Promise<boolean> {
  if (!endpoint) return false;
  const docId = getSubscriptionDocId(endpoint);
  try {
    const ref = subscriptionsCol().doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return true;
    const existing = snap.data() as StoredPushSubscription;

    // Verify ownership if userId is provided.
    if (userId && existing.userId !== String(userId).trim()) {
      return false;
    }

    await ref.set({ isActive: false, updatedAt: new Date().toISOString() }, { merge: true });
    console.log(`[WebPush] Subscription deactivated: ${docId}`);
    return true;
  } catch (err) {
    console.error("[WebPush] Failed to deactivate subscription:", err);
    return false;
  }
}

/** Low-level sender to a single subscription document */
async function sendToSubscriptionRecord(
  sub: StoredPushSubscription,
  payload: NotificationPayload,
): Promise<{ success: boolean; expired?: boolean; error?: string }> {
  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/favicon.png",
    badge: payload.badge || "/favicon.png",
    url: payload.url || "/",
    entityId: payload.entityId,
    entityType: payload.entityType,
    type: payload.type,
    tag: payload.tag,
    timestamp: payload.timestamp || Date.now(),
    actions: payload.actions,
  });

  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  };

  const ref = subscriptionsCol().doc(sub.id);

  try {
    await webpush.sendNotification(pushSubscription, pushPayload, {
      TTL: 86400,
      urgency: payload.type === "ATTENDANCE" ? "high" : "normal",
    });

    ref
      .set(
        { lastSuccessAt: new Date().toISOString(), updatedAt: new Date().toISOString(), failureCount: 0 },
        { merge: true },
      )
      .catch(() => {});

    return { success: true };
  } catch (err: any) {
    const statusCode = err?.statusCode;

    if (statusCode === 404 || statusCode === 410) {
      console.warn(`[WebPush] Subscription expired (${statusCode}) for ${sub.id}. Deactivating.`);
      ref
        .set(
          {
            isActive: false,
            lastFailureAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            failureReason: `expired_${statusCode}`,
          },
          { merge: true },
        )
        .catch(() => {});
      return { success: false, expired: true, error: `expired_${statusCode}` };
    }

    console.error(`[WebPush] Delivery error for ${sub.id} (HTTP ${statusCode}):`, err?.message || err);
    ref
      .set(
        {
          lastFailureAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          failureCount: (sub.failureCount || 0) + 1,
        },
        { merge: true },
      )
      .catch(() => {});

    return { success: false, error: err?.message || "Delivery failed" };
  }
}

/** Check user preferences before sending */
export async function isNotificationAllowed(
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  try {
    const snap = await firestoreAdmin.collection("notification_preferences").doc(userId).get();
    if (!snap.exists) return true; // Default to enabled
    const pref = snap.data() as any;

    if (pref.pushEnabled === false) return false;
    if (type === "ATTENDANCE" && pref.attendance === false) return false;
    if (type === "ANNOUNCEMENT" && pref.announcements === false) return false;
    if (type === "ASSIGNMENT" && pref.assignments === false) return false;
    if (type === "DEADLINE" && pref.deadlines === false) return false;
    if (type === "SYSTEM" && pref.system === false) return false;

    return true;
  } catch {
    return true;
  }
}

/** Persist In-App Notification history */
export async function saveInAppNotification(
  userId: string,
  payload: NotificationPayload,
): Promise<void> {
  try {
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await firestoreAdmin.collection("in_app_notifications").doc(notifId).set({
      id: notifId,
      userId: String(userId).trim(),
      type: payload.type,
      title: payload.title,
      body: payload.body,
      url: payload.url || "/",
      entityId: payload.entityId || null,
      entityType: payload.entityType || null,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[WebPush] Failed to save in-app notification:", err);
  }
}

/** Send a notification to all active devices of a single user */
export async function sendNotificationToUser(
  userId: string,
  payload: NotificationPayload,
): Promise<{ targetDevices: number; successful: number; failed: number }> {
  const cleanId = String(userId).trim();
  if (!cleanId) return { targetDevices: 0, successful: 0, failed: 0 };

  await saveInAppNotification(cleanId, payload);

  const allowed = await isNotificationAllowed(cleanId, payload.type);
  if (!allowed) {
    console.log(`[WebPush] Push blocked by user preference for ${cleanId} (${payload.type})`);
    return { targetDevices: 0, successful: 0, failed: 0 };
  }

  async function byField(field: string) {
    const snap = await subscriptionsCol()
      .where(field, "==", cleanId)
      .where("isActive", "==", true)
      .get();
    return snap.docs.map((d) => d.data() as StoredPushSubscription);
  }

  let subscriptions = await byField("userId");
  if (subscriptions.length === 0) {
    subscriptions = await byField("indexNumber");
  }
  if (subscriptions.length === 0) {
    subscriptions = await byField("studentId");
  }

  if (subscriptions.length === 0) {
    return { targetDevices: 0, successful: 0, failed: 0 };
  }

  let successful = 0;
  let failed = 0;
  for (const sub of subscriptions) {
    const res = await sendToSubscriptionRecord(sub, payload);
    if (res.success) successful++;
    else failed++;
  }

  console.log(
    `[WebPush] Sent "${payload.title}" to user ${cleanId} (${successful}/${subscriptions.length} devices delivered)`,
  );

  return { targetDevices: subscriptions.length, successful, failed };
}

/** Send notification to a list of users concurrently with bounded batches */
export async function sendNotificationToUsers(
  userIds: string[],
  payload: NotificationPayload,
): Promise<{ totalUsers: number; totalDelivered: number }> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean).map((id) => String(id).trim())));
  if (uniqueIds.length === 0) return { totalUsers: 0, totalDelivered: 0 };

  console.log(`[WebPush] Broadcasting "${payload.title}" to ${uniqueIds.length} users`);

  let totalDelivered = 0;
  const batchSize = 10;
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const chunk = uniqueIds.slice(i, i + batchSize);
    const results = await Promise.all(
      chunk.map((uid) =>
        sendNotificationToUser(uid, payload).catch((err) => {
          console.error(`[WebPush] Error dispatching to user ${uid}:`, err);
          return { targetDevices: 0, successful: 0, failed: 0 };
        }),
      ),
    );
    totalDelivered += results.reduce((acc, r) => acc + r.successful, 0);
  }

  return { totalUsers: uniqueIds.length, totalDelivered };
}

/** Send notification to all students registered in a course */
export async function sendNotificationToCourseStudents(
  courseId: string,
  payload: NotificationPayload,
): Promise<{ studentsCount: number; delivered: number }> {
  try {
    const cleanCourseId = String(courseId).trim();

    const regSnap = await firestoreAdmin
      .collection("course_registrations")
      .where("course_id", "==", cleanCourseId)
      .get();
    const studentIds = regSnap.docs.map((d) => (d.data() as any).student_id).filter(Boolean);

    const studentUserIds = new Set<string>();
    const studentRefs = studentIds.map((sid) => firestoreAdmin.collection("students").doc(sid));
    const studentDocs = studentRefs.length ? await firestoreAdmin.getAll(...studentRefs) : [];
    for (const doc of studentDocs) {
      if (!doc.exists) continue;
      studentUserIds.add(doc.id);
      const data = doc.data() as any;
      if (data?.index_number) studentUserIds.add(String(data.index_number).trim());
    }

    // Cohort fallback: same lecturer + department, for courses that rely on
    // level/department targeting rather than explicit registrations.
    const courseDoc = await firestoreAdmin.collection("courses").doc(cleanCourseId).get();
    const course = courseDoc.exists ? (courseDoc.data() as any) : null;
    if (course?.owner_id && course?.department_id) {
      const cohortSnap = await firestoreAdmin
        .collection("students")
        .where("owner_id", "==", course.owner_id)
        .where("department_id", "==", course.department_id)
        .get();
      for (const doc of cohortSnap.docs) {
        studentUserIds.add(doc.id);
        const data = doc.data() as any;
        if (data?.index_number) studentUserIds.add(String(data.index_number).trim());
      }
    }

    const recipientList = Array.from(studentUserIds);
    console.log(
      `[WebPush] Resolved ${recipientList.length} candidate student identifier(s) for course ${cleanCourseId}`,
    );

    if (recipientList.length === 0) {
      console.log(
        `[WebPush] No direct course registrations found for course ${cleanCourseId}. Falling back to active student devices.`,
      );
      const broadcastRes = await sendNotificationToAllActive(payload, "student");
      return { studentsCount: broadcastRes.totalDevices, delivered: broadcastRes.totalDelivered };
    }

    const res = await sendNotificationToUsers(recipientList, payload);
    return { studentsCount: recipientList.length, delivered: res.totalDelivered };
  } catch (err) {
    console.error("[WebPush] Failed to send notification to course:", err);
    return { studentsCount: 0, delivered: 0 };
  }
}

/** Broadcast notification to all active devices/users (or filtered by role) */
export async function sendNotificationToAllActive(
  payload: NotificationPayload,
  targetRole?: "student" | "lecturer" | "admin",
): Promise<{ totalDevices: number; totalDelivered: number }> {
  try {
    let query: FirebaseFirestore.Query = subscriptionsCol().where("isActive", "==", true);
    if (targetRole) {
      query = query.where("userRole", "==", targetRole);
    }
    const snap = await query.get();
    const subscriptions = snap.docs.map((d) => d.data() as StoredPushSubscription);

    if (subscriptions.length === 0) {
      return { totalDevices: 0, totalDelivered: 0 };
    }

    const uniqueUserIds = Array.from(new Set(subscriptions.map((s) => s.userId).filter(Boolean)));
    await Promise.all(
      uniqueUserIds.map((uid) => saveInAppNotification(String(uid), payload).catch(() => {})),
    );

    let delivered = 0;
    const chunkSize = 10;
    for (let i = 0; i < subscriptions.length; i += chunkSize) {
      const chunk = subscriptions.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map((sub) => sendToSubscriptionRecord(sub, payload).catch(() => ({ success: false }))),
      );
      delivered += results.filter((r) => r.success).length;
    }

    console.log(
      `[WebPush] Broadcast complete: "${payload.title}" (${delivered}/${subscriptions.length} devices delivered)`,
    );

    return { totalDevices: subscriptions.length, totalDelivered: delivered };
  } catch (err) {
    console.error("[WebPush] Broadcast error:", err);
    return { totalDevices: 0, totalDelivered: 0 };
  }
}
