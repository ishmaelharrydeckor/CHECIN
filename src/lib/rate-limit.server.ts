import { firestoreAdmin } from "@/integrations/firebase/admin.server";

/**
 * Rate limiting backed by the locked-down `rate_limits` collection (Admin
 * SDK only — see firestore.rules).
 *
 * The previous implementation used a module-level in-memory Map. That works
 * on a single Node process, but once the app runs behind a load balancer
 * each instance keeps its own independent counter, so the effective limit
 * becomes (limit x instance count). At 10,000 users this app will be
 * multi-instance, so the counter has to be shared.
 *
 * The increment runs in a transaction so concurrent requests hitting
 * different instances can't both read "7" and both write "8".
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterMinutes?: number;
}

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  /**
   * What to do when the limiter itself cannot reach Firestore.
   * - false (default): let the request through. Right for login, where locking
   *   everyone out of their account is worse than a brief gap in throttling.
   * - true: refuse. Right for kiosk pairing and invite redemption, where the
   *   limiter is the only thing slowing down guessing of a code or token.
   */
  failClosed?: boolean;
}

/** Keep expired counters this long before the Firestore TTL policy deletes them. */
const TTL_GRACE_MS = 24 * 60 * 60 * 1000;

export function sanitizeRateLimitKey(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 400);
}

export async function checkRateLimit(
  rawKey: string,
  opts?: RateLimitOptions,
): Promise<RateLimitResult> {
  const limit = opts?.limit ?? 8;
  const windowMs = opts?.windowMs ?? 15 * 60 * 1000;
  const key = sanitizeRateLimitKey(rawKey);
  const now = Date.now();

  try {
    const ref = firestoreAdmin.collection("rate_limits").doc(key);

    return await firestoreAdmin.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() as { count: number; reset_at: number }) : null;

      // No entry, or the previous window has expired — start a fresh window.
      if (!data || now > data.reset_at) {
        tx.set(ref, {
          count: 1,
          reset_at: now + windowMs,
          updated_at: now,
          // Firestore TTL policy on this field deletes the document after it passes.
          expireAt: new Date(now + windowMs + TTL_GRACE_MS),
        });
        return { allowed: true };
      }

      if (data.count >= limit) {
        const retryAfterMinutes = Math.max(1, Math.ceil((data.reset_at - now) / 60000));
        return { allowed: false, retryAfterMinutes };
      }

      tx.update(ref, { count: data.count + 1, updated_at: now });
      return { allowed: true };
    });
  } catch (err) {
    if (opts?.failClosed) {
      console.error("Rate limit check failed, refusing request (fail-closed route):", err);
      return { allowed: false, retryAfterMinutes: 1 };
    }
    // Fail open: a rate-limiter outage should not lock every user out of
    // their account. The error is surfaced so it shows up in monitoring
    // rather than failing silently.
    console.error("Rate limit check failed, allowing request:", err);
    return { allowed: true };
  }
}

/** Extract the client IP from common proxy headers. */
export function clientIpFrom(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "client"
  );
}
