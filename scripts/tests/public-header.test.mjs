import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const header = read("src/components/PublicHeader.tsx");
const landing = read("src/routes/index.tsx");
const privacy = read("src/routes/privacy.tsx");
const terms = read("src/routes/terms.tsx");

test("the landing page and both legal pages use the one shared header", () => {
  for (const [name, text] of [["landing", landing], ["privacy", privacy], ["terms", terms]]) {
    assert.equal((text.match(/<PublicHeader \/>/g) ?? []).length, 1, `${name} uses it once`);
    assert.ok(!text.includes("<header"), `${name} no longer draws its own header`);
  }
});

test("on a phone the section links are reachable from a menu", () => {
  assert.ok(header.includes('aria-label="Open menu"') && header.includes("aria-expanded={menuOpen}"));
  assert.ok(header.includes("md:hidden") && header.includes("hidden md:flex"), "menu button on phones, bar links on computers");
  assert.ok(header.includes("<Sheet open={menuOpen}") && header.includes('side="right"'));
});

test("the phone menu offers every section, plus sign in and get started", () => {
  for (const hash of ["benefits", "why", "capabilities", "pricing", "faq"]) {
    assert.ok(header.includes(`hash: "${hash}"`), `${hash} is in the menu list`);
  }
  assert.equal((header.match(/PUBLIC_NAV\.map/g) ?? []).length, 2, "the bar and the phone menu draw the same list");
  assert.ok(header.includes("Get Started") && header.includes("Sign in"));
});

test("the menu closes when a link is tapped, and it is announced properly", () => {
  assert.ok((header.match(/onClick=\{closeMenu\}/g) ?? []).length >= 3, "each phone-menu link closes it");
  assert.ok(header.includes('<SheetTitle className="sr-only">Menu</SheetTitle>'), "the panel has a name for screen readers");
  assert.ok((header.match(/aria-label="Sections"/g) ?? []).length === 2, "both navigation areas are labelled");
});

test("links work from any page that uses the header", () => {
  assert.ok(header.includes("href={`/#${item.hash}`}"), "links point at the landing page's sections");
  for (const id of ["benefits", "why", "capabilities", "pricing", "faq"]) {
    assert.ok(landing.includes(`id="${id}"`), `#${id} exists on the landing page`);
  }
});

test("the legal pages start below the floating header", () => {
  for (const text of [privacy, terms]) assert.ok(text.includes("pt-32 sm:pt-36"));
});

test("the phone menu buttons are comfortable to tap", () => {
  assert.ok(header.includes("min-h-12") && header.includes("h-12"), "links and buttons are at least 48 px tall");
  assert.ok(header.includes("size-[43px]"), "the menu button is as tall as the other header buttons");
});
