import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The public landing page must not show another company's pictures or name. Its pictures are drawn
// from ChecIN's own components (src/components/landing/ProductVisuals.tsx), with made-up sample people.
const page = readFileSync("src/routes/index.tsx", "utf8").replace(/\r\n/g, "\n");
const visuals = readFileSync("src/components/landing/ProductVisuals.tsx", "utf8").replace(/\r\n/g, "\n");

test("no picture on the landing page is loaded from another site", () => {
  assert.ok(!/framerusercontent|framer\.website|framer\.com/i.test(page), "the template's image host is gone");
  assert.ok(!/<img\b/.test(page), "no <img> tag left: every picture is one of our own components");
  assert.ok(!/https?:\/\/[^"'\s)]*\.(png|jpe?g|webp|gif|svg|avif)/i.test(page + visuals), "no remote image file anywhere");
});

test("the other product's name appears nowhere on the page or its pictures", () => {
  assert.ok(!/prezence/i.test(page + visuals));
});

test("every picture is made from our own components and is hidden from screen readers", () => {
  for (const name of ["DashboardPreview", "QrTablet", "PhoneCheckIn", "TeamList", "DoorPairing", "ActivityPanel", "LeavePanel", "NoticePanel", "RecordsPanel"]) {
    assert.ok(visuals.includes(`export function ${name}`), name);
    assert.ok(page.includes(name), `${name} is used on the page`);
  }
  assert.ok(visuals.includes('from "@/components/dashboard/TodayPanel"'), "the dashboard picture is the real Today panel");
  assert.ok(visuals.includes('from "@/components/scan/ScanResultOverlay"'), "the phone picture is the real check-in confirmation");
  assert.ok(/aria-hidden/.test(visuals));
  // where a picture used to have alt text, the wrapper now carries a plain description
  assert.ok((page.match(/role="img"/g) ?? []).length >= 5);
  assert.ok((page.match(/aria-label=/g) ?? []).length >= 5);
});

test("the pictures cannot be clicked and use made-up people only", () => {
  assert.ok(visuals.includes("pointer-events-none"));
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(visuals), "no email address in the sample data");
});

test("the landing page still has its calls to action", () => {
  assert.ok(page.includes("Start Free Trial") && page.includes("Launch Live Kiosk"));
});
