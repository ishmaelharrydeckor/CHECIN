import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Round 8 holds only what has not been tested. It must stay honest about that, ask for evidence on every test, and
// quote only words that are on screen.
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const checklist = read("docs/ROUND-8-TEST-CHECKLIST.md");

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

test("every test row asks for the one line of what the tester saw, and the instructions say a blank line means not done", () => {
  const headers = checklist.match(/\| # \| What to do \| What should happen \| Result \| What you saw \(one line, required\) \|/g) ?? [];
  assert.equal(headers.length, 5, "all five tables use the stricter column");
  assert.ok(!checklist.includes("| Result | Notes |"), "no table uses the old Notes column");
  assert.ok(checklist.includes("A blank line means the test was not done"));
  assert.ok(checklist.includes("If a part says its release is not on the test site, mark every test in it **S**"));
});

test("it names the tester, the web address and which releases are on the test site before anything starts", () => {
  for (const field of ["**Tester:**", "**Device and browser:**", "**Web address tested:**", "scanner changes: yes / no", "timezone warning: yes / no", "keyboard shortcuts: yes / no"]) {
    assert.ok(checklist.includes(field), field);
  }
});

test("test numbers are unique and there is nothing in it that an earlier round already covers", () => {
  const ids = [...checklist.matchAll(/^\| ([A-E]\d+) \|/gm)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 50);
  for (const earlier of ["Get set up", "reports hub", "Report card", "roster filters", "work-diary session"]) {
    assert.ok(!checklist.includes(earlier), `${earlier} belongs to an earlier round`);
  }
  assert.ok(checklist.includes("see [TEST-LOG.md](TEST-LOG.md)") || checklist.includes("TEST-LOG.md"));
});

test("the owner-only part is the owner's, and says so, and alerts are not claimed as tested", () => {
  assert.ok(checklist.includes("## D. Owner only: confirm these yourself"));
  assert.ok(checklist.includes("Testers cannot do these"));
  assert.ok(checklist.includes("alerts are not tested in this round"));
});

test("words quoted from screens that exist on the test site are on those screens", () => {
  for (const phrase of ["You're checked in", "You're checked out", "a moment ago", "Find a person", "Invite staff"]) {
    assert.ok(src.includes(phrase), phrase);
  }
});

test("words quoted from the two unmerged releases are checked as soon as that code is present", () => {
  if (existsSync("src/components/TimezoneNotice.tsx")) {
    for (const p of ["Confirm your timezone", "Choose timezone in Settings", "Keep "]) assert.ok(src.includes(p), p);
  }
  if (existsSync("src/components/shortcuts/ShortcutsHelp.tsx")) {
    for (const p of ["Keyboard shortcuts", "Reviewing the work diary", "Daily work", "Approve"]) assert.ok(src.includes(p), p);
  }
  assert.ok(checklist.includes('"Confirm your timezone"') && checklist.includes('"Keyboard shortcuts"'));
});

test("the keyboard rules it tests are the ones the product promises", () => {
  for (const rule of ["**g** then **r**", "**Ctrl+K**", "**Ctrl+B**", "Ctrl+R", "F5", "**grjf**", "never fire while you are typing"]) {
    assert.ok(checklist.includes(rule), rule);
  }
});
