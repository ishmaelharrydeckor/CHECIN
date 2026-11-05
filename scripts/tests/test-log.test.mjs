import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const log = read("docs/TEST-LOG.md");
const board = read("docs/TEAM-TASKS.md");

test("the test log has a row for each round, says what is still open, and never counts an owner-only part as tested by a tester", () => {
  for (const round of ["| 5 |", "| 6 |", "| 7 |"]) assert.ok(log.includes(round), round);
  assert.ok(log.includes("Part H (owner-only"));
  assert.ok(log.includes("Part K (owner-only"));
  assert.ok(log.includes("a tester's P on them is not enough"));
});

test("a round that depends on code not yet merged is marked to be repeated", () => {
  assert.ok(log.includes("part I (the timezone warning)") && log.includes("repeat part I once it is merged"));
});

test("the task board points to the log instead of saying not yet tested for features the rounds cover", () => {
  for (const id of ["| 1.2 |", "| 2.1 |", "| 2.3 |", "| 2.4 |"]) {
    const row = board.split("\n").find((l) => l.startsWith(id));
    assert.ok(row && row.includes("TEST-LOG.md") && !row.includes("not yet tested"), id);
  }
});

test("the next round asks for what was seen on each test, with a name, date and device", () => {
  assert.ok(log.includes("one line of what was seen on each test, plus the tester's name, date and device"));
});
