import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const shell = read("src/components/AppShell.tsx");
const auth = read("src/routes/auth.tsx");
const landing = read("src/routes/index.tsx");
const css = read("src/styles.css");

test("sign-up and sign-in show where the Terms and the Privacy Policy are", () => {
  assert.ok(auth.includes("By continuing, you agree to the"));
  assert.ok(auth.includes('href="/terms"') && auth.includes('href="/privacy"'));
  assert.ok((auth.match(/target="_blank"/g) ?? []).length >= 2, "they open in a new tab so a half-filled form is not lost");
});

test("Terms and Privacy can be reached from inside the signed-in app", () => {
  assert.ok(shell.includes('to="/terms"') && shell.includes('to="/privacy"'));
});

test("keyboard users can skip the menu", () => {
  assert.ok(shell.includes('href="#main-content"') && shell.includes("Skip to main content"));
  assert.ok(shell.includes('id="main-content"') && shell.includes("tabIndex={-1}"), "the skip link has somewhere to land");
  assert.ok(shell.includes("sr-only focus:not-sr-only"), "it is hidden until it is focused");
});

test("a landing-page menu link no longer lands under the floating header", () => {
  const rule = css.slice(css.indexOf("#benefits,"));
  for (const id of ["benefits", "why", "capabilities", "teams", "pricing", "stories", "faq"]) {
    assert.ok(rule.includes(`#${id}`), `#${id} has the offset`);
    assert.ok(landing.includes(`id="${id}"`), `#${id} exists on the page`);
  }
  assert.ok(/scroll-margin-top:\s*6\.5rem/.test(rule));
});

test("footer links go where they say, and the old tagline is gone", () => {
  assert.ok(!landing.includes("Security Architecture"), "no link that only jumped to the FAQ");
  assert.ok(!read("src/components/PublicFooter.tsx").includes("Modern Attendance for Modern Teams"));
});
