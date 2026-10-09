/**
 * Structured, one-line-JSON logging for privileged actions, plus a correlation
 * id so one request can be followed across routes in the Vercel log search.
 *
 * Never put secrets, tokens, passwords or full email addresses in `fields`.
 */

export type LogOutcome = "ok" | "denied" | "error" | "rate_limited";

/** Use the platform's request id when present, otherwise generate one. */
export function correlationId(request: Request): string {
  const incoming = request.headers.get("x-vercel-id") || request.headers.get("x-request-id");
  if (incoming) return incoming.slice(0, 80);
  return `req_${crypto.randomUUID()}`;
}

export interface LogEntry {
  /** Short verb.noun name, e.g. "scan.record", "kiosk.pair", "invite.redeem". */
  action: string;
  outcome: LogOutcome;
  correlationId: string;
  orgId?: string | null;
  /** The verified caller's uid, never a value taken from the request body. */
  uid?: string | null;
  /** Small, non-secret extras: ids, counts, a reason code. */
  fields?: Record<string, string | number | boolean | null | undefined>;
}

export function logEvent(entry: LogEntry): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: entry.outcome === "error" ? "error" : "info",
    ...entry,
  });
  if (entry.outcome === "error") console.error(line);
  else console.log(line);
}
