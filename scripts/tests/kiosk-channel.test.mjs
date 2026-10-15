import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CHANNEL_NOTE_FIELDS,
  NOTE_FRESH_MS,
  NOTE_FUTURE_TOLERANCE_MS,
  NOTE_MIN_GAP_MS,
  FALLBACK_NOTE_WINDOW_MS,
  buildChannelNote,
  isChannelDue,
  NOTE_TTL_MS,
  CHANNEL_ROTATE_MS,
  parseChannelNote,
  hasOnlyApprovedFields,
  isValidChannelId,
  serverClockOffset,
  isShowable,
  shouldWriteNote,
  inFallback,
  noteForFallback,
  formatNoteTime,
} from "../../src/lib/kiosk-channel.ts";
import { pollIntervalFor, POLL_MS_FALLBACK, POLL_MS_NORMAL } from "../../src/lib/kiosk-cache.server.ts";

// ------------------------------------------------------------ privacy: the note carries nothing identifying
test("the approved note fields are exactly 'at', 'expireAt' and 'type' (a change here needs a deliberate decision)", () => {
  assert.deepEqual([...CHANNEL_NOTE_FIELDS], ["at", "expireAt", "type"]);
});

test("expireAt is only the write time plus the time-to-live, so it reveals nothing new", () => {
  const note = buildChannelNote("out", 1_700_000_000_000);
  assert.equal(note.expireAt, note.at + NOTE_TTL_MS);
});

test("a channel address is due for replacement after a day, or when its age is unknown", () => {
  const t0 = 1_700_000_000_000;
  assert.equal(isChannelDue(undefined, t0), true);
  assert.equal(isChannelDue("x", t0), true);
  assert.equal(isChannelDue(0, t0), true);
  assert.equal(isChannelDue(t0, t0 + 60_000), false);
  assert.equal(isChannelDue(t0, t0 + CHANNEL_ROTATE_MS - 1), false);
  assert.equal(isChannelDue(t0, t0 + CHANNEL_ROTATE_MS), true);
  // a recorded time in the future (clock trouble) is not treated as due
  assert.equal(isChannelDue(t0 + 5 * 60_000, t0), false);
});

test("a note built by the server has only the approved fields, and no name of any kind", () => {
  const note = buildChannelNote("in", 1_700_000_000_000);
  assert.deepEqual(Object.keys(note).sort(), ["at", "expireAt", "type"]);
  assert.equal(hasOnlyApprovedFields(note), true);
  assert.equal(hasOnlyApprovedFields({ ...note, employeeName: "Ama" }), false);
  assert.equal(hasOnlyApprovedFields({ ...note, orgId: "o1" }), false);
  assert.equal(hasOnlyApprovedFields({ type: "in" }), false);
});

test("reading a note drops anything unexpected and rejects bad data", () => {
  assert.deepEqual(parseChannelNote({ type: "out", at: 5, employeeName: "Ama" }), { type: "out", at: 5 });
  assert.equal(parseChannelNote(null), null);
  assert.equal(parseChannelNote({ type: "maybe", at: 5 }), null);
  assert.equal(parseChannelNote({ type: "in", at: "5" }), null);
  assert.equal(parseChannelNote({ type: "in", at: NaN }), null);
  assert.equal(parseChannelNote({ type: "in", at: -1 }), null);
});

test("only the channel module writes to kiosk_channels, and the tablet only reads it", () => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const mentions = walk("src")
    .filter((f) => /[.]tsx?$/.test(f) && !f.endsWith("routeTree.gen.ts"))
    .filter((f) => readFileSync(f, "utf8").includes('"kiosk_channels"'))
    .map((f) => f.split("\\").join("/"))
    .sort();
  assert.deepEqual(mentions, ["src/lib/kiosk-channel.server.ts", "src/lib/kiosk-live.ts"]);
  // The tablet's file must never write.
  const client = readFileSync("src/lib/kiosk-live.ts", "utf8");
  assert.doesNotMatch(client, /setDoc|updateDoc|addDoc|deleteDoc|\.set\(/);
});

test("the database rule allows reading one channel document and nothing else", () => {
  const rules = readFileSync("firestore.rules", "utf8").split("\r\n").join("\n");
  const block = rules.match(/match \/kiosk_channels\/\{channelId\} \{([\s\S]*?)\n    \}/);
  assert.ok(block, "the kiosk_channels rule is missing");
  assert.match(block[1], /allow get: if true;/);
  assert.match(block[1], /allow list, create, update, delete: if false;/);
  assert.doesNotMatch(block[1], /allow (read|write)/);
});

// ------------------------------------------------------------ the channel address
test("a channel address is 64 lowercase hex characters", () => {
  assert.equal(isValidChannelId("a".repeat(64)), true);
  assert.equal(isValidChannelId("A".repeat(64)), false);
  assert.equal(isValidChannelId("a".repeat(63)), false);
  assert.equal(isValidChannelId("g".repeat(64)), false);
  assert.equal(isValidChannelId(undefined), false);
  assert.equal(isValidChannelId(12345), false);
});

// ------------------------------------------------------------ when the tablet shows a greeting
const T = 1_700_000_000_000;

test("a fresh, new note is shown", () => {
  assert.equal(isShowable({ type: "in", at: T }, 0, T + 800), true);
});

test("the same note is never shown twice", () => {
  assert.equal(isShowable({ type: "in", at: T }, T, T + 800), false);
  assert.equal(isShowable({ type: "in", at: T }, T + 1, T + 800), false);
});

test("an old note (a reconnect or reboot after the scan) is not replayed", () => {
  assert.equal(isShowable({ type: "in", at: T }, 0, T + NOTE_FRESH_MS), true);
  assert.equal(isShowable({ type: "in", at: T }, 0, T + NOTE_FRESH_MS + 1), false);
});

test("a note from the future (a wrong clock) is not shown", () => {
  assert.equal(isShowable({ type: "in", at: T + NOTE_FUTURE_TOLERANCE_MS }, 0, T), true);
  assert.equal(isShowable({ type: "in", at: T + NOTE_FUTURE_TOLERANCE_MS + 1 }, 0, T), false);
});

test("a tablet whose clock is hours wrong still judges age correctly using the server's clock", () => {
  const tabletNow = T - 3 * 3600_000; // tablet is 3 hours behind
  const offset = serverClockOffset(T + 500, tabletNow);
  assert.equal(offset, 3 * 3600_000 + 500);
  assert.equal(isShowable({ type: "out", at: T }, 0, tabletNow + offset), true);
});

// ------------------------------------------------------------ the writer
test("the writer skips an update that follows the previous one too closely", () => {
  assert.equal(shouldWriteNote(undefined, T), true);
  assert.equal(shouldWriteNote(T, T + NOTE_MIN_GAP_MS - 1), false);
  assert.equal(shouldWriteNote(T, T + NOTE_MIN_GAP_MS), true);
});

// ------------------------------------------------------------ fallback
test("the tablet asks the server for scans only while the greeting is on, it has a channel, and the live link is down", () => {
  assert.equal(inFallback(true, true, "down"), true);
  assert.equal(inFallback(true, true, "live"), false);
  assert.equal(inFallback(true, true, "connecting"), false);
  assert.equal(inFallback(true, true, "off"), false);
  assert.equal(inFallback(false, true, "down"), false);
  assert.equal(inFallback(true, false, "down"), false);
});

test("the server hands back a note only if it is newer than the tablet's last and recent", () => {
  const note = { type: "in", at: T };
  assert.deepEqual(noteForFallback(note, 0, T + 3000), note);
  assert.equal(noteForFallback(note, T, T + 3000), null); // already seen: no scan is repeated
  assert.equal(noteForFallback(note, 0, T + FALLBACK_NOTE_WINDOW_MS + 1), null);
  assert.equal(noteForFallback(null, 0, T), null);
});

test("a scan between two slow fallback polls is not lost (unlike the old 12-second window)", () => {
  // Scan at T; the tablet's next question comes 14 s later (12 s plus slow requests).
  const shown = noteForFallback({ type: "in", at: T }, 0, T + 14_000);
  assert.ok(shown, "the note must still be returned");
});

test("polling is 12 s normally and 4 s only in fallback", () => {
  assert.equal(pollIntervalFor(false), POLL_MS_NORMAL);
  assert.equal(pollIntervalFor(true), POLL_MS_FALLBACK);
  assert.equal(POLL_MS_NORMAL, 12000);
  assert.equal(POLL_MS_FALLBACK, 4000);
});

// ------------------------------------------------------------ display
test("the time on the card is in the organization's timezone", () => {
  const at = new Date("2026-03-10T08:52:07.000Z").getTime();
  assert.equal(formatNoteTime(at, "UTC"), "08:52");
  assert.equal(formatNoteTime(at, "Asia/Kolkata"), "14:22");
  assert.equal(formatNoteTime(at, "Not/AZone"), "08:52");
});
