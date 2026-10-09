import crypto from "node:crypto";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import {
  buildChannelNote,
  hasOnlyApprovedFields,
  isValidChannelId,
  parseChannelNote,
  shouldWriteNote,
  type ChannelNote,
  type ChannelNoteType,
} from "@/lib/kiosk-channel";

/**
 * Server side of the live greeting channel (see kiosk-channel.ts for the design
 * and the security reasoning). This file is the ONLY place that writes to
 * `kiosk_channels`; a test checks that.
 */

const COLLECTION = "kiosk_channels";

/** How long a scan will wait for the greeting note before moving on. The note is a courtesy. */
const NOTE_WRITE_TIMEOUT_MS = 400;

/** A new private channel address: 32 random bytes, 64 hex characters. */
export function generateChannelId(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * The tablet's channel address, creating one if the kiosk has none yet (tablets
 * paired before this feature existed). Safe to call from several server
 * instances at once: the first writer wins and everyone returns the same id.
 */
export async function ensureChannelId(locationId: string): Promise<string | null> {
  const ref = firestoreAdmin.collection("kiosks").doc(locationId);
  return firestoreAdmin.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return null;
    const existing = snap.data()?.channelId;
    if (isValidChannelId(existing)) return existing;
    const created = generateChannelId();
    t.update(ref, { channelId: created });
    return created;
  });
}

// Per-instance record of the last write to each channel, for the 500 ms throttle.
const lastWrite = new Map<string, number>();

/**
 * Tell a tablet a scan happened. Best effort: it never throws, never waits long,
 * and a failure never affects the check-in that triggered it. The note holds only
 * the direction and a time (no name, nothing identifying).
 */
export async function publishScanNote(channelId: string | undefined, type: ChannelNoteType, nowMs: number): Promise<void> {
  if (!isValidChannelId(channelId)) return;
  if (!shouldWriteNote(lastWrite.get(channelId), nowMs)) return;
  lastWrite.set(channelId, nowMs);
  if (lastWrite.size > 2000) lastWrite.clear();

  const note = buildChannelNote(type, nowMs);
  if (!hasOnlyApprovedFields(note as unknown as Record<string, unknown>)) {
    console.error("kiosk channel note has unapproved fields; not written");
    return;
  }

  try {
    await Promise.race([
      firestoreAdmin.collection(COLLECTION).doc(channelId).set(note),
      new Promise<void>((resolve) => setTimeout(resolve, NOTE_WRITE_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.warn("Could not publish the greeting note:", err);
  }
}

/** The current note, for a tablet that is asking because its live connection is down. One read. */
export async function readChannelNote(channelId: string | undefined): Promise<ChannelNote | null> {
  if (!isValidChannelId(channelId)) return null;
  try {
    const snap = await firestoreAdmin.collection(COLLECTION).doc(channelId).get();
    return snap.exists ? parseChannelNote(snap.data()) : null;
  } catch (err) {
    console.warn("Could not read the greeting note:", err);
    return null;
  }
}
