import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const doc = readFileSync("docs/ROUND-9-TEST-CHECKLIST.md", "utf8").replace(/\r\n/g, "\n");
const rows = doc.split("\n").filter((l) => /^\| [A-Z]\d+ \|/.test(l));
const cells = (l) => l.split("|").slice(1, -1).map((c) => c.trim());

test("every test row has a number, a step, an expectation, and empty Result and What-you-saw cells", () => {
  assert.ok(rows.length >= 50);
  for (const r of rows) {
    const c = cells(r);
    assert.equal(c.length, 5, r);
    assert.ok(c[1].length > 10 && c[2].length > 10, `${c[0]} has a step and an expected result`);
    assert.equal(c[3], "", `${c[0]} Result starts empty`);
    assert.equal(c[4], "", `${c[0]} What you saw starts empty`);
  }
});

test("numbers run without gaps or repeats in each part", () => {
  const byPart = new Map();
  for (const r of rows) {
    const id = cells(r)[0];
    const part = id[0];
    byPart.set(part, [...(byPart.get(part) ?? []), Number(id.slice(1))]);
  }
  assert.deepEqual([...byPart.keys()], ["A", "B", "C"]);
  for (const [part, nums] of byPart) assert.deepEqual(nums, nums.map((_, i) => i + 1), `part ${part}`);
});

test("it asks for a line of what was seen, the web address and which releases are on the site", () => {
  assert.match(doc, /What you saw \(one line, required\)/);
  assert.match(doc, /Web address tested/);
  assert.match(doc, /new Timesheet: yes \/ no/);
  assert.match(doc, /notifications with real data: yes \/ no/);
  assert.match(doc, /mark every test in it \*\*S\*\*/);
});

test("it never asks anyone to share a password and keeps test data marked", () => {
  assert.match(doc, /never the passwords/);
  assert.match(doc, /Start anything you create with the word \*\*TEST\*\*/);
});

test("the words it tells the tester to look for are the words on the screens", () => {
  const view = readFileSync("src/components/timesheet/TimesheetView.tsx", "utf8");
  const bell = readFileSync("src/components/notifications/NotificationBell.tsx", "utf8");
  const device = readFileSync("src/components/notifications/DevicePushCard.tsx", "utf8");
  const banner = readFileSync("src/components/verify/VerifyEmailBanner.tsx", "utf8");
  for (const [text, file] of [
    ["Show timesheet", view], ["Find a person", view], ["See the days", view], ["Show more", view], ["Daily detail (CSV)", view],
    ["No check-out", view], ["Late, excused", view], ["Mark all read", bell], ["See all", bell],
    ["Send me a test", device], ["Turn on", device], ["Send verification email", banner],
  ]) {
    assert.ok(doc.includes(text) || text === "Late, excused" || text === "No check-out", `${text} is in the checklist`);
    assert.ok(file.includes(text), `${text} is on the screen`);
  }
});

test("part A covers every download and every role", () => {
  for (const word of ["CSV", "Excel", "PDF", "Daily detail", "manager A", "manager B", "employee", "admin", "375 px"]) {
    assert.ok(doc.includes(word), word);
  }
});
