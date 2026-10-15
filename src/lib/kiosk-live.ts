import { doc, onSnapshot } from "firebase/firestore";
import { firestoreDb } from "@/integrations/firebase/config";
import { LIVE_CONNECT_TIMEOUT_MS, parseChannelNote, type ChannelNote, type LiveState } from "@/lib/kiosk-channel";

/**
 * The tablet's live link to its greeting channel (see kiosk-channel.ts).
 *
 * This file is loaded on demand by the kiosk page, separately from the QR code,
 * so if it fails to load or connect the QR code keeps working and the tablet
 * simply falls back to asking the server (the kiosk page handles that).
 *
 * The tablet has no account: it reads one document by its private address and
 * nothing else. The document holds only { type, at }.
 */
export function watchChannel(
  channelId: string,
  onNote: (note: ChannelNote) => void,
  onState: (state: LiveState) => void,
): () => void {
  onState("connecting");

  // If the server has not answered at all shortly after starting, call it down.
  const connectTimer = setTimeout(() => onState("down"), LIVE_CONNECT_TIMEOUT_MS);

  const unsubscribe = onSnapshot(
    doc(firestoreDb, "kiosk_channels", channelId),
    // Metadata changes tell us when the connection drops: the snapshot then comes "from cache".
    { includeMetadataChanges: true },
    (snap) => {
      if (snap.metadata.fromCache) {
        onState("down");
        return;
      }
      clearTimeout(connectTimer);
      onState("live");
      if (snap.exists()) {
        const note = parseChannelNote(snap.data());
        if (note) onNote(note);
      }
    },
    () => {
      clearTimeout(connectTimer);
      onState("down");
    },
  );

  return () => {
    clearTimeout(connectTimer);
    unsubscribe();
  };
}
