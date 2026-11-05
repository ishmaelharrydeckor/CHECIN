import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifySendErrorMessage } from "../../src/lib/verify-email-screens.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("Firebase's 'too many requests' becomes a plain wait; unknown errors get the default", () => {
  assert.match(verifySendErrorMessage("auth/too-many-requests"), /wait a few minutes/);
  assert.match(verifySendErrorMessage("auth/network-request-failed"), /No connection/);
  assert.match(verifySendErrorMessage("auth/anything-else"), /couldn't send the email/);
  assert.match(verifySendErrorMessage(undefined), /couldn't send the email/);
});

test("the Account page shows the banner, and it is built to never block anything", () => {
  const account = read("src/routes/_authenticated/account.tsx");
  assert.ok(account.includes("<VerifyEmailBannerCard"));
  const card = read("src/components/verify/VerifyEmailBannerCard.tsx");
  assert.ok(card.includes("sendEmailVerification(current)"), "Firebase's own email, no new server route");
  assert.ok(!/fetch\(/.test(card), "nothing is sent to our server");
  assert.ok(card.includes("emailVerified"), "verified is read from the sign-in itself");
  assert.ok(!/navigate|redirect|signOut/i.test(card), "it never moves or signs anyone out");
});

test("the preview page stays only until sign-up is rebuilt, and says it is temporary", () => {
  const src = read("src/routes/verify-preview.tsx");
  assert.match(src, /TEMPORARY PREVIEW/);
  assert.match(src, /noindex/);
});
