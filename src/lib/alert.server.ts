/**
 * Tells the owner when something breaks (issue #24, "error alerts"), without needing an account at any particular
 * company: set `ALERT_WEBHOOK_URL` to an incoming-webhook address (Slack, Discord, Microsoft Teams, or an
 * email-forwarding service) and every server error that is logged with `outcome: "error"` is posted there.
 * Empty means off, and nothing changes.
 *
 * Safe by design:
 *  - It never throws and never slows or fails the request: sending is fire-and-forget with a short timeout.
 *  - The same kind of error is reported at most once every 15 minutes per server instance, so a failing route
 *    does not flood the channel.
 *  - Only the address of the problem is sent (what failed, in which environment, the organization id and the
 *    correlation id to search for in the Vercel logs), never a request body, token or personal detail. Any field
 *    whose name looks like a secret is dropped, and the message is cut to a fixed length.
 *  - Only https addresses are accepted.
 */

/** The parts of a log line an alert needs (a subset of LogEntry, so this file does not depend on it). */
export interface AlertEntry {
  action: string;
  correlationId: string;
  orgId?: string | null;
  fields?: Record<string, string | number | boolean | null | undefined>;
}

export const ALERT_REPEAT_WINDOW_MS = 15 * 60_000;
const MAX_TEXT = 800;
const SECRET_NAME = /secret|token|key|password|authorization|cookie|email|signature|credential/i;

/** The webhook address, only when it is a valid https URL. */
export function parseAlertUrl(raw: string | undefined | null): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Whether this kind of error should be reported now; records it when it should. */
export function shouldAlert(seen: Map<string, number>, key: string, nowMs: number, windowMs = ALERT_REPEAT_WINDOW_MS): boolean {
  const last = seen.get(key);
  if (last !== undefined && nowMs - last < windowMs) return false;
  seen.set(key, nowMs);
  // Keep the memory of what was reported small.
  if (seen.size > 200) {
    for (const [k, at] of seen) if (nowMs - at >= windowMs) seen.delete(k);
  }
  return true;
}

/** The message sent: plain text, with both `text` (Slack, Teams) and `content` (Discord) so any webhook can show it. */
export function buildAlertBody(entry: AlertEntry, environment: string): { text: string; content: string } {
  const parts = [`[ChecIN ${environment}] error in ${entry.action}`];
  if (entry.orgId) parts.push(`organization ${entry.orgId}`);
  parts.push(`search the logs for ${entry.correlationId}`);
  const safe = Object.entries(entry.fields ?? {})
    .filter(([name, value]) => !SECRET_NAME.test(name) && value !== undefined && value !== null)
    .map(([name, value]) => `${name}=${String(value)}`);
  if (safe.length > 0) parts.push(safe.join(", "));
  const text = parts.join(" | ").slice(0, MAX_TEXT);
  return { text, content: text };
}

export async function sendAlert(
  url: string,
  body: { text: string; content: string },
  fetchFn: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const seen = new Map<string, number>();

/** Called by logEvent for every error line. Does nothing unless ALERT_WEBHOOK_URL is a valid https address. */
export function alertOnError(entry: AlertEntry): void {
  try {
    const url = parseAlertUrl(process.env.ALERT_WEBHOOK_URL);
    if (!url) return;
    if (!shouldAlert(seen, entry.action, Date.now())) return;
    void sendAlert(url, buildAlertBody(entry, process.env.VERCEL_ENV || "local")).catch(() => {});
  } catch {
    // An alert must never break the request that caused it.
  }
}
