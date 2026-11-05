import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The sign-in screen is the first thing a customer sees. It must speak plainly, and it must never show a
// visitor the name of our Firebase project or a link into our Firebase console.
const text = readFileSync("src/routes/auth.tsx", "utf8").replace(/\r\n/g, "\n");

test("no jargon on the sign-in screen", () => {
  for (const phrase of ["Zero GPS Spoofing", "Multi-tenant", "tenant", "PWA", "rotating QR tokens", "Tamper-Resistant"]) {
    assert.ok(!text.includes(phrase), `still says: ${phrase}`);
  }
});

test("visitors never see our Firebase project name or a console link", () => {
  assert.ok(!/checin-d172e/.test(text), "the production project name is not on the page");
  assert.ok(!/console\.firebase\.google\.com/.test(text), "no link into the Firebase console");
  assert.ok(!/Firebase Console/i.test(text.replace(/console\.error\([^)]*\)/g, "")), "no Firebase console instructions shown to users");
});

test("when Google sign-in is unavailable the visitor is told to use email", () => {
  assert.ok(text.includes("Use your email and password instead."));
  assert.ok(text.includes("Use your work email and password below."));
});

test("the screen avoids ampersands and shouty progress text", () => {
  assert.ok(!text.includes("Organization & Continue"));
  assert.ok(!text.includes("Authenticating...") && !text.includes("Creating Workspace..."));
});
