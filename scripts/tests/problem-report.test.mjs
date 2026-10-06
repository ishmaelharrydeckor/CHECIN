import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_IMAGE_BYTES,
  MESSAGE_MAX,
  base64ByteLength,
  cleanText,
  isPlatformOwner,
  notificationText,
  parsePlatformOwners,
  pathOnly,
  validateImageBase64,
  validateReportInput,
  validateStatusUpdate,
} from "../../src/lib/problem-report.ts";

const good = { category: "broken", message: "The scan button does nothing", page: "/scan", userAgent: "UA", viewport: "390x844" };

test("validateReportInput: accepts a normal report", () => {
  const r = validateReportInput(good);
  assert.equal(r.ok, true);
  assert.equal(r.value.category, "broken");
  assert.equal(r.value.page, "/scan");
  assert.equal(r.value.viewport, "390x844");
});

test("validateReportInput: refuses missing, wrong or too-short input", () => {
  assert.equal(validateReportInput(null).ok, false);
  assert.equal(validateReportInput({ ...good, category: "hacked" }).ok, false);
  assert.equal(validateReportInput({ ...good, category: undefined }).ok, false);
  assert.equal(validateReportInput({ ...good, message: "hi" }).ok, false);
  assert.equal(validateReportInput({ ...good, message: "     " }).ok, false);
  assert.equal(validateReportInput({ ...good, message: 42 }).ok, false);
});

test("validateReportInput: caps the message length", () => {
  assert.equal(validateReportInput({ ...good, message: "a".repeat(MESSAGE_MAX) }).ok, true);
  assert.equal(validateReportInput({ ...good, message: "a".repeat(MESSAGE_MAX + 1) }).ok, false);
});

test("validateReportInput: identity fields in the body are ignored, never copied through", () => {
  const r = validateReportInput({ ...good, uid: "someone-else", orgId: "other-org", role: "org_admin" });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value).sort(), ["category", "message", "page", "userAgent", "viewport"]);
});

test("cleanText: strips control characters, keeps new lines, trims", () => {
  assert.equal(cleanText("  a\u0000b\u0007c\nd\r\ne  ", 100), "abc\nd\ne");
  assert.equal(cleanText("x".repeat(50), 10).length, 10);
  assert.equal(cleanText(undefined, 10), "");
});

test("pathOnly: keeps only the path, never a query string or address", () => {
  assert.equal(pathOnly("/dashboard?token=SECRET#top"), "/dashboard");
  assert.equal(pathOnly("https://evil.example/x"), "");
  assert.equal(pathOnly("javascript:alert(1)"), "");
  assert.equal(pathOnly("/a/" + "b".repeat(500)).length, 200);
});

test("viewport must look like WIDTHxHEIGHT or it is dropped", () => {
  assert.equal(validateReportInput({ ...good, viewport: "390x844" }).value.viewport, "390x844");
  assert.equal(validateReportInput({ ...good, viewport: "<script>" }).value.viewport, "");
});

test("parsePlatformOwners: only well-formed ids, and nothing means nobody", () => {
  assert.deepEqual([...parsePlatformOwners("abc123XYZ, def456UVW ,")].sort(), ["abc123XYZ", "def456UVW"]);
  assert.equal(parsePlatformOwners("").size, 0);
  assert.equal(parsePlatformOwners(undefined).size, 0);
  assert.equal(parsePlatformOwners("a,b, ,*").size, 0); // too short or odd characters are ignored
});

test("isPlatformOwner: exact match only; empty or missing is never an owner", () => {
  const owners = parsePlatformOwners("ownerUid12345");
  assert.equal(isPlatformOwner("ownerUid12345", owners), true);
  assert.equal(isPlatformOwner("ownerUid1234", owners), false);
  assert.equal(isPlatformOwner("OWNERUID12345", owners), false);
  assert.equal(isPlatformOwner("", owners), false);
  assert.equal(isPlatformOwner(undefined, owners), false);
  assert.equal(isPlatformOwner("ownerUid12345", new Set()), false);
});

// a tiny valid-looking JPEG header, base64
const jpegB64 = (n) => {
  const buf = Buffer.alloc(n, 1);
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  return buf.toString("base64");
};

test("validateImageBase64: accepts a JPEG within the limit", () => {
  const r = validateImageBase64(jpegB64(10_000));
  assert.equal(r.ok, true);
  assert.equal(r.value.bytes, 10_000);
  assert.equal(base64ByteLength(jpegB64(10_001)), 10_001);
});

test("validateImageBase64: refuses too large, not a JPEG, data URLs and junk", () => {
  assert.equal(validateImageBase64(jpegB64(MAX_IMAGE_BYTES + 100)).ok, false);
  assert.equal(validateImageBase64(Buffer.from("<svg onload=alert(1)>").toString("base64")).ok, false); // not a JPEG
  assert.equal(validateImageBase64("data:image/jpeg;base64," + jpegB64(100)).ok, false);
  assert.equal(validateImageBase64("not base64!!").ok, false);
  assert.equal(validateImageBase64("").ok, false);
  assert.equal(validateImageBase64(12345).ok, false);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100)]).toString("base64");
  assert.equal(validateImageBase64(png).ok, false);
});

test("validateStatusUpdate: only known statuses, a sane id, and something to change", () => {
  assert.equal(validateStatusUpdate({ id: "abcdefghij1234", status: "seen" }).ok, true);
  assert.equal(validateStatusUpdate({ id: "abcdefghij1234", note: "fixed in #50" }).ok, true);
  assert.equal(validateStatusUpdate({ id: "abcdefghij1234", status: "deleted" }).ok, false);
  assert.equal(validateStatusUpdate({ id: "../etc", status: "seen" }).ok, false);
  assert.equal(validateStatusUpdate({ id: "abcdefghij1234" }).ok, false);
  assert.equal(validateStatusUpdate(null).ok, false);
});

test("notificationText: never includes the person's message", () => {
  const n = notificationText({ category: "numbers", role: "manager", page: "/dashboard" });
  assert.match(n.title, /numbers look wrong/);
  assert.match(n.body, /a manager on \/dashboard/);
  assert.doesNotMatch(n.body, /password|secret/i);
});
