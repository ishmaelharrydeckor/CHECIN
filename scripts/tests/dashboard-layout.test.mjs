import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The dashboard page is one page with no repeated blocks (redesign step 2). These keep it that way.
const page = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
const panel = readFileSync("src/components/dashboard/TodayPanel.tsx", "utf8");
const kpis = readFileSync("src/components/analytics/AnalyticsKpiTiles.tsx", "utf8");

test("the repeated blocks are gone: the four bento tiles, the old weekly chart, the team ring chart", () => {
  assert.ok(!/recharts/.test(page), "no chart library on the page: the analytics section draws the trend");
  assert.ok(!/PieChart|BarChart|ResponsiveContainer/.test(page));
  assert.ok(!/Total Headcount|Avg Shift Length|On-Time Rate/i.test(page), "the old top tiles are gone");
  assert.ok(!/Awaiting Live Entrance Telemetry/.test(page));
  assert.ok(!/\/api\/attendance\/week/.test(page), "nothing fetches the weekly trend any more");
});

test("each section appears once, in order: header, Today, analytics, activity", () => {
  assert.equal((page.match(/<TodayPanel/g) ?? []).length, 1);
  assert.equal((page.match(/<AnalyticsSection/g) ?? []).length, 1);
  const order = [page.indexOf("<TodayPanel"), page.indexOf("<AnalyticsSection"), page.indexOf("Today's check-ins")];
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], "Today, then analytics, then the activity table");
});

test("the Today panel no longer repeats the activity list on the dashboard", () => {
  assert.ok(page.includes("showActivity={false}"));
  assert.ok(panel.includes("showActivity = true"), "other uses keep the activity list by default");
});

test("four tiles: Present, Late, Away, Absent; colour only when something needs attention", () => {
  const tiles = [...panel.matchAll(/<Tile\s+tone=\{?"?([^\s}"]+|[^}]+)\}?"?\s+label="([^"]+)"/g)].map((m) => m[2]);
  assert.deepEqual(tiles, ["Present", "Late", "Away", "Absent"]);
  assert.ok(/label="Present"/.test(panel) && /tone="white"\s+label="Present"/.test(panel), "Present is not a success colour");
  assert.ok(panel.includes('tone={counts.late > 0 ? "butter" : "white"}'));
  assert.ok(panel.includes('tone={counts.absent > 0 ? "butter" : "white"}'));
  assert.ok(!kpis.includes('tone="mint"'), "analytics tiles never show a success colour, so 0% is not green");
});

test("tiles are two per row on a phone and four on a desktop", () => {
  assert.ok(panel.includes('grid grid-cols-2 lg:grid-cols-4'));
});

test("the Away tile adds working from home and leave, and says so", () => {
  assert.ok(panel.includes("counts.onLeave + counts.wfh"));
  assert.ok(panel.includes("working from home") && panel.includes("on leave"));
});

test("plain words, not jargon", () => {
  const text = page + panel;
  for (const jargon of ["telemetry", "presence intelligence", "punch events", "Corporate Admin", "Registered Staff"]) {
    assert.ok(!text.toLowerCase().includes(jargon.toLowerCase()), `no "${jargon}"`);
  }
});

test("everything the page still needs is kept: refresh, export, invite, excused label, work-from-home removal", () => {
  assert.ok(page.includes("handleManualRefresh") && page.includes("handleExportCsv"));
  assert.ok(page.includes("Late, excused"));
  assert.ok(page.includes("removeWfhDay") && page.includes("onRemoveWfh"));
  assert.ok(page.includes("isOrgAdmin || isManager") && page.includes("setInviteModalOpen(true)"));
});
