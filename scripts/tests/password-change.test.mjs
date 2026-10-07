import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePasswordChange,
  hasPasswordSignIn,
  describePasswordChangeError,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "../../src/lib/password-change.ts";

const ok = { current: "oldpass1", next: "newpass2", confirm: "newpass2" };

test("validatePasswordChange: accepts a valid change", () => {
  assert.equal(validatePasswordChange(ok), null);
});

test("validatePasswordChange: each missing field is reported", () => {
  assert.match(validatePasswordChange({ ...ok, current: "" }), /current password/i);
  assert.match(validatePasswordChange({ ...ok, next: "", confirm: "" }), /new password/i);
  assert.match(validatePasswordChange({ ...ok, confirm: "" }), /confirm/i);
});

test("validatePasswordChange: length limits match the sign-up rule", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 6);
  const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
  assert.match(validatePasswordChange({ current: "oldpass1", next: short, confirm: short }), /at least 6/);
  const exact = "a".repeat(MIN_PASSWORD_LENGTH);
  assert.equal(validatePasswordChange({ current: "oldpass1", next: exact, confirm: exact }), null);
  const long = "a".repeat(MAX_PASSWORD_LENGTH + 1);
  assert.match(validatePasswordChange({ current: "oldpass1", next: long, confirm: long }), /at most/);
});

test("validatePasswordChange: new and confirm must match, new must differ from current", () => {
  assert.match(validatePasswordChange({ ...ok, confirm: "different" }), /don't match/);
  assert.match(validatePasswordChange({ current: "samepass", next: "samepass", confirm: "samepass" }), /different/);
});

test("validatePasswordChange: spaces count as characters and are not trimmed", () => {
  assert.equal(validatePasswordChange({ current: "oldpass1", next: "abc def", confirm: "abc def" }), null);
  assert.match(validatePasswordChange({ current: "oldpass1", next: "abc def", confirm: "abc def " }), /don't match/);
});

test("hasPasswordSignIn: only true when the password provider is present", () => {
  assert.equal(hasPasswordSignIn(["password"]), true);
  assert.equal(hasPasswordSignIn(["google.com", "password"]), true);
  assert.equal(hasPasswordSignIn(["google.com"]), false);
  assert.equal(hasPasswordSignIn([]), false);
  assert.equal(hasPasswordSignIn(undefined), false);
  assert.equal(hasPasswordSignIn(null), false);
});

test("describePasswordChangeError: friendly messages, never echoes input", () => {
  assert.match(describePasswordChangeError("auth/wrong-password"), /incorrect/);
  assert.match(describePasswordChangeError("auth/invalid-credential"), /incorrect/);
  assert.match(describePasswordChangeError("auth/too-many-requests"), /wait/i);
  assert.match(describePasswordChangeError("auth/weak-password"), /weak/);
  assert.match(describePasswordChangeError("auth/requires-recent-login"), /sign back in/);
  assert.match(describePasswordChangeError("auth/network-request-failed"), /connection/);
  assert.match(describePasswordChangeError("auth/something-new"), /try again/);
  assert.match(describePasswordChangeError(undefined), /try again/);
});
