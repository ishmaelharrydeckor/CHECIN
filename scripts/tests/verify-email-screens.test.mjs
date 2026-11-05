import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  RESEND_COOLDOWN_SECONDS,
  clampSeconds,
  sendButtonState,
  sendErrorMessage,
} from "../../src/lib/verify-email-screens.ts";

test("the resend wait is one minute, as in the design", () => {
  assert.equal(RESEND_COOLDOWN_SECONDS, 60);
});

test("seconds are whole and never negative", () => {
  const cases = [
    [60, 60],
    [0, 0],
    [-5, 0],
    [1.2, 2],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    ["30", 0],
    [undefined, 0],
    [null, 0],
  ];
  for (const [input, expected] of cases) assert.equal(clampSeconds(input), expected, String(input));
});

test("the button is disabled while sending and during the wait, and enabled otherwise", () => {
  assert.deepEqual(sendButtonState("idle", 0, "Resend email"), { label: "Resend email", disabled: false });
  assert.deepEqual(sendButtonState("sending", 0, "Resend email"), { label: "Sending…", disabled: true });
  assert.deepEqual(sendButtonState("sending", 40, "Resend email"), { label: "Sending…", disabled: true });
  assert.deepEqual(sendButtonState("sent", 42, "Resend email"), { label: "Send again in 42s", disabled: true });
  assert.deepEqual(sendButtonState("sent", 0, "Resend email"), { label: "Resend email", disabled: false });
  assert.deepEqual(sendButtonState("error", 0, "Send verification email"), {
    label: "Send verification email",
    disabled: false,
  });
  assert.deepEqual(sendButtonState("sent", -3, "Resend email"), { label: "Resend email", disabled: false });
});

test("an error always has a plain sentence", () => {
  assert.match(sendErrorMessage(), /couldn't send/);
  assert.match(sendErrorMessage("   "), /couldn't send/);
  assert.equal(sendErrorMessage("Too many emails. Wait a few minutes."), "Too many emails. Wait a few minutes.");
});

const read = (p) => readFileSync(p, "utf8");
const files = [
  "src/components/verify/CheckYourEmailCard.tsx",
  "src/components/verify/FinishSetupScreen.tsx",
  "src/components/verify/VerifyEmailBanner.tsx",
  "src/components/verify/useCooldown.ts",
  "src/lib/verify-email-screens.ts",
  "src/routes/verify-preview.tsx",
];

test("the screens exist", () => {
  for (const f of files) assert.ok(existsSync(f), f);
});

test("screens only: no fetch, no Firebase, no passwords", () => {
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /\bfetch\(/, `${f} must not fetch`);
    assert.doesNotMatch(src, /from\s+["'][^"']*firebase/i, `${f} must not import Firebase`);
    assert.doesNotMatch(src, /password/i, `${f} must not handle passwords`);
  }
});

test("every state is on the preview route, and the route says it is temporary", () => {
  const src = read("src/routes/verify-preview.tsx");
  assert.match(src, /TEMPORARY PREVIEW/);
  assert.match(src, /noindex/);
  for (const status of ['"idle"', '"sending"', '"sent"', '"error"']) assert.ok(src.includes(status), status);
  for (const state of ['"working"', '"error"', '"expired"']) assert.ok(src.includes(state), state);
  assert.match(src, /VerifyEmailBanner verified email/, "the verified (hidden) banner is shown too");
});

test("the banner hides itself when verified, and each screen has its buttons", () => {
  assert.match(read("src/components/verify/VerifyEmailBanner.tsx"), /if \(verified\) return null/);
  const check = read("src/components/verify/CheckYourEmailCard.tsx");
  assert.match(check, /Wrong address\? Start over/);
  assert.match(check, /spam/);
  const finish = read("src/components/verify/FinishSetupScreen.tsx");
  assert.match(finish, /Try again/);
  assert.match(finish, /Start again/);
});
