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

/**
 * The stored secret with accidental spaces and line breaks around it removed. A value pasted into an
 * environment-variable box very often carries an invisible trailing newline, which would otherwise make the
 * real secret impossible to match. Spaces inside the value are kept.
 */
export function cleanCronSecret(secret: string | undefined): string {
  return typeof secret === "string" ? secret.trim() : "";
}

/** What was sent, exactly as sent, without the bearer prefix. Only the stored secret is cleaned, never this. */
export function presentedCronToken(authorizationHeader: string | null | undefined): string {
  return typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length)
    : "";
}

export function checkCronAuth(authorizationHeader: string | null | undefined, secret: string | undefined): CronAuth {
  const configured = cleanCronSecret(secret);
  if (configured.length < MIN_CRON_SECRET_LENGTH) return "not_configured";
  const a = createHash("sha256").update(presentedCronToken(authorizationHeader)).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b) ? "ok" : "denied";
}
