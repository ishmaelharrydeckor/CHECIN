/**
 * What the employee's phone shows after a scan, as pure functions.
 *
 * The scan response is the confirmation: it comes from the same transaction that
 * wrote the record, so "You're in" can only appear if the write succeeded. A
 * failure must be just as clear, and must always say the check-in was NOT
 * recorded, because a missed failure is the real risk (someone walks away
 * thinking they are checked in).
 *
 * Plain language, no exclamation marks (docs/UI-STYLE-GUIDE.md).
 */

export type FailureKind =
  | "offline"
  | "cooldown"
  | "expired"
  | "session"
  | "wrong_org"
  | "not_paired"
  | "conflict"
  | "server"
  | "other";

export interface ScanFailure {
  kind: FailureKind;
  title: string;
  detail: string;
  /** Seconds to wait, for the cooldown case. */
  waitSeconds?: number;
}

const NOT_RECORDED = "Your check-in was not recorded.";

/**
 * Turn an HTTP status plus the server's message into something a person can act on.
 * `status` 0 means the request never got a response (no network, or the server was unreachable).
 */
export function describeScanFailure(status: number, serverMessage: string | undefined, online: boolean): ScanFailure {
  const msg = (serverMessage || "").trim();

  if (status === 0) {
    return online
      ? {
          kind: "server",
          title: "Could not reach the server",
          detail: `${NOT_RECORDED} Try again in a moment.`,
        }
      : {
          kind: "offline",
          title: "No connection",
          detail: `${NOT_RECORDED} Check-in needs an internet connection. Reconnect, then scan again.`,
        };
  }

  if (status === 429) {
    const wait = Number(msg.match(/wait\s+(\d+)\s*s/i)?.[1]);
    const dir = msg.match(/checked\s+(in|out)/i)?.[1]?.toLowerCase();
    return {
      kind: "cooldown",
      title: "Already recorded",
      detail: `You checked ${dir ?? "in or out"} a moment ago${
        Number.isFinite(wait) ? `. Wait ${wait} seconds before scanning again` : ""
      }. That earlier scan counts.`,
      waitSeconds: Number.isFinite(wait) ? wait : undefined,
    };
  }

  if (status === 401) {
    return {
      kind: "session",
      title: "Please sign in again",
      detail: `${NOT_RECORDED} Your session has ended. Sign in, then scan again.`,
    };
  }

  if (status === 403) {
    return {
      kind: "wrong_org",
      title: "Not your workplace",
      detail: `${NOT_RECORDED} This entrance belongs to a different organization, or your account has no organization.`,
    };
  }

  if (status === 404) {
    return {
      kind: "not_paired",
      title: "Entrance not set up",
      detail: `${NOT_RECORDED} This entrance tablet is not paired. Tell your administrator.`,
    };
  }

  if (status === 409) {
    return {
      kind: "conflict",
      title: "Could not record that scan",
      detail: `${NOT_RECORDED} Scan the code again.`,
    };
  }

  if (status === 400 && /expired|live qr|current .*qr|invalid token|malformed|signature|time bucket|future timestamp/i.test(msg)) {
    return {
      kind: "expired",
      title: "That code has expired",
      detail: `${NOT_RECORDED} The code on the screen changes every few seconds. Scan the one showing now.`,
    };
  }

  if (status >= 500) {
    return {
      kind: "server",
      title: "Something went wrong on our side",
      detail: `${NOT_RECORDED} Try again in a moment.`,
    };
  }

  return {
    kind: "other",
    title: "Could not check you in",
    detail: msg ? `${NOT_RECORDED} ${msg}` : NOT_RECORDED,
  };
}

/** A network failure or a 5xx may have reached the server: reusing the same scanId on the retry makes it safe. */
export function isRetrySafeFailure(status: number): boolean {
  return status === 0 || status >= 500;
}

/** How long a scanId may be reused for a retry of the same QR payload. */
export const SCAN_ID_REUSE_MS = 60_000;

export interface PendingScan {
  scanId: string;
  /** What the attempt was for: the entrance's location id. */
  key: string;
  at: number;
}

/**
 * The scanId to send. Reuse the pending one only for the same entrance within the
 * reuse window (a retry of an attempt whose outcome is unknown, even with a fresher
 * QR code); otherwise this is a new scan and gets a new id. If the first attempt did
 * reach the server, the server answers the retry with the original result.
 */
export function chooseScanId(
  pending: PendingScan | null,
  key: string,
  now: number,
  makeId: () => string,
): string {
  if (pending && pending.key === key && now - pending.at <= SCAN_ID_REUSE_MS) return pending.scanId;
  return makeId();
}

/** "Last recorded: IN at 08:52", or null when the person has not scanned today. */
export function describeLastRecorded(status: "in" | "out", time: string | null | undefined): string | null {
  if (!time) return null;
  const hhmm = time.length >= 5 ? time.slice(0, 5) : time;
  return `Last recorded: ${status === "in" ? "IN" : "OUT"} at ${hhmm}`;
}
