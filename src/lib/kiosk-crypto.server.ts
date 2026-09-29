import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function getKioskSecret(): string {
  let secret = process.env.KIOSK_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret && typeof process !== "undefined" && process.cwd) {
    try {
      const envPath = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("KIOSK_TOKEN_SECRET=")) {
            secret = trimmed.replace("KIOSK_TOKEN_SECRET=", "").trim().replace(/^["']|["']$/g, "");
            process.env.KIOSK_TOKEN_SECRET = secret;
            break;
          }
        }
      }
    } catch {}
  }
  // High-entropy derivation from server's private Firebase Service Account key if KIOSK_TOKEN_SECRET is unconfigured in host
  if (!secret && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      const parsed = JSON.parse(json);
      if (parsed.private_key) {
        secret = crypto.createHmac("sha256", parsed.private_key).update("checin-kiosk-token-secret-v1").digest("hex");
        process.env.KIOSK_TOKEN_SECRET = secret;
      }
    } catch {}
  }

  if (!secret) {
    throw new Error(
      "FATAL: Missing KIOSK_TOKEN_SECRET in environment variables. Refusing to operate kiosk cryptographic routines without a configured secret.",
    );
  }
  return secret;
}

/**
 * Computes a SHA-256 hash of a raw device secret.
 */
export function hashDeviceSecret(rawSecret: string): string {
  return crypto.createHash("sha256").update(rawSecret).digest("hex");
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
export function timingSafeHashMatch(rawSecret: string, storedHash: string): boolean {
  try {
    if (!rawSecret || !storedHash) return false;
    const computedHash = hashDeviceSecret(rawSecret);
    const bufA = Buffer.from(computedHash, "hex");
    const bufB = Buffer.from(storedHash, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Generates a rotating HMAC-SHA256 token for a given location and 15-second time bucket.
 * Token format: `${timeBucket}.${hmacHex}`
 */
export function generateKioskToken(locationId: string, timeBucket: number): string {
  const secret = getKioskSecret();
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`${locationId}:${timeBucket}`)
    .digest("hex");
  return `${timeBucket}.${hmac}`;
}

/**
 * Validates an incoming token against a locationId.
 * Checks the current 15s bucket and ±1 bucket for sliding grace tolerance (45s window).
 */
export function verifyKioskToken(
  token: string,
  locationId: string,
): { valid: boolean; bucket?: number; reason?: string } {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false, reason: "Malformed token format" };
  }

  const [bucketStr, receivedHmac] = token.split(".");
  const bucket = parseInt(bucketStr, 10);
  if (isNaN(bucket)) {
    return { valid: false, reason: "Invalid token time bucket" };
  }

  const nowBucket = Math.floor(Date.now() / 15000);
  const bucketDelta = nowBucket - bucket;

  // Enforce sliding window: allow current bucket, immediately previous bucket (grace for network latency),
  // and immediately next bucket (minor clock skew). Delta must be -1, 0, or 1.
  if (Math.abs(bucketDelta) > 1) {
    return {
      valid: false,
      reason: bucketDelta > 1 ? "QR code expired. Please rescan live screen." : "Future timestamp rejected",
    };
  }

  const secret = getKioskSecret();
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(`${locationId}:${bucket}`)
    .digest("hex");

  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(receivedHmac, "hex");
    bufB = Buffer.from(expectedHmac, "hex");
  } catch {
    return { valid: false, reason: "Malformed cryptographic signature" };
  }

  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return { valid: false, reason: "Cryptographic signature mismatch" };
  }

  return { valid: true, bucket };
}
