import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The scan result confirms the check-in and nothing else. Late and early-departure judgements are
// shown on the person's own page (and can be excused), never on the scan screen.
test("the scan result overlay never shows late or left-early", () => {
  const overlay = readFileSync("src/components/scan/ScanResultOverlay.tsx", "utf8");
  const code = overlay.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/Marked late|Left early|late|earlyDeparture/i.test(code), "no late or early wording in the overlay code");
  assert.ok(overlay.includes("checked in") && overlay.includes("checked out"));
});

test("the scan page does not pass late or early-departure to the overlay", () => {
  const page = readFileSync("src/routes/scan.tsx", "utf8");
  const start = page.indexOf('kind: "success"');
  assert.ok(start > 0);
  const block = page.slice(start, start + 400);
  assert.ok(!/late|earlyDeparture/.test(block));
});
