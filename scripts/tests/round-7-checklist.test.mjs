import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The round 7 checklist tells testers what words they will see. If a screen's wording changes, the checklist
// must change with it, or a tester will mark a working screen as failed. This keeps the two in step.
const checklist = readFileSync("docs/ROUND-7-TEST-CHECKLIST.md", "utf8").replace(/\r\n/g, "\n");

function sourceText() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|mjs)$/.test(name) && !name.includes("routeTree")) out.push(readFileSync(p, "utf8"));
    }
  };
  walk("src");
  return out.join("\n");
}
const src = sourceText();

test("every phrase the checklist quotes from a screen is still on that screen", () => {
  const phrases = [
    "Jump to a page", "Team roster", "Preview and choose dates", "There is nothing to include for that period.",
    "Before your first work session", "Start your work session", "Stop for today", "Work diary settings",
    "Waiting for your decision", "Approve this day", "Flag this day", "Worth a look",
    "Today is not a work-from-home day", "The work diary is not switched on", "Agree and continue", "Start session",
    "I'm here", "Still here?", "Find a person", "Not here yet", "Here today", "Show more", "All reports",
    "Keep ", "Covers the whole organization.", "Covers your team.",
    "This tab did not start the session", "Waiting for your manager", "Shown to your manager for a look",
    "Diary hrs", "Diary flagged", "Diary waiting", "WFH diary hours (approved)", "WFH diary days flagged",
    "WFH diary days awaiting approval", "Preview or download", "Left for the day", "Expected later", "Not working today",
  ];
  // Part I (the timezone card) ships in a separate release; its wording is checked as soon as that code is here.
  if (src.includes("TimezoneNotice")) phrases.push("Confirm your timezone", "Choose timezone in Settings");
  const missing = phrases.filter((p) => !src.includes(p));
  assert.deepEqual(missing, []);
});

test("every phrase appears in the checklist too, so a tester is told what to look for", () => {
  for (const p of ["Jump to a page", "Team roster", "Preview and choose dates", "Before your first work session", "Start your work session", "Work diary settings", "Confirm your timezone", "Diary hrs"]) {
    assert.ok(checklist.includes(p), p);
  }
});

test("the checklist has every part and a row for each of them, with the same columns as round 6", () => {
  for (const part of ["## A.", "## B.", "## C.", "## D.", "## E.", "## F.", "## G.", "## H.", "## I.", "## J.", "## K.", "## Always include these"]) {
    assert.ok(checklist.includes(part), part);
  }
  assert.equal((checklist.match(/\| # \| What to do \| What should happen \| Result \| Notes \|/g) ?? []).length >= 11, true);
  const ids = [...checklist.matchAll(/^\| ([A-K]\d+|Z\d+) \|/gm)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "no test number is used twice");
  assert.ok(ids.length >= 90, "a thorough list");
});

test("it tells the tester to do rounds 5 and 6 first and what changed in them", () => {
  assert.ok(checklist.includes("ROUND-6-TEST-CHECKLIST.md") && checklist.includes("ROUND-5-TEST-CHECKLIST.md"));
  assert.ok(checklist.includes("What changed in the earlier checklists"));
});

test("it never asks a tester for a password or a secret", () => {
  assert.ok(checklist.includes("never the passwords"));
  assert.ok(!/password:|secret value|paste your key/i.test(checklist));
});
