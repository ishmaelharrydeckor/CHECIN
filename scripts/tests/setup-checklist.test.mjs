import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSetupSteps, setupHiddenKey, setupProgress } from "../../src/lib/setup-checklist.ts";

const page = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8").replace(/\r\n/g, "\n");
const card = readFileSync("src/components/dashboard/SetupChecklist.tsx", "utf8").replace(/\r\n/g, "\n");

const stateOf = (input) => buildSetupSteps(input).map((s) => `${s.id}:${s.done ? "done" : "todo"}`).join(" ");

// ---------------------------------------------------------------- the steps
test("a brand new organization has three things to do", () => {
  assert.equal(stateOf({ locations: [], headcount: 1 }), "entrance:todo tablet:todo team:todo");
  const p = setupProgress(buildSetupSteps({ locations: [], headcount: 1 }));
  assert.deepEqual(p, { done: 0, total: 3, complete: false });
});

test("each step completes on its own real condition", () => {
  assert.equal(stateOf({ locations: [{ isPaired: false }], headcount: 1 }), "entrance:done tablet:todo team:todo");
  assert.equal(stateOf({ locations: [{ isPaired: true }], headcount: 1 }), "entrance:done tablet:done team:todo");
  assert.equal(stateOf({ locations: [{ isPaired: false }], headcount: 2 }), "entrance:done tablet:todo team:done");
});

test("the team step is done as soon as the admin has invited someone, without waiting for them to join", () => {
  assert.equal(stateOf({ locations: [], headcount: 1, invitesSent: 1 }), "entrance:todo tablet:todo team:done");
  assert.equal(stateOf({ locations: [], headcount: 1, invitesSent: 3 }), "entrance:todo tablet:todo team:done");
  assert.equal(stateOf({ locations: [], headcount: 1, invitesSent: 0 }), "entrance:todo tablet:todo team:todo");
  assert.equal(stateOf({ locations: [], headcount: 1 }), "entrance:todo tablet:todo team:todo", "unknown count is none");
});

test("an invitation that was used or has expired still counts as invited", () => {
  // The page passes every invitation in any state, so a used or expired one cannot un-tick the step.
  assert.ok(page.includes("setInvitesSentCount(Array.isArray(staffData.invites) ? staffData.invites.length : 0)"));
  assert.ok(page.includes("invitesSent: invitesSentCount"));
});

test("after invites are sent but nobody has joined, the step says so; once someone joins the note goes", () => {
  const sent = buildSetupSteps({ locations: [], headcount: 1, invitesSent: 1 })[2];
  assert.match(sent.note, /^1 invitation sent\./);
  assert.match(buildSetupSteps({ locations: [], headcount: 1, invitesSent: 4 })[2].note, /^4 invitations sent\./);
  assert.equal(buildSetupSteps({ locations: [], headcount: 2, invitesSent: 4 })[2].note, undefined);
  assert.equal(buildSetupSteps({ locations: [], headcount: 1, invitesSent: 0 })[2].note, undefined);
});

test("odd invitation counts never tick the step", () => {
  for (const bad of [Number.NaN, -1, 1.5, "2", null, undefined]) {
    assert.ok(stateOf({ locations: [], headcount: 1, invitesSent: bad }).includes("team:todo"), String(bad));
  }
});

test("the card shows the note under a finished step", () => {
  assert.ok(card.includes("step.done && step.note"));
});

test("one paired tablet among several entrances is enough", () => {
  assert.equal(stateOf({ locations: [{ isPaired: false }, { isPaired: true }, { isPaired: false }], headcount: 1 }).includes("tablet:done"), true);
});

test("the admin alone is not a team: it takes a second person", () => {
  assert.ok(stateOf({ locations: [], headcount: 1 }).includes("team:todo"));
  assert.ok(stateOf({ locations: [], headcount: 2 }).includes("team:done"));
});

test("once everything exists the checklist is complete", () => {
  const p = setupProgress(buildSetupSteps({ locations: [{ isPaired: true }], headcount: 5 }));
  assert.deepEqual(p, { done: 3, total: 3, complete: true });
});

test("odd input never makes a step wrongly done", () => {
  assert.equal(stateOf({ locations: [], headcount: Number.NaN }), "entrance:todo tablet:todo team:todo");
  assert.equal(stateOf({ locations: [], headcount: -3 }), "entrance:todo tablet:todo team:todo");
  assert.equal(stateOf({ locations: null, headcount: 1 }), "entrance:todo tablet:todo team:todo");
  assert.equal(stateOf({ locations: [{}], headcount: 1 }), "entrance:done tablet:todo team:todo", "unknown pairing counts as not paired");
});

test("the tablet step explains what to do first when there is no entrance yet", () => {
  const steps = buildSetupSteps({ locations: [], headcount: 1 });
  assert.match(steps[1].detail, /Add an entrance first/);
  assert.match(buildSetupSteps({ locations: [{ isPaired: false }], headcount: 1 })[1].detail, /pairing code/);
});

test("it does not depend on today's check-ins, so it cannot come back on a quiet day", () => {
  const src = readFileSync("src/lib/setup-checklist.ts", "utf8");
  assert.ok(!/present|today|Date\.|events/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "no use of today's numbers or the clock");
});

test("the hide choice is remembered per organization", () => {
  assert.notEqual(setupHiddenKey("org-a"), setupHiddenKey("org-b"));
});

// ---------------------------------------------------------------- the card and the page
test("only organization admins are shown the checklist, and only after the data has loaded", () => {
  assert.ok(page.includes("Boolean(isOrgAdmin && setupSteps && !setupHidden && !setupProgress(setupSteps).complete)"));
  assert.ok(page.includes("if (isOrgAdmin) {") && page.includes('fetch("/api/locations"'), "only admins ask for the entrances");
  assert.ok(page.includes("setupLocations ? buildSetupSteps"), "nothing is shown (no flash) until the entrances are known");
});

test("it sits above Today and is a single card", () => {
  assert.equal((page.match(/<SetupChecklist/g) ?? []).length, 1);
  assert.ok(page.indexOf("<SetupChecklist") < page.indexOf("<TodayPanel"));
});

test("hiding is saved safely in the viewer's browser only", () => {
  assert.ok(page.includes("localStorage.getItem(setupHiddenKey(orgId))") && page.includes("localStorage.setItem(setupHiddenKey(orgId)"));
  const block = page.slice(page.indexOf("if (!orgId) return;"), page.indexOf("const setupSteps"));
  assert.ok((block.match(/try \{/g) ?? []).length >= 2 && (block.match(/catch/g) ?? []).length >= 2, "both uses are inside try/catch");
});

test("the card names the next action: Settings for the entrance and tablet, the invite box for the team", () => {
  assert.ok(card.includes('to="/settings"') && card.includes("Open Settings"));
  assert.ok(card.includes("onClick={onInvite}") && card.includes("Invite staff"));
  assert.ok(page.includes("onInvite={() => {") && page.includes("setInviteModalOpen(true)"));
});

test("the card is accessible: a labelled progress bar, and done steps are announced", () => {
  assert.ok(card.includes('role="progressbar"') && card.includes("aria-valuenow={done}"));
  assert.ok(card.includes("(done)"));
});

test("plain words, no jargon", () => {
  const text = card + readFileSync("src/lib/setup-checklist.ts", "utf8");
  for (const jargon of ["tenant", "provision", "onboarding", "kiosk"]) {
    assert.ok(!text.toLowerCase().includes(jargon), `no "${jargon}"`);
  }
});

// ---------------------------------------------------------------- larger text
test("dashboard content text is at least 13 px, with only small uppercase labels left at 12 px", () => {
  const files = [
    "src/components/dashboard/TodayPanel.tsx",
    "src/routes/_authenticated/dashboard.tsx",
    "src/components/analytics/AnalyticsPanel.tsx",
    "src/components/analytics/AnalyticsKpiTiles.tsx",
    "src/components/analytics/AnalyticsTrendChart.tsx",
    "src/components/analytics/AnalyticsDepartments.tsx",
    "src/components/wfh/WfhTodayList.tsx",
  ];
  for (const f of files) {
    const lines = readFileSync(f, "utf8").replace(/\r\n/g, "\n").split("\n");
    lines.forEach((line, i) => {
      assert.ok(!line.includes("text-[11px]"), `${f}:${i + 1} still 11 px`);
      if (/(?<![\w:-])text-xs(?![\w-])/.test(line)) {
        assert.ok(line.includes("uppercase") || /rounded-full/.test(line), `${f}:${i + 1} 12 px text that is not a label or a pill`);
      }
    });
  }
});
