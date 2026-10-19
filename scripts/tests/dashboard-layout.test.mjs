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

test("each section appears once, in order: header, Today, today's check-ins, then the trends", () => {
  assert.equal((page.match(/<TodayPanel/g) ?? []).length, 1);
  assert.equal((page.match(/<AnalyticsSection/g) ?? []).length, 1);
  const order = [page.indexOf("<TodayPanel"), page.indexOf('id="todays-checkins"'), page.indexOf("<AnalyticsSection")];
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], "today's numbers, the check-ins they explain, then history");
});

test("the Today panel no longer repeats the activity list on the dashboard", () => {
  assert.ok(page.includes("showActivity={false}"));
  assert.ok(panel.includes("showActivity = true"), "other uses keep the activity list by default");
});

test("four tiles: Present, Late, Away, Absent; colour only when something needs attention", () => {
  const tiles = [...panel.matchAll(/<Tile\s+tone=\{?"?([^\s}"]+|[^}]+)\}?"?\s+(?:href=\{[^\n]*\}\s+|href="[^"]*"\s+)?label="([^"]+)"/g)].map((m) => m[2]);
  assert.deepEqual(tiles, ["Present", "Late", "Away", "Absent"]);
  assert.ok(/label="Present"/.test(panel) && /tone="white"\s+href="#todays-checkins"\s+label="Present"/.test(panel), "Present is not a success colour");
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

test("the header is slim: a title, one plain line, and only the invite action", () => {
  const header = page.slice(page.indexOf("{/* Header: where you are"), page.indexOf("{/* Today: counts"));
  assert.ok(header.includes("<h1") && header.includes("setInviteModalOpen(true)"));
  assert.ok(!header.includes("handleExportCsv") && !header.includes("handleManualRefresh"), "refresh and export live with what they act on");
  assert.ok(!header.includes("animate-pulse"), "no pulsing dot beside a role label");
  assert.ok(!header.includes("rounded-3xl"), "no big card around the heading");
});

test("Export CSV is in the check-ins table's own controls, and refresh is a small icon with the numbers", () => {
  const table = page.slice(page.indexOf('id="todays-checkins"'), page.indexOf("{/* Table Body */}"));
  assert.ok(table.includes("onClick={handleExportCsv}") && table.includes("Export CSV"));
  assert.ok(panel.includes('aria-label="Refresh today\'s numbers"') && panel.includes('size="icon"'));
  assert.equal((page.match(/onClick=\{handleExportCsv\}/g) ?? []).length, 1, "one export button, not two");
});

test("tiles jump to the list that explains them, and are plain boxes when there is nothing to jump to", () => {
  assert.ok(panel.includes('href="#todays-checkins"'));
  assert.ok(panel.includes('href={counts.late > 0 ? "#late-today" : undefined}'));
  assert.ok(panel.includes('href={counts.absent > 0 ? "#not-arrived" : undefined}'));
  assert.ok(panel.includes('href={(data.wfhPeople?.length ?? 0) > 0 ? "#away" : undefined}'));
  for (const id of ["late-today", "not-arrived", "away", "todays-checkins"]) {
    assert.ok((panel + page).includes(`id="${id}"`), `#${id} exists to jump to`);
  }
  assert.ok((panel + page).match(/scroll-mt-20/g).length >= 4, "the sticky top bar does not cover where they land");
});

test("lists are ordered by what needs action: not arrived, then late; work from home is a quiet strip", () => {
  const lists = panel.slice(panel.indexOf("lg:col-span-12 space-y-6"));
  assert.ok(lists.indexOf("<NotArrivedCard") < lists.indexOf('id="late-today"'), "not arrived comes first");
  assert.ok(lists.indexOf('id="late-today"') < lists.indexOf("<WfhStrip"), "work from home is last");
  assert.ok(panel.includes("function WfhStrip") && panel.includes("aria-expanded={open}"), "it opens on tap");
  assert.ok(panel.includes("<WfhTodayList") && panel.includes("onRemove={onRemove}"), "the full list, with Remove, is one tap away");
});

test("the late list links to the review page, only for people who can use it", () => {
  assert.ok(panel.includes('to="/late-arrivals"') && panel.includes("Review late arrivals"));
  assert.ok(panel.includes("canReviewLate && data.late.length > 0"));
  assert.ok(page.includes("canReviewLate={isOrgAdmin || isManager}"));
});
