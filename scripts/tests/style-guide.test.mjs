import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const guide = read("docs/UI-STYLE-GUIDE.md");
const instructions = read("docs/CLAUDE-PROJECT-INSTRUCTIONS.md");

test("every file the style guide points a teammate to exists, so the guide never sends anyone to a missing screen", () => {
  const paths = [...guide.matchAll(/`(src\/[A-Za-z0-9_./$-]+\.(?:tsx|ts))`/g)].map((m) => m[1]);
  assert.ok(paths.length >= 10, "the guide names its reference screens");
  const missing = paths.filter((p) => !existsSync(p));
  assert.deepEqual(missing, []);
});

test("the guide has the Phase 4 patterns and the data rules they depend on", () => {
  for (const heading of ["## 5b. Patterns added in Phase 4", "## 7b. Showing data"]) assert.ok(guide.includes(heading), heading);
  for (const pattern of ["Filter chips", "Percentage bar", "Table on a desktop, cards on a phone", "Report card", "Day picker", "Detail dialog", "Settings card with a switch"]) {
    assert.ok(guide.includes(`**${pattern}`), pattern);
  }
  for (const rule of ["Words, never colour alone", "No data is a dash", "Draw only what is built", "Keep money, hours and decisions apart"]) {
    assert.ok(guide.includes(rule), rule);
  }
});

test("the day-status colours in the guide are the ones the screens use", () => {
  const roster = read("src/lib/team-roster.ts");
  for (const cls of ["bg-[#CBEED3] text-[#0E2322]", "bg-amber-100 text-amber-900", "bg-slate-100 text-slate-700"]) {
    assert.ok(guide.includes(cls), `guide: ${cls}`);
    assert.ok(roster.includes(cls), `roster: ${cls}`);
  }
});

test("the percentage bar in the guide matches the real one", () => {
  const screen = read("src/components/dashboard/TeamRoster.tsx");
  for (const part of ['role="meter"', "h-1.5", "bg-slate-100", "bg-emerald-600", "aria-valuetext"]) {
    assert.ok(screen.includes(part), `screen: ${part}`);
  }
  for (const part of ['role="meter"', "h-1.5 rounded-full bg-slate-100", "bg-emerald-600", "aria-valuetext"]) {
    assert.ok(guide.includes(part), `guide: ${part}`);
  }
});

test("teammates are told about the new patterns, and that the shell is the owner's", () => {
  assert.ok(instructions.includes("section 5b") && instructions.includes("section 7b"));
  assert.ok(instructions.includes("never by colour alone"));
  assert.ok(instructions.includes("breadcrumbs, count badges and \"Jump to\" belong to the owner"));
});

test("the guide still forbids the things the app never does", () => {
  for (const rule of ["No new colors", "No new UI libraries", "No emoji"]) assert.ok(guide.includes(rule), rule);
  assert.ok(!/geolocation|GPS/i.test(guide.replace(/No GPS/gi, "")), "no GPS guidance of any kind");
});
