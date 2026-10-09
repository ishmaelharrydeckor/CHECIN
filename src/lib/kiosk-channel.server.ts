import crypto from "node:crypto";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import {
  buildChannelNote,
  hasOnlyApprovedFields,
  isChannelDue,
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
    t.update(ref, { channelId: created, channelRotatedAt: Date.now() });
    return created;
  });
}

/**
 * Replace the tablet's channel address if it is older than CHANNEL_ROTATE_MS (or has no recorded
 * age, as for tablets paired before rotation existed). The tablet asks for its address on every
 * token request and switches to the new one by itself, so nobody notices. The old note is deleted
 * on a best-effort basis. Safe from several server instances at once: the transaction re-checks,
 * so only one of them rotates and the others return the new address.
 *
 * Other server instances may keep scanning into the old address for up to the kiosk cache time
 * (about a minute), so a greeting in that window may not appear. The greeting is only a courtesy.
 */
export async function rotateChannelIfDue(
  locationId: string,
  nowMs: number,
): Promise<{ channelId: string; rotatedAt: number } | null> {
  const ref = firestoreAdmin.collection("kiosks").doc(locationId);
  const result = await firestoreAdmin.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return null;
    const data = snap.data()!;
    const existing = isValidChannelId(data.channelId) ? data.channelId : undefined;
    if (existing && !isChannelDue(data.channelRotatedAt, nowMs)) {
      return { channelId: existing, rotatedAt: data.channelRotatedAt as number, previous: undefined };
    }
    const created = generateChannelId();
    t.update(ref, { channelId: created, channelRotatedAt: nowMs });
    return { channelId: created, rotatedAt: nowMs, previous: existing };
  });
  if (!result) return null;
  if (result.previous) {
    firestoreAdmin
      .collection(COLLECTION)
      .doc(result.previous)
      .delete()
      .catch((err) => console.warn("Could not delete the old greeting note:", err));
  }
  return { channelId: result.channelId, rotatedAt: result.rotatedAt };
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
      // expireAt is stored as a timestamp so Firestore's time-to-live setting can clean it up.
      firestoreAdmin.collection(COLLECTION).doc(channelId).set({ ...note, expireAt: new Date(note.expireAt) }),
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
