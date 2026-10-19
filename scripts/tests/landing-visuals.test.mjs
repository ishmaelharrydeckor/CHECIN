import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The public landing page must not show another company's pictures or name. Its pictures are drawn
// from ChecIN's own components (src/components/landing/ProductVisuals.tsx), with made-up sample people.
const page = readFileSync("src/routes/index.tsx", "utf8").replace(/\r\n/g, "\n");
const visuals = readFileSync("src/components/landing/ProductVisuals.tsx", "utf8").replace(/\r\n/g, "\n");

test("no picture on the landing page is loaded from another site", () => {
  assert.ok(!/framerusercontent|framer\.website|framer\.com/i.test(page), "the template's image host is gone");
  // The only <img> tags allowed are our own self-hosted photos (see docs/IMAGE-LICENCES.md).
  const imgs = [...page.matchAll(/<img\b[\s\S]*?\/>/g)].map((m) => m[0]);
  for (const tag of imgs) assert.ok(/src="\/images\/(landing|product)\/[a-z0-9-]+\.webp"|src=\{tile\.src\}/.test(tag), `an image that is not ours: ${tag.slice(0, 70)}`);
  assert.ok(!/https?:\/\/[^"'\s)]*\.(png|jpe?g|webp|gif|svg|avif)/i.test(page + visuals), "no remote image file anywhere");
});

test("the other product's name appears nowhere on the page or its pictures", () => {
  assert.ok(!/prezence/i.test(page + visuals));
});

test("every picture is made from our own components and is hidden from screen readers", () => {
  for (const name of ["QrTablet", "DoorPairing", "ActivityPanel", "LeavePanel", "NoticePanel", "RecordsPanel"]) {
    assert.ok(visuals.includes(`export function ${name}`), name);
    assert.ok(page.includes(name), `${name} is used on the page`);
  }
  assert.ok(visuals.includes('from "@/components/dashboard/TodayPanel"'), "the dashboard picture is the real Today panel");
  assert.ok(/aria-hidden/.test(visuals));
  // where a picture used to have alt text, the wrapper now carries a plain description
  assert.ok((page.match(/role="img"/g) ?? []).length >= 4);
  assert.ok((page.match(/aria-label=/g) ?? []).length >= 4);
});

test("the pictures cannot be clicked and use made-up people only", () => {
  assert.ok(visuals.includes("pointer-events-none"));
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(visuals), "no email address in the sample data");
});

test("the landing page still has its calls to action", () => {
  assert.ok(page.includes("Start Free Trial") && page.includes("Launch Live Kiosk"));
});

test("every self-hosted photo is used on the page, with a description and sizes (no layout jump)", () => {
  assert.ok(page.includes("/images/product/dashboard.webp"), "the real dashboard screenshot is used");
  for (const file of ["checkin-phone", "team-lagos-office", "team-laptop", "health-nurses", "manager-tablet"]) {
    assert.ok(page.includes(`/images/landing/${file}.webp`), `${file} is placed on the page`);
  }
  const tags = [...page.matchAll(/<img\b[\s\S]*?\/>/g)].map((m) => m[0]);
  assert.equal(tags.length, 4, "two benefit cards, the team strip, and the hero dashboard screenshot");
  for (const tag of tags) {
    assert.ok(/alt=(\{tile\.alt\}|"[^"]{12,}")/.test(tag), "a real description");
    assert.ok(/width=/.test(tag) && /height=/.test(tag), "width and height");
    assert.ok(/loading="lazy"/.test(tag), "lazy loading");
  }
});

test("the Why ChecIN cards show the real kiosk screens, with made-up sample data", () => {
  assert.ok(visuals.includes("/images/product/kiosk-pairing.webp") && page.includes("/images/product/kiosk-code.webp"));
  assert.ok(visuals.includes("export function TabletScreen") && /aria-hidden/.test(visuals.slice(visuals.indexOf("export function TabletScreen"))));
  assert.ok(page.includes("<CountdownRing compact />"), "the fifteen second ring stays beside the tablet");
});

test("wording that came from the template, and claims the product cannot back up, are gone", () => {
  const text = page.slice(page.indexOf("const CAPABILITY_DATA"));
  for (const phrase of [
    "Less Chasing. More Clarity",
    "One Platform For Everyone",
    "Core Capabilities",
    "Real Teams. Verified Attendance",
    "Modern Attendance For Modern Teams",
    "Live live",
    "Cryptographically",
    "balance tracking",
    "Coming soon",
  ]) {
    assert.ok(!text.includes(phrase), `still says: ${phrase}`);
  }
});

test("the FAQ answers the doubts people have, in plain words and without promising what is not built", () => {
  for (const question of [
    "Does ChecIN track where my people are?",
    "What if the internet goes down?",
    "What about people who work from home?",
  ]) {
    assert.ok(page.includes(question), question);
  }
  const faq = page.slice(page.indexOf("const FAQ_ITEMS"), page.indexOf("function LandingPage"));
  assert.ok(!/custom claims|default-deny|multi-tenant|physical device secret/i.test(faq), "no jargon in the answers");
  assert.equal((faq.match(/id: \d+,/g) ?? []).length, 8, "eight questions");
});
