/**
 * The live greeting channel, as pure functions (docs/SCALE-PLAN.md, section 3.4).
 *
 * Each paired tablet has a private "channel": one small Firestore document at
 * `kiosk_channels/{channelId}`. The scan route writes a bare note into it after a
 * check-in is saved, and the tablet watches it, so the greeting card appears
 * within a second without the tablet asking the server over and over.
 *
 * SECURITY: the rules let anyone who knows a channelId READ that one document
 * (never list, never write). The channelId is 32 random bytes known only to the
 * server and that tablet. Because anyone holding it can read the note, the note
 * must carry NOTHING identifying: no name, no employee, no organization, no
 * location. A test fails the build if the approved field list below changes.
 *
 * No Firebase and no path-alias imports, so it can be unit tested directly.
 */

export type ChannelNoteType = "in" | "out";

export interface ChannelNote {
  type: ChannelNoteType;
  /** Server time in milliseconds when the scan was saved. Also the note's version. */
  at: number;
}

/** The ONLY fields a channel note may contain. Adding one needs a deliberate change here and in the test. */
export const CHANNEL_NOTE_FIELDS = ["at", "type"] as const;

/** A note older than this (by the server's clock) is never shown as a greeting. */
export const NOTE_FRESH_MS = 15_000;
/** How far ahead of the server clock a note may look before it is distrusted. */
export const NOTE_FUTURE_TOLERANCE_MS = 5_000;
/** Do not rewrite the same note more often than this (one document takes about one write a second). */
export const NOTE_MIN_GAP_MS = 500;
/** In fallback mode the server hands back a note this recent (the tablet's own freshness check still applies). */
export const FALLBACK_NOTE_WINDOW_MS = 60_000;
/** If the live connection has not confirmed itself this soon after starting, treat it as down. */
export const LIVE_CONNECT_TIMEOUT_MS = 10_000;

export function buildChannelNote(type: ChannelNoteType, nowMs: number): ChannelNote {
  return { type, at: nowMs };
}

/** Validate a document read from the channel. Anything unexpected is rejected; extra fields are dropped. */
export function parseChannelNote(raw: unknown): ChannelNote | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== "in" && r.type !== "out") return null;
  if (typeof r.at !== "number" || !Number.isFinite(r.at) || r.at <= 0) return null;
  return { type: r.type, at: r.at };
}

/** True only if the document has exactly the approved fields (used by tests and by the writer's self-check). */
export function hasOnlyApprovedFields(doc: Record<string, unknown>): boolean {
  const keys = Object.keys(doc).sort();
  return keys.length === CHANNEL_NOTE_FIELDS.length && keys.every((k, i) => k === CHANNEL_NOTE_FIELDS[i]);
}

/** The channel address: 32 random bytes as 64 lowercase hex characters. */
export function isValidChannelId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{64}$/.test(id);
}

/** server time minus the tablet's own clock, so the tablet can judge age without trusting its clock. */
export function serverClockOffset(serverNowMs: number, localNowMs: number): number {
  return serverNowMs - localNowMs;
}

/**
 * Should the tablet show a greeting for this note?
 *  - it must be newer than the last note already handled (no repeats)
 *  - it must be recent by the SERVER's clock (a reconnect or reboot never replays an old greeting)
 *  - it must not come from the future (a wrong clock never makes one linger)
 */
export function isShowable(note: ChannelNote, lastSeenAt: number, serverNowMs: number): boolean {
  if (note.at <= lastSeenAt) return false;
  const age = serverNowMs - note.at;
  if (age > NOTE_FRESH_MS) return false;
  if (age < -NOTE_FUTURE_TOLERANCE_MS) return false;
  return true;
}

/** Writer throttle: skip a write that follows the previous one too closely. */
export function shouldWriteNote(lastWriteMs: number | undefined, nowMs: number): boolean {
  return lastWriteMs === undefined || nowMs - lastWriteMs >= NOTE_MIN_GAP_MS;
}

export type LiveState = "off" | "connecting" | "live" | "down";

/** The tablet asks the server for scans only while the greeting is on and the live connection is not healthy. */
export function inFallback(greetingOn: boolean, hasChannel: boolean, state: LiveState): boolean {
  return greetingOn && hasChannel && state === "down";
}

/** Fallback answer on the server: the note, if newer than what the tablet has and recent enough. */
export function noteForFallback(note: ChannelNote | null, since: number, serverNowMs: number): ChannelNote | null {
  if (!note) return null;
  if (note.at <= since) return null;
  if (serverNowMs - note.at > FALLBACK_NOTE_WINDOW_MS) return null;
  return note;
}

/** "08:52" in the organization's timezone (24-hour). Falls back to UTC for an unknown zone. */
export function formatNoteTime(atMs: number, timezone: string): string {
  const date = new Date(atMs);
  if (Number.isNaN(date.getTime())) return "";
  let tz = timezone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
