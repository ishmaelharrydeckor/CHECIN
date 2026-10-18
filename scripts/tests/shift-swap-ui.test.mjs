import test from "node:test";
import assert from "node:assert/strict";
import {
  SWAP_LIST_SHOWN,
  confirmSwapAction,
  describeSwapFor,
  groupSwaps,
  swapActionLabel,
  swapStatusFor,
  swapStatusLabel,
  validateSwapProposal,
} from "../../src/lib/shift-swap-ui.ts";
import { parseCandidatesDay, swapCandidatesFrom } from "../../src/lib/shift-swaps.ts";

const ROW = (id, over = {}) => ({
  id,
  dayKey: "2026-10-20",
  status: "pending",
  proposerId: "ann",
  proposerName: "Ann",
  proposerShiftLabel: "Day, 08:00 to 16:00",
  colleagueId: "ben",
  colleagueName: "Ben",
  colleagueShiftLabel: "Night, 22:00 to 06:00",
  note: "",
  createdAt: `2026-10-18T0${id.length}:00:00.000Z`,
  decidedBy: null,
  decidedAt: null,
  actions: [],
  ...over,
});

test("each status reads as a plain sentence, from the viewer's side where it matters", () => {
  assert.equal(swapStatusLabel("pending").text, "Waiting for the colleague");
  assert.equal(swapStatusLabel("accepted").text, "Waiting for a manager");
  assert.equal(swapStatusLabel("approved").text, "Approved");
  assert.equal(swapStatusLabel("declined").text, "Declined");
  assert.equal(swapStatusLabel("cancelled").text, "Cancelled");
  // Only the style guide's status colors: amber for waiting, mint for approved, red text for declined.
  assert.match(swapStatusLabel("pending").className, /bg-amber-100 text-amber-900/);
  assert.match(swapStatusLabel("approved").className, /bg-\[#CBEED3\] text-\[#0E2322\]/);
  assert.match(swapStatusLabel("declined").className, /text-destructive/);
  assert.match(swapStatusLabel("cancelled").className, /bg-slate-100 text-slate-700/);
  assert.equal(swapStatusLabel("something-else").text, "Unknown");
});

test("a swap is described from the side of whoever is looking at it", () => {
  const r = ROW("s1");
  assert.equal(describeSwapFor(r, "ann"), "You asked Ben to swap: your Day, 08:00 to 16:00 for their Night, 22:00 to 06:00.");
  assert.equal(describeSwapFor(r, "ben"), "Ann asked to swap: their Day, 08:00 to 16:00 for your Night, 22:00 to 06:00.");
  assert.equal(describeSwapFor(r, "mgr"), "Ann (Day, 08:00 to 16:00) and Ben (Night, 22:00 to 06:00).");
});

test("swaps waiting on the viewer come first, then their own requests, then the rest, each list bounded", () => {
  const rows = [
    ROW("a", { actions: ["cancel"], proposerId: "me" }),
    ROW("b", { actions: ["accept", "decline"], colleagueId: "me" }),
    ROW("c", { actions: ["approve", "reject"], status: "accepted" }),
    ROW("d", { status: "approved", proposerId: "me" }),
    ROW("e", { status: "declined" }),
    ROW("f", { status: "accepted", colleagueId: "me" }),
  ];
  const g = groupSwaps(rows, "me");
  assert.deepEqual(g.waiting.map((r) => r.id), ["b", "c"], "accept, decline, approve or reject means it waits on me");
  assert.deepEqual(g.mine.map((r) => r.id), ["a", "d", "f"], "swaps I am part of, as proposer or colleague, open or finished");
  assert.deepEqual(g.others.map((r) => r.id), ["e"]);
  const many = Array.from({ length: 30 }, (_, i) => ROW(`x${i}`, { status: "approved" }));
  const big = groupSwaps(many, "me");
  assert.equal(big.others.length, SWAP_LIST_SHOWN);
  assert.equal(big.othersTotal, 30, "the screen can say 'showing the latest 20 of 30'");
  assert.equal(SWAP_LIST_SHOWN, 20);
});

test("every action has a button label and a confirmation that says what happens next", () => {
  for (const a of ["accept", "decline", "cancel", "approve", "reject"]) {
    assert.ok(swapActionLabel(a).length > 0, a);
    const c = confirmSwapAction(a, ROW("s1"));
    assert.ok(c.title.length > 0 && c.body.length > 0 && c.confirm.length > 0, a);
  }
  assert.match(confirmSwapAction("approve", ROW("s1")).body, /Ann.*Ben|Ben.*Ann/);
  assert.match(confirmSwapAction("approve", ROW("s1")).body, /cannot be undone|can't be undone/i);
  assert.match(confirmSwapAction("accept", ROW("s1")).body, /manager/i, "accepting is not the last step");
});

test("the proposal form is checked before it is sent", () => {
  assert.equal(validateSwapProposal({ colleagueId: "", note: "" }), "Choose a colleague to swap with.");
  assert.equal(validateSwapProposal({ colleagueId: "ben", note: "x".repeat(201) }), "Keep the note to 200 characters or fewer.");
  assert.equal(validateSwapProposal({ colleagueId: "ben", note: "  " }), null);
  assert.equal(validateSwapProposal({ colleagueId: "ben", note: "x".repeat(200) }), null);
});

test("the colleagues offered are others on a different shift that day, sorted by name", () => {
  const day = (uid, name, shiftId, label = shiftId) => ({ employeeId: uid, employeeName: name, shiftId, shiftLabel: label });
  const list = swapCandidatesFrom(
    [day("me", "Me", "day"), day("zed", "Zed", "night"), day("amy", "Amy", "late"), day("bob", "Bob", "day"), day("", "Ghost", "night"), day("a/b", "Bad", "night")],
    { uid: "me", shiftId: "day" },
  );
  assert.deepEqual(list.map((c) => c.uid), ["amy", "zed"], "not me, not the same shift, no damaged rows");
  assert.deepEqual(list[0], { uid: "amy", name: "Amy", shiftLabel: "late" });
  assert.deepEqual(swapCandidatesFrom([], { uid: "me", shiftId: "day" }), []);
  const unnamed = swapCandidatesFrom([day("x1", "", "night")], { uid: "me", shiftId: "day" });
  assert.equal(unnamed[0].name, "Colleague");
});

test("the day asked for colleagues must be a real date, today or later", () => {
  assert.deepEqual(parseCandidatesDay("2026-10-20", "2026-10-18"), { ok: true, value: "2026-10-20" });
  assert.deepEqual(parseCandidatesDay("2026-10-18", "2026-10-18"), { ok: true, value: "2026-10-18" });
  assert.equal(parseCandidatesDay("2026-10-17", "2026-10-18").ok, false);
  for (const bad of [null, "", "2026-02-30", "tomorrow", 5]) assert.equal(parseCandidatesDay(bad, "2026-10-18").ok, false, String(bad));
});

test("a swap waiting on the viewer says so, instead of naming them in the third person", () => {
  assert.equal(swapStatusFor(ROW("s1"), "ben").text, "Waiting for you", "Ben is the colleague");
  assert.equal(swapStatusFor(ROW("s1"), "ann").text, "Waiting for the colleague");
  assert.equal(swapStatusFor(ROW("s1", { status: "accepted", actions: ["approve", "reject"] }), "mgr").text, "Waiting for you");
  assert.equal(swapStatusFor(ROW("s1", { status: "accepted", actions: [] }), "mgr2").text, "Waiting for a manager");
  assert.equal(swapStatusFor(ROW("s1", { status: "approved" }), "ben").text, "Approved");
});
