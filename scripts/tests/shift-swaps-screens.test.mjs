import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source checks for the swap screens (3.1-P7 step 3). The wording and grouping are tested in
// shift-swap-ui.test.mjs; these keep the screens honest about who decides what.
const list = readFileSync("src/components/shifts/SwapList.tsx", "utf8");
const dialog = readFileSync("src/components/shifts/ProposeSwapDialog.tsx", "utf8");
const settings = readFileSync("src/components/shifts/ShiftSwapSettingsCard.tsx", "utf8");
const myShifts = readFileSync("src/routes/_authenticated/my-shifts.tsx", "utf8");
const shifts = readFileSync("src/routes/_authenticated/shifts.tsx", "utf8");

test("the buttons on a swap are exactly the moves the server allowed; the screen decides nothing", () => {
  assert.ok(list.includes("row.actions.map((action) =>"));
  assert.ok(!/role\s*===|isOrgAdmin|isManager/.test(list), "no role checks in the list");
  assert.ok(list.includes('JSON.stringify({ swapId: pending.row.id, action: pending.action })'), "sends only the swap and the action");
});

test("every swap action is confirmed first, and the list reloads afterwards, even when it failed", () => {
  assert.ok(list.includes("<AlertDialog open={pending !== null}"));
  const confirmFn = list.slice(list.indexOf("async function confirm()"), list.indexOf("const groups ="));
  assert.equal((confirmFn.match(/onChanged\(\)/g) ?? []).length, 2);
});

test("the proposal is checked before sending, carries a request id, and never sends an identity field", () => {
  const submit = dialog.slice(dialog.indexOf("async function handleSubmit"));
  assert.ok(submit.indexOf("validateSwapProposal(") < submit.indexOf('authedFetch<{ ok: true; swapId: string }>("/api/shifts/swaps"'));
  assert.ok(submit.includes('JSON.stringify({ action: "propose", colleagueId, dayKey: day.dayKey, note: note.trim(), requestId })'));
  for (const f of ["orgId", "managerId", "proposerId", "role"]) assert.ok(!submit.includes(`${f}:`), f);
  assert.ok(dialog.includes("setRequestId(newRequestId())"), "a new id each time the dialog opens");
});

test("loading, empty and error states exist on each swap screen", () => {
  for (const [name, src] of [["list", list], ["dialog", dialog], ["settings", settings]]) {
    assert.ok(src.includes("<Skeleton"), `${name}: loading`);
    assert.ok(src.includes("Try again"), `${name}: error`);
  }
  assert.ok(list.includes("No shift swaps yet"));
  assert.ok(dialog.includes("Nobody to swap with that day"));
});

test("employee buttons are tall enough to tap, and the switch is admin only", () => {
  assert.ok(myShifts.includes('className="h-10 border-slate-200 text-xs"'));
  assert.ok(myShifts.includes("swaps?.enabled &&"), "the Swap button shows only while swaps are on");
  assert.ok(/\{isOrgAdmin && \(\s*<TabsContent value="settings"[^>]*>\s*<ShiftSettingsCard \/>\s*<ShiftSwapSettingsCard \/>/.test(shifts));
  assert.ok(settings.includes('JSON.stringify({ shiftSwapsEnabled: next })'));
});
