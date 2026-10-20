/**
 * Who may call a scheduled-job route. Vercel's scheduler sends `Authorization: Bearer <CRON_SECRET>`
 * when a `CRON_SECRET` environment variable is set on the project. Nothing else can call these routes.
 *
 * Fails closed: with no secret configured (or a weak one) nobody is let in, there is no fallback value,
 * and the secret is compared in constant time (both sides are hashed first, so length is not revealed).
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_CRON_SECRET_LENGTH = 16;

export type CronAuth = "ok" | "not_configured" | "denied";

export function checkCronAuth(authorizationHeader: string | null | undefined, secret: string | undefined): CronAuth {
  if (typeof secret !== "string" || secret.length < MIN_CRON_SECRET_LENGTH) return "not_configured";
  const presented =
    typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ")
      ? authorizationHeader.slice("Bearer ".length)
      : "";
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b) ? "ok" : "denied";
}
