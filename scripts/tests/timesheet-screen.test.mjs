import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayLabel } from "../../src/lib/timesheet-export.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const view = read("src/components/timesheet/TimesheetView.tsx");
const hook = read("src/components/timesheet/useTimesheet.ts");
const files = read("src/lib/timesheet-files.ts");

test("days are written as calendar days, never through the device's timezone", () => {
  assert.equal(dayLabel("2026-11-02"), "Mon 2 Nov");
  assert.equal(dayLabel("2026-12-31"), "Thu 31 Dec");
  assert.equal(dayLabel("2026-03-01"), "Sun 1 Mar");
  assert.equal(dayLabel("nonsense"), "nonsense");
});

// ---- it only displays: nothing is worked out in the screen (style guide 7b.4) ---------------------------------

test("the screen does no hours arithmetic of its own and holds none of the old estimate rules", () => {
  for (const src of [view, hook]) {
    assert.doesNotMatch(src, /getHours|getMinutes|toLocale(Time|Date)?String|toISOString\(\)\.split/);
    assert.doesNotMatch(src, /\/api\/attendance\/history/);
    assert.doesNotMatch(src, /\* 8\b|8\.0|09:15/);
  }
  // The only calculations are the shared pure ones: writing minutes as text, and the strip for the people on screen.
  assert.match(view, /formatHoursMinutes/);
  assert.match(view, /timesheetSummary/);
});

test("it loads only when asked, from the one route, with the signed-in person's token and only the two dates", () => {
  assert.match(hook, /\/api\/reports\/timesheet\?/);
  assert.match(hook, /getIdToken\(\)/);
  assert.match(hook, /new URLSearchParams\(\{ from: range\.from, to: range\.to \}\)/);
  assert.doesNotMatch(hook, /userId|orgId|managerId|employeeId/);
  assert.doesNotMatch(view + hook, /setInterval/, "no polling");
  assert.doesNotMatch(view, /useEffect\(\(\) => \{\s*void load\(/, "nothing loads when the page opens");
  assert.match(view, /Show timesheet/);
  assert.match(view, /onClick=\{\(\) => void load\(range\)\}/);
});

test("a newer request replaces an older one still on its way", () => {
  assert.match(hook, /latest\.current/);
  assert.match(hook, /mine !== latest\.current/);
});

// ---- the states and the rules of the data screens (style guide 7b) --------------------------------------------

test("every state is there: not asked yet, loading, error with retry, empty, no match, and filled", () => {
  assert.match(view, /Choose a period and press/);
  assert.match(view, /aria-busy="true"/);
  assert.match(view, /Try again/);
  assert.match(view, /No people to show for these days/);
  assert.match(view, /No one matches that/);
  assert.match(view, /PeopleTable/);
  assert.match(view, /PeopleCards/);
});

test("lists are bounded: 50 at a time, with a count and a Show more button", () => {
  assert.match(view, /const PAGE_SIZE = 50/);
  assert.match(view, /Showing \{list\.length\} of \{rows\.length\}/);
  assert.match(view, /Show more/);
});

test("it always says which days, and that the server's rows may be incomplete", () => {
  assert.match(view, /dayLabel\(data\.from\)/);
  assert.match(view, /data\.timezone/);
  assert.match(view, /may be incomplete/);
});

test("columns that do not apply are left out, and nothing is shown as a made-up number", () => {
  assert.match(view, /report\.breaksTracked \? \["Break"\]/);
  assert.match(view, /report\.anyExpected \? \["Expected", "Extra \/ short"\]/);
  assert.match(view, /report\.diaryTracked \? \["Diary hours \(approved\)"/);
  assert.match(view, /minutes === null \? "–"/, "no data is a dash");
  assert.match(view, /not approved overtime/);
});

test("the work diary stays in its own columns, apart from scanned hours", () => {
  assert.match(view, /Diary hours \(approved\)/);
  assert.match(view, /r\.diary\?\.approvedMinutes/);
  assert.doesNotMatch(view, /workedMinutes \+ .*diary|diary.*\+ .*workedMinutes/);
});

test("a person opens day by day in a dialog, with words as well as colour", () => {
  assert.match(view, /<Dialog /);
  assert.match(view, /No check-out/);
  assert.match(view, /Late, excused/);
  assert.match(view, /Left early/);
  assert.match(view, /STATUS_LABEL\[d\.status\]/);
});

test("it works on a phone: cards below desktop width, big buttons, no sideways scroll on the page", () => {
  assert.match(view, /min-width: 1024px/);
  assert.match(view, /See the days/);
  assert.match(view, /mt-2 h-10 w-full border-slate-200 text-xs/);
  assert.match(view, /break-words/);
});

// ---- the downloads ---------------------------------------------------------------------------------------------------

test("four downloads, all of what is on screen, and the heavy libraries load only when used", () => {
  for (const label of ["CSV", "Excel", "PDF", "Daily detail (CSV)"]) assert.ok(view.includes(`label="${label}"`), label);
  assert.match(view, /import\("@\/lib\/timesheet-files"\)/);
  assert.doesNotMatch(view, /from "@\/lib\/timesheet-files"/);
  assert.match(view, /filterReport\(/, "downloads follow the filter");
  assert.match(view, /shownReport/);
  assert.match(files, /import\("jspdf"\)/);
  assert.match(files, /import\("xlsx"\)/);
});

test("Excel keeps names as text and the details sheet carries the range and timezone", () => {
  assert.match(files, /i < 2 \? c : asNumber\(c\)/, "name and department are never turned into numbers");
  assert.match(files, /"Details"/);
  assert.match(files, /timesheetDetails\(report\)/);
});

test("no GPS, no old export helpers", () => {
  assert.doesNotMatch(view + hook + files, /geolocation|navigator\.geolocation/);
  assert.doesNotMatch(view, /exportToExcel|exportToCSV|exportToPDF/);
});
