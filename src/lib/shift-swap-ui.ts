/**
 * What the shift-swap screens show (task 3.1, phase 7, step 3): status labels, one sentence per swap
 * from the viewer's side, the order of the lists and the confirmation wording. The server decides
 * which actions a viewer may take (each row's `actions`); nothing here decides permissions.
 *
 * No Firebase, no `@/` imports, no clock reads, so it can be tested with the Node test runner.
 */
import { SWAP_NOTE_MAX_LENGTH, type SwapRow } from "./shift-swaps.ts";

/** At most this many rows per list, as the style guide asks. */
export const SWAP_LIST_SHOWN = 20;

export type SwapRowWithActions = SwapRow & { actions: string[] };

const PILL = "inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold";

/** The status pill, in the style guide's status colors only. */
export function swapStatusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case "pending":
      return { text: "Waiting for the colleague", className: `${PILL} bg-amber-100 text-amber-900` };
    case "accepted":
      return { text: "Waiting for a manager", className: `${PILL} bg-amber-100 text-amber-900` };
    case "approved":
      return { text: "Approved", className: `${PILL} bg-[#CBEED3] text-[#0E2322]` };
    case "declined":
      return { text: "Declined", className: "text-[11px] font-semibold text-destructive" };
    case "cancelled":
      return { text: "Cancelled", className: `${PILL} bg-slate-100 text-slate-700` };
    default:
      return { text: "Unknown", className: `${PILL} bg-slate-100 text-slate-700` };
  }
}

/** The status pill as the viewer should read it: a swap waiting on them says so. */
export function swapStatusFor(row: SwapRowWithActions, viewerId: string): { text: string; className: string } {
  const base = swapStatusLabel(row.status);
  const waitsOnViewer =
    (row.status === "pending" && row.colleagueId === viewerId) ||
    (row.status === "accepted" && row.actions.includes("approve"));
  return waitsOnViewer ? { ...base, text: "Waiting for you" } : base;
}

/** One sentence about a swap, from the side of the person looking at it. */
export function describeSwapFor(row: SwapRow, viewerId: string): string {
  if (row.proposerId === viewerId) {
    return `You asked ${row.colleagueName} to swap: your ${row.proposerShiftLabel} for their ${row.colleagueShiftLabel}.`;
  }
  if (row.colleagueId === viewerId) {
    return `${row.proposerName} asked to swap: their ${row.proposerShiftLabel} for your ${row.colleagueShiftLabel}.`;
  }
  return `${row.proposerName} (${row.proposerShiftLabel}) and ${row.colleagueName} (${row.colleagueShiftLabel}).`;
}

const WAITING_ACTIONS = new Set(["accept", "decline", "approve", "reject"]);

/**
 * Swaps that wait on the viewer first, then the other swaps the viewer is part of, then everything else
 * they can see (a manager's team, an admin's organization). Order within each list is the server's.
 */
export function groupSwaps(rows: readonly SwapRowWithActions[], viewerId: string) {
  const waiting: SwapRowWithActions[] = [];
  const mine: SwapRowWithActions[] = [];
  const others: SwapRowWithActions[] = [];
  for (const row of rows) {
    if (row.actions.some((a) => WAITING_ACTIONS.has(a))) waiting.push(row);
    else if (row.proposerId === viewerId || row.colleagueId === viewerId) mine.push(row);
    else others.push(row);
  }
  return {
    waiting: waiting.slice(0, SWAP_LIST_SHOWN),
    waitingTotal: waiting.length,
    mine: mine.slice(0, SWAP_LIST_SHOWN),
    mineTotal: mine.length,
    others: others.slice(0, SWAP_LIST_SHOWN),
    othersTotal: others.length,
  };
}

export function swapActionLabel(action: string): string {
  switch (action) {
    case "accept":
      return "Accept";
    case "decline":
      return "Decline";
    case "cancel":
      return "Cancel request";
    case "approve":
      return "Approve";
    case "reject":
      return "Reject";
    default:
      return action;
  }
}

/** The "are you sure?" wording for each action, saying plainly what happens next. */
export function confirmSwapAction(
  action: string,
  row: SwapRow,
): { title: string; body: string; confirm: string } {
  switch (action) {
    case "accept":
      return {
        title: "Accept this swap?",
        body: `You would work ${row.proposerName}'s ${row.proposerShiftLabel} instead of your own shift. Nothing changes until a manager approves it.`,
        confirm: "Accept",
      };
    case "decline":
      return {
        title: "Decline this swap?",
        body: `${row.proposerName} will see that you declined. Both of you keep your own shifts.`,
        confirm: "Decline",
      };
    case "cancel":
      return {
        title: "Cancel your request?",
        body: `The swap with ${row.colleagueName} is withdrawn and both of you keep your own shifts.`,
        confirm: "Cancel request",
      };
    case "approve":
      return {
        title: "Approve this swap?",
        body: `${row.proposerName} will work ${row.colleagueShiftLabel} and ${row.colleagueName} will work ${row.proposerShiftLabel}. Both rotas change now. This can't be undone from here; a manager can still change either shift by hand.`,
        confirm: "Approve swap",
      };
    case "reject":
      return {
        title: "Reject this swap?",
        body: `${row.proposerName} and ${row.colleagueName} keep their own shifts and both will see that it was rejected.`,
        confirm: "Reject",
      };
    default:
      return { title: "Change this swap?", body: "", confirm: "Continue" };
  }
}

/** The proposal form's own check before sending; the server checks everything again. */
export function validateSwapProposal(input: { colleagueId: string; note: string }): string | null {
  if (!input.colleagueId) return "Choose a colleague to swap with.";
  if (input.note.trim().length > SWAP_NOTE_MAX_LENGTH) {
    return `Keep the note to ${SWAP_NOTE_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}
