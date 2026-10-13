import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Archived shifts are never deleted, so the shift list and the active-shift cap must ask the database
// for active shifts only; a mixed read of the first 200 shifts could hide active ones.
test("the shift routes read active shifts with a database filter, not by filtering a mixed page", () => {
  const src = readFileSync("src/routes/api/shifts/index.ts", "utf8");
  const filtered = src.match(/\.where\("archived", "==", (false|true)\)/g) ?? [];
  assert.ok(filtered.length >= 3, "list (active), list (archived) and the cap check must filter by archived");
  assert.ok(!/d\.data\(\)\.archived !== true/.test(src), "the active count must not be worked out from a mixed read");
  assert.ok(!/\.filter\(\(row\) => wantArchived/.test(src), "the list must not filter a mixed page after reading it");
});

test("a person's profile name is capped before it is copied onto assignments", () => {
  const src = readFileSync("src/routes/api/shifts/assignments.ts", "utf8");
  assert.ok(src.includes(".slice(0, 80)"), "the copied name must be capped at 80 characters");
});
