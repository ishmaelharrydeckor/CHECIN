import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { HUB_REPORTS, HUB_REVIEWS, PRESETS, PRESET_LABEL, presetRange, rangeDays, scopeText } from "../../src/lib/reports-hub.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ---------------------------------------------------------------- ready-made periods
test("last 7 and last 14 days count back from today and include today", () => {
  assert.deepEqual(presetRange("last7", "2026-10-20"), { from: "2026-10-14", to: "2026-10-20" });
  assert.deepEqual(presetRange("last14", "2026-10-20"), { from: "2026-10-07", to: "2026-10-20" });
  assert.equal(rangeDays(presetRange("last7", "2026-10-20")), 7);
  assert.equal(rangeDays(presetRange("last14", "2026-10-20")), 14);
});

test("ranges cross month and year ends correctly", () => {
  assert.deepEqual(presetRange("last7", "2026-01-03"), { from: "2025-12-28", to: "2026-01-03" });
  assert.deepEqual(presetRange("last14", "2028-03-05"), { from: "2028-02-21", to: "2028-03-05" });
});

test("this month runs from the 1st to today; last month is the whole previous month", () => {
  assert.deepEqual(presetRange("thisMonth", "2026-10-20"), { from: "2026-10-01", to: "2026-10-20" });
  assert.deepEqual(presetRange("thisMonth", "2026-10-01"), { from: "2026-10-01", to: "2026-10-01" });
  assert.deepEqual(presetRange("lastMonth", "2026-10-20"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(presetRange("lastMonth", "2026-03-10"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(presetRange("lastMonth", "2028-03-10"), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(presetRange("lastMonth", "2026-01-15"), { from: "2025-12-01", to: "2025-12-31" });
});

test("every ready-made period is within the 31 days a report allows, on every day of the year", () => {
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= 28; d++) {
      const today = new Date(Date.UTC(2027, m, d)).toISOString().slice(0, 10);
      for (const p of PRESETS) assert.ok(rangeDays(presetRange(p, today)) <= 31, `${p} on ${today}`);
    }
  }
});

test("every period has a plain name", () => {
  for (const p of PRESETS) assert.ok(PRESET_LABEL[p].length > 4, p);
});

// ---------------------------------------------------------------- the catalog
test("the hub lists the three reports, and only the register and ledger can be generated here", () => {
  assert.deepEqual(HUB_REPORTS.map((r) => r.id), ["timesheets", "register", "leave"]);
  assert.deepEqual(HUB_REPORTS.filter((r) => r.generate).map((r) => r.generate), ["register", "leave"]);
  assert.equal(HUB_REPORTS.find((r) => r.id === "timesheets").generate, undefined);
});

test("the reviews are the places a manager decides things", () => {
  assert.deepEqual(HUB_REVIEWS.map((r) => r.to), ["/late-arrivals", "/wfh-review"]);
});

test("the scope sentence says only what the server enforces", () => {
  assert.equal(scopeText(true), "Covers the whole organization.");
  assert.equal(scopeText(false), "Covers your team.");
});

// ---------------------------------------------------------------- the pages
const hubPage = read("src/routes/_authenticated/reports.index.tsx");
const hub = read("src/components/reports/ReportsHub.tsx");
const gen = read("src/components/reports/generateReport.ts");
const timesheets = read("src/routes/_authenticated/reports.timesheets.tsx");
const attendance = read("src/routes/_authenticated/attendance-reports.tsx");
const shell = read("src/components/AppShell.tsx");

test("the reports menu item now opens the hub, and the old timesheets page moved under it, unchanged in behaviour", () => {
  assert.ok(shell.includes('{ to: "/reports", label: "Reports", icon: FileBarChart }'));
  assert.ok(hubPage.includes('createFileRoute("/_authenticated/reports/")'));
  assert.ok(timesheets.includes('createFileRoute("/_authenticated/reports/timesheets")'));
  assert.ok(!existsSync("src/routes/_authenticated/reports.tsx"), "the old file would clash with the hub");
  assert.ok(timesheets.includes('<Link to="/reports">All reports</Link>'), "a way back to the hub");
});

test("everything under /reports is still closed to employees", () => {
  assert.ok(/MANAGER_ONLY_PATHS = \[[^\]]*"\/reports"/.test(shell), "the guard matches by prefix, so the new pages are covered");
  assert.ok(hubPage.includes("if (!isOrgAdmin && !isManager) return null;"));
});

test("generating asks the server, which decides who may and how much; the page sends only dates", () => {
  assert.ok(gen.includes("/api/reports/${kind}?${qs.toString()}"));
  assert.ok(gen.includes('new URLSearchParams({ from: range.from, to: range.to })'), "dates only");
  for (const forbidden of ["orgId", "managerId", "role", "uid"]) assert.ok(!gen.includes(forbidden), forbidden);
  assert.ok(gen.includes("There is nothing to include for that period."), "an empty report is said plainly, not downloaded");
});

test("the hub card says what happens: busy states, plain errors, period choice, and nothing is faked", () => {
  for (const text of ["Loader2", "toast.error(result.error)", 'htmlFor={`period-${report.id}`}', "Preview and choose dates"]) assert.ok(hub.includes(text), text);
  assert.ok(!/scheduled|schedule/i.test(hub + hubPage), "scheduled reports do not exist yet, so they are not drawn");
  assert.ok(!/setInterval/.test(hub + gen));
});

test("the preview opens the tab it is about, and anything else shows the register", () => {
  assert.ok(attendance.includes("validateSearch"));
  assert.ok(attendance.includes('search.tab === "leave" ? "leave"'));
  assert.ok(attendance.includes('useState<"register" | "leave">(search.tab ?? "register")'));
  assert.ok(hub.includes('search={{ tab: report.tab }}'));
});
