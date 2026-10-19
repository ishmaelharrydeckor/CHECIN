import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Anyone can walk up to the entrance tablet. It must not offer a button that switches it off.
const kiosk = readFileSync("src/routes/kiosk.tsx", "utf8").replace(/\r\n/g, "\n");

test("the live kiosk screen has no unpair button for passers-by", () => {
  assert.ok(!kiosk.includes("Unpair Terminal"), "the always-visible unpair button is gone");
});

test("re-pairing is only offered once the server has rejected the tablet (an admin revoked it)", () => {
  const credentialsBlock = kiosk.slice(kiosk.indexOf('status === "credentials" && tokenError'));
  assert.ok(credentialsBlock.includes("onClick={handleUnpair}") && credentialsBlock.includes("Re-pair"), "Re-pair shows in the credentials state");
  assert.equal((kiosk.match(/onClick=\{handleUnpair\}/g) ?? []).length, 1, "that is the only way to reach the pairing screen again");
});

test("the footer names the entrance and does not show part of its internal id", () => {
  assert.ok(!/locationId\.slice\(/.test(kiosk), "no slice of the location id on screen");
  assert.ok(kiosk.includes("<span>{locationName}</span>"));
});

test("the setup guide tells admins how to move a tablet", () => {
  const guide = readFileSync("docs/KIOSK-SETUP-GUIDE.md", "utf8");
  assert.ok(guide.includes("Moving or resetting a tablet") && guide.includes("revoke"));
});
