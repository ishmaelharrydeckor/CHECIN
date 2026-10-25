import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BROWSER_OWNED,
  GO_TARGETS,
  INITIAL_KEY_STATE,
  SEQUENCE_WINDOW_MS,
  SHORTCUTS,
  resolveGo,
  shortcutsFor,
  singleKeysEnabled,
  step,
} from "../../src/lib/shortcuts.ts";
import { moveSelection } from "../../src/lib/wfh-diary-review.ts";
import { shortcutsDoc } from "../lib/shortcuts-doc.mjs";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const MANAGER_PATHS = ["/dashboard", "/history", "/shifts", "/leave", "/wfh-review", "/holidays", "/announcements", "/reports", "/late-arrivals", "/departments", "/settings"];
const EMPLOYEE_PATHS = ["/me", "/history", "/my-shifts", "/wfh-diary", "/leave", "/holidays", "/announcements"];
const mgr = { canManage: true, allowedPaths: MANAGER_PATHS, pathname: "/dashboard", singleKeysOn: true };
const emp = { canManage: false, allowedPaths: EMPLOYEE_PATHS, pathname: "/me", singleKeysOn: true };
const key = (k, over = {}) => ({ key: k, ctrl: false, meta: false, alt: false, repeat: false, typing: false, onControl: false, blocked: false, ...over });
const press = (ctx, ...seq) => {
  let state = INITIAL_KEY_STATE;
  let action = null;
  let t = 1000;
  for (const k of seq) {
    const r = step(state, typeof k === "string" ? key(k) : k, ctx, t);
    state = r.state;
    action = r.action;
    t += 200;
  }
  return action;
};

// ---------------------------------------------------------------- "g then a letter"
test("g then a letter goes to a page for a manager", () => {
  assert.deepEqual(press(mgr, "g", "r"), { type: "go", path: "/reports" });
  assert.deepEqual(press(mgr, "g", "d"), { type: "go", path: "/dashboard" });
  assert.deepEqual(press(mgr, "g", "w"), { type: "go", path: "/wfh-review" });
  assert.deepEqual(press(mgr, "g", ","), { type: "go", path: "/settings" });
  assert.deepEqual(press(mgr, "g", "u"), { type: "go", path: "/account" });
});

test("the same letters go to an employee's own pages, never to a manager page", () => {
  assert.deepEqual(press(emp, "g", "d"), { type: "go", path: "/history" });
  assert.deepEqual(press(emp, "g", "s"), { type: "go", path: "/my-shifts" });
  assert.deepEqual(press(emp, "g", "w"), { type: "go", path: "/wfh-diary" });
  assert.deepEqual(press(emp, "g", "m"), { type: "go", path: "/me" });
  for (const l of ["r", ","]) assert.equal(press(emp, "g", l), null, `g ${l} is not for employees`);
  for (const l of Object.keys(GO_TARGETS)) {
    const path = resolveGo(l, false, EMPLOYEE_PATHS);
    assert.ok(path === null || EMPLOYEE_PATHS.includes(path) || path === "/account", `employee g ${l} -> ${path}`);
  }
});

test("a page that is not in the person's own menu is never reached", () => {
  assert.equal(resolveGo("r", true, MANAGER_PATHS.filter((p) => p !== "/reports")), null);
  assert.equal(resolveGo("s", true, []), null);
});

test("an unknown letter does nothing, and the second key must come soon", () => {
  assert.equal(press(mgr, "g", "z"), null);
  let r = step(INITIAL_KEY_STATE, key("g"), mgr, 1000);
  assert.equal(r.state.pendingG, true);
  r = step(r.state, key("r"), mgr, 1000 + SEQUENCE_WINDOW_MS + 1);
  assert.notDeepEqual(r.action, { type: "go", path: "/reports" }, "too late: it does not go to Reports");
  assert.deepEqual(r.action, { type: "event", id: "refresh" }, "the r is then just an r");
  r = step(INITIAL_KEY_STATE, key("g"), mgr, 1000);
  r = step(r.state, key("r"), mgr, 1000 + SEQUENCE_WINDOW_MS);
  assert.deepEqual(r.action, { type: "go", path: "/reports" }, "just in time");
});

test("g then g does not go anywhere, and after a stale g the next key is just a key", () => {
  assert.equal(press(mgr, "g", "g"), null);
  const r1 = step(INITIAL_KEY_STATE, key("g"), mgr, 1000);
  const r2 = step(r1.state, key("r"), mgr, 1000 + 5000);
  assert.deepEqual(r2.action, { type: "event", id: "refresh" });
  assert.equal(r2.state.pendingG, false, "and nothing is left waiting");
  const r3 = step(r2.state, key("r"), mgr, 7000);
  assert.deepEqual(r3.action, { type: "event", id: "refresh" });
});

// ---------------------------------------------------------------- never in the way
test("nothing fires while typing, while a dialog is open, or while a key is held down", () => {
  for (const k of ["g", "?", "/", "r", "i", "1", "j", "a", "f", "[", "]"]) {
    assert.equal(step(INITIAL_KEY_STATE, key(k, { typing: true }), mgr, 1).action, null, `typing ${k}`);
    assert.equal(step(INITIAL_KEY_STATE, key(k, { blocked: true }), mgr, 1).action, null, `dialog ${k}`);
    assert.equal(step(INITIAL_KEY_STATE, key(k, { repeat: true }), mgr, 1).action, null, `held ${k}`);
  }
  assert.equal(press(mgr, "g", key("r", { typing: true })), null, "typing between g and r cancels it");
});

test("browser-owned combinations are never taken, and unknown combinations do nothing", () => {
  for (const k of ["n", "t", "w", "r", "l", "s", "p", "f"]) {
    assert.equal(step(INITIAL_KEY_STATE, key(k, { ctrl: true }), mgr, 1).action, null, `ctrl+${k}`);
    assert.equal(step(INITIAL_KEY_STATE, key(k, { meta: true }), mgr, 1).action, null, `cmd+${k}`);
    assert.equal(step(INITIAL_KEY_STATE, key(k, { alt: true }), mgr, 1).action, null, `alt+${k}`);
  }
  assert.equal(step(INITIAL_KEY_STATE, key("F5"), mgr, 1).action, null);
  for (const def of SHORTCUTS) {
    const combo = def.keys.join("+").toLowerCase().replace(/\s+/g, "");
    assert.ok(!BROWSER_OWNED.some((b) => combo === b), def.label);
  }
});

test("Ctrl or Cmd with B toggles the menu for everyone, even with single keys off, but not while typing", () => {
  for (const ctx of [mgr, emp, { ...mgr, singleKeysOn: false }]) {
    assert.deepEqual(step(INITIAL_KEY_STATE, key("b", { ctrl: true }), ctx, 1).action, { type: "event", id: "toggle-menu" });
    assert.deepEqual(step(INITIAL_KEY_STATE, key("B", { meta: true }), ctx, 1).action, { type: "event", id: "toggle-menu" });
  }
  assert.equal(step(INITIAL_KEY_STATE, key("b", { ctrl: true, typing: true }), mgr, 1).action, null);
});

test("with single-letter shortcuts off, only the Ctrl or Cmd ones work", () => {
  const off = { ...mgr, singleKeysOn: false };
  for (const k of ["g", "?", "/", "r", "1", "j"]) assert.equal(step(INITIAL_KEY_STATE, key(k), off, 1).action, null, k);
  assert.equal(singleKeysEnabled(null), true);
  assert.equal(singleKeysEnabled("on"), true);
  assert.equal(singleKeysEnabled("off"), false);
});

// ---------------------------------------------------------------- tier 1 to 3 keys
test("? opens the list and / goes to the search box, for everyone", () => {
  for (const ctx of [mgr, emp]) {
    assert.deepEqual(press(ctx, "?"), { type: "help" });
    assert.deepEqual(press(ctx, "/"), { type: "event", id: "focus-search" });
  }
});

test("tier 2 keys are for managers and admins only", () => {
  const events = { r: "refresh", i: "invite", "[": "prev-day", "]": "next-day", 1: "filter-1", 2: "filter-2", 3: "filter-3", 4: "filter-4", 5: "filter-5" };
  for (const [k, id] of Object.entries(events)) {
    assert.deepEqual(press(mgr, String(k)), { type: "event", id }, `manager ${k}`);
    assert.equal(press(emp, String(k)), null, `employee ${k}`);
  }
  assert.equal(press(mgr, "6"), null);
  assert.equal(press(mgr, "0"), null);
});

test("tier 3 keys move through a list, open a person, and ask to approve or flag; they never decide by themselves", () => {
  assert.deepEqual(press(mgr, "j"), { type: "event", id: "list-next" });
  assert.deepEqual(press(mgr, "k"), { type: "event", id: "list-prev" });
  assert.deepEqual(press(mgr, "Enter"), { type: "event", id: "list-open" });
  assert.deepEqual(press(mgr, "a"), { type: "event", id: "decide-approve" });
  assert.deepEqual(press(mgr, "f"), { type: "event", id: "decide-flag" });
  assert.equal(press(emp, "a"), null);
  assert.equal(press(mgr, key("Enter", { onControl: true })), null, "Enter on a button presses that button, not the list");
});

test("employees: s opens the scanner from My page only", () => {
  assert.deepEqual(press(emp, "s"), { type: "go", path: "/scan" });
  assert.equal(press({ ...emp, pathname: "/history" }, "s"), null);
  assert.equal(press(mgr, "s"), null, "a manager's s does nothing on its own");
});

// ---------------------------------------------------------------- the list on the review page
test("j and k move one at a time, stop at the ends, start sensibly and never highlight someone who left", () => {
  const ids = ["a", "b", "c"];
  assert.equal(moveSelection(ids, null, 1), "a");
  assert.equal(moveSelection(ids, null, -1), "c");
  assert.equal(moveSelection(ids, "a", 1), "b");
  assert.equal(moveSelection(ids, "c", 1), "c", "no wrap-around");
  assert.equal(moveSelection(ids, "a", -1), "a");
  assert.equal(moveSelection([], "a", 1), null);
  assert.equal(moveSelection(ids, "gone", 1), "a", "a person no longer in the list restarts at the top");
});

// ---------------------------------------------------------------- what each person is shown
test("the help list holds each person's own shortcuts and none of the other kind's", () => {
  const m = shortcutsFor(true).map((s) => s.scope);
  const e = shortcutsFor(false).map((s) => s.scope);
  assert.ok(m.includes("manager") && m.includes("review") && !m.includes("employee"));
  assert.ok(e.includes("employee") && !e.includes("manager") && !e.includes("review"));
  assert.ok(shortcutsFor(false).every((s) => s.tier === 1), "employees have the basics only");
});

test("every go letter in the table is real, and no letter is claimed twice for one kind of person", () => {
  for (const scope of ["manager", "employee"]) {
    const seen = new Set();
    for (const s of SHORTCUTS.filter((x) => x.scope === scope && x.keys[0] === "g")) {
      const letter = s.keys[2];
      assert.ok(GO_TARGETS[letter], `g ${letter} exists`);
      assert.ok(!seen.has(letter), `g ${letter} is listed twice for ${scope}`);
      seen.add(letter);
    }
  }
  for (const s of SHORTCUTS.filter((x) => x.scope === "everyone" && x.keys[0] === "g")) assert.ok(GO_TARGETS[s.keys[2]]?.manager && GO_TARGETS[s.keys[2]]?.employee, `g ${s.keys[2]} works for both`);
});

test("docs/KEYBOARD-SHORTCUTS.md is generated from the same table and is up to date", () => {
  assert.equal(read("docs/KEYBOARD-SHORTCUTS.md"), shortcutsDoc());
});

// ---------------------------------------------------------------- the browser side
const global = read("src/components/shortcuts/GlobalShortcuts.tsx");
const shell = read("src/components/AppShell.tsx");

test("the listener skips text boxes, lists, open dialogs and held keys, and never captures a key it does not use", () => {
  for (const guard of ["TEXTAREA", "SELECT", "isContentEditable", 'role === "combobox"', '[role="alertdialog"][data-state="open"]', ":not([data-allow-shortcuts])", "e.defaultPrevented || e.isComposing", "repeat: e.repeat"]) {
    assert.ok(global.includes(guard), guard);
  }
  assert.ok(global.includes("if (box) {") && global.includes("e.preventDefault(); // so the \"/\" is not typed into the box"), "/ is taken only when there is a search box");
});

test("the shell mounts it once, with the person's own menu pages, and the menu toggle", () => {
  assert.equal((shell.match(/<GlobalShortcuts/g) ?? []).length, 1);
  assert.ok(shell.includes("allowedPaths={flattenNav(groups).map((i) => i.to)}") && shell.includes("onToggleMenu={toggleCollapsed}"));
});

test("the account page has the switch, and the preference is kept per device with a safe fallback", () => {
  assert.ok(read("src/routes/_authenticated/account.tsx").includes("<ShortcutsSettingsCard />"));
  const pref = read("src/components/shortcuts/useShortcutPref.ts");
  assert.ok((pref.match(/try \{/g) ?? []).length >= 2 && (pref.match(/catch/g) ?? []).length >= 2);
});

test("the pages handle only what they mean: refresh and invite on the dashboard, filters on the roster, days and the list on the review", () => {
  assert.ok(read("src/routes/_authenticated/dashboard.tsx").includes("useShortcutActions({") && read("src/routes/_authenticated/dashboard.tsx").includes("data-shortcut-search"));
  const roster = read("src/components/dashboard/TeamRoster.tsx");
  for (const id of ["filter-1", "filter-2", "filter-3", "filter-4", "filter-5"]) assert.ok(roster.includes(`"${id}"`), id);
  assert.ok(roster.includes("data-shortcut-search"));
  assert.ok(read("src/components/dashboard/TeamRosterSection.tsx").includes('useShortcutAction("refresh"'));
  assert.ok(read("src/routes/_authenticated/history.tsx").includes("data-shortcut-search"));
});

test("approving or flagging from the keyboard always asks first, and works inside an open day only", () => {
  const page = read("src/routes/_authenticated/wfh-review.tsx");
  assert.ok(page.includes('"decide-approve": () => askToDecide("approve")') && page.includes('"decide-flag": () => askToDecide("flag")'));
  assert.ok(page.includes("setConfirmFor({ day: target, decision })"), "the key only opens a confirm box");
  assert.ok(!/askToDecide[^]{0,200}void decide\(/.test(page.slice(page.indexOf("const askToDecide"), page.indexOf("useShortcutActions({"))), "askToDecide never decides by itself");
  assert.ok(page.includes("onClick={() => {") && page.includes("if (c) void decide(c.day, c.decision);"), "only the confirm button decides");
  assert.ok(read("src/components/wfh/diary/DiaryDayDialog.tsx").includes("<DialogContent data-allow-shortcuts"));
  for (const id of ["prev-day", "next-day", "refresh", "list-next", "list-prev", "list-open"]) {
    assert.ok(new RegExp(`"?${id}"?: \\(\\) => \\{?\\s*(!open|if \\(open\\)|const row)`).test(page.replace(/\n/g, " ")) || page.includes(`"${id}": () => !open`) || page.includes(`${id}: () => !open`), `${id} stays quiet while a day is open`);
  }
});

test("the help card is built from the same table and shown only to the signed-in person's own kind", () => {
  const help = read("src/components/shortcuts/ShortcutsHelp.tsx");
  assert.ok(help.includes("shortcutsFor(canManage)"));
  assert.ok(help.includes("You can switch the single-letter ones off in My account."));
});
