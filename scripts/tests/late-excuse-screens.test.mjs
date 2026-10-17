import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { describeExcuseResult, groupRowsByDay, tickByCutoff, tickableIds, toggleId } from "../../src/lib/late-excuse.ts";

const row = (employeeId, dayKey, arrivedAt, extra = {}) => ({
  employeeId, name: employeeId.toUpperCase(), department: "", dayKey, arrivedAt, excused: false,
  reason: "", decidedByName: "", note: "", ...extra,
});
const rows = [
  row("a", "2026-10-16", "08:05"), row("b", "2026-10-16", "08:40"), row("c", "2026-10-16", "10:30"),
  row("d", "2026-10-16", "08:10", { excused: true, reason: "Tablet" }),
  row("a", "2026-10-15", "09:00"),
];
const admin = { uid: "adm", role: "org_admin" };
const mgr = { uid: "a", role: "manager" };

test("rows group by day in order", () => {
  const g = groupRowsByDay(rows);
  assert.deepEqual(g.map((x) => [x.dayKey, x.rows.length]), [["2026-10-16", 4], ["2026-10-15", 1]]);
  assert.deepEqual(groupRowsByDay([]), []);
});

test("ticking: toggle adds and removes, never mutates", () => {
  const start = Object.freeze(["a"]);
  assert.deepEqual(toggleId(start, "b"), ["a", "b"]);
  assert.deepEqual(toggleId(start, "a"), []);
});

test("who can be ticked: not already excused, and a manager never ticks their own row", () => {
  const day = rows.filter((r) => r.dayKey === "2026-10-16");
  assert.deepEqual(tickableIds(day, admin), ["a", "b", "c"]);
  assert.deepEqual(tickableIds(day, mgr), ["b", "c"], "the manager is employee a");
  assert.deepEqual(tickableIds(day, { uid: "a", role: "org_admin" }), ["a", "b", "c"], "an admin may tick their own");
});

test("arrived-by helper: ticks only people who arrived by the time and can be ticked", () => {
  const day = rows.filter((r) => r.dayKey === "2026-10-16");
  assert.deepEqual(tickByCutoff(day, "08:40", admin), ["a", "b"], "10:30 stays unticked; excused d is skipped");
  assert.deepEqual(tickByCutoff(day, "08:40", mgr), ["b"], "the manager's own row is skipped");
  assert.deepEqual(tickByCutoff(day, "", admin), []);
  assert.deepEqual(tickByCutoff(day, "8:40", admin), []);
});

test("the result sentence is plain", () => {
  assert.equal(describeExcuseResult({ excused: 1, skipped: [] }), "1 late mark excused.");
  assert.equal(describeExcuseResult({ excused: 3, skipped: [] }), "3 late marks excused.");
  assert.match(describeExcuseResult({ excused: 0, skipped: [{ reason: "already_excused" }, { reason: "not_late" }] }), /already excused.*not late/);
});

const read = (p) => readFileSync(p, "utf8");

test("the screens exist and are wired in", () => {
  for (const f of [
    "src/components/late/LateReviewPanel.tsx",
    "src/components/me/MyLateDays.tsx",
    "src/routes/_authenticated/late-arrivals.tsx",
    "src/routes/api/attendance/late-mine.ts",
  ]) assert.ok(existsSync(f), f);
  const shell = read("src/components/AppShell.tsx");
  assert.ok(/MANAGER_ONLY_PATHS = \[[^\]]*"\/late-arrivals"/.test(shell), "employees are turned away from the review page");
  assert.ok(shell.includes('label: "Late arrivals"'));
  assert.ok(read("src/routes/_authenticated/me.tsx").includes("<MyLateDays />"));
});

test("there is no way to tick everyone, and the reason is checked before asking the server", () => {
  const panel = read("src/components/late/LateReviewPanel.tsx");
  const code = panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/Tick everyone who arrived by/g, "");
  assert.ok(!/select all|tick all|tick everyone/i.test(code), "no button that ticks everyone");
  assert.ok(panel.indexOf("parseReason(reason)") < panel.indexOf('"/api/attendance/late-excuse"'));
  assert.ok(panel.includes("viewer.role") && panel.includes("ownLate"));
});

test("the employee card sends only the day and the note, and hides itself when there is nothing", () => {
  const card = read("src/components/me/MyLateDays.tsx");
  assert.ok(card.includes("JSON.stringify({ dayKey: editing.dayKey, note: parsed.value })"));
  assert.ok(card.includes("return null"));
  assert.ok(card.indexOf("parseNoteText(note)") < card.indexOf('"/api/attendance/late-note"'));
});

test("late-mine always answers about the caller", () => {
  const src = read("src/routes/api/attendance/late-mine.ts");
  assert.ok(src.includes('"employeeId", "==", caller.uid'));
  assert.ok(!/searchParams/.test(src));
  assert.ok(src.includes(".limit(OWN_SUMMARY_CAP)"));
});

test("house rules: no storage, no debug output, no inline styles, no any, no GPS", () => {
  for (const f of [
    "src/components/late/LateReviewPanel.tsx",
    "src/components/me/MyLateDays.tsx",
    "src/routes/_authenticated/late-arrivals.tsx",
    "src/routes/api/attendance/late-mine.ts",
  ]) {
    const src = read(f);
    assert.ok(!/localStorage|sessionStorage/.test(src), f);
    assert.ok(!/console\.log/.test(src), f);
    assert.ok(!/style=\{\{/.test(src), f);
    assert.ok(!/:\s*any\b|as any\b/.test(src), f);
    assert.ok(!/geolocation/i.test(src), f);
  }
});
