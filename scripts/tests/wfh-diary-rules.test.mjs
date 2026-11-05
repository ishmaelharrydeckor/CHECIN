import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The diary's collections hold signing-key hashes, interval counts and signed consent text. Nothing in a browser
// may read or write them: every view goes through /api/wfh-diary. The default rule would already deny them, but
// every collection gets its own explicit rule (AGENTS.md), so a future change to the default cannot open them.
const rules = readFileSync("firestore.rules", "utf8").replace(/\r\n/g, "\n");
const server = readFileSync("src/lib/wfh-diary.server.ts", "utf8");

const names = [...server.matchAll(/export const DIARY_[A-Z]+ = "([a-z_]+)";/g)].map((m) => m[1]);

function blockFor(name) {
  const start = rules.indexOf(`match /${name}/`);
  if (start < 0) return null;
  const end = rules.indexOf("\n    }", start);
  return rules.slice(start, end + 6);
}

test("the diary uses exactly the four collections these rules cover", () => {
  assert.deepEqual([...names].sort(), ["diary_consents", "wfh_diary_days", "wfh_diary_intervals", "wfh_diary_sessions"]);
});

test("each diary collection has its own explicit rule that denies every client read and write", () => {
  for (const name of names) {
    const block = blockFor(name);
    assert.ok(block, `${name} has an explicit rule`);
    assert.ok(block.includes("allow read, write: if false;"), `${name} denies reads and writes`);
    assert.equal((block.match(/allow /g) ?? []).length, 1, `${name} has no other allow line`);
    assert.ok(!/if (true|request\.auth)/.test(block), `${name} never allows anything`);
  }
});

test("the explicit rules come before the catch-all default", () => {
  const catchAll = rules.indexOf("match /{document=**}");
  for (const name of names) assert.ok(rules.indexOf(`match /${name}/`) < catchAll, `${name} is above the default`);
});
