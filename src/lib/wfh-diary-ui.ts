/**
 * Words and small figures for the work-session page (task 2.3b, phase 3). Pure, so they can be tested.
 * The server decides everything; these only say it in plain words.
 */
import type { FlagCode } from "./wfh-diary.ts";

/** "0 min", "45 min", "2 h", "2 h 10 min". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** The manager's decision on the day, as the person sees it, in the style guide's status colors. */
export function dayStatusLabel(status: string): { text: string; className: string } {
  const pill = "inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold";
  if (status === "approved") return { text: "Approved by your manager", className: `${pill} bg-[#CBEED3] text-[#0E2322]` };
  if (status === "flagged") return { text: "Your manager has questions", className: `${pill} bg-amber-100 text-amber-900` };
  return { text: "Waiting for your manager", className: `${pill} bg-slate-100 text-slate-700` };
}

/** What the session is doing now. */
export function sessionStateLabel(status: string): string {
  if (status === "active") return "Recording";
  if (status === "paused") return "Paused";
  return "Ended";
}

const FLAG_SHORT: Record<FlagCode, string> = {
  identical_counts: "The same counts several blocks in a row",
  too_regular: "Unusually regular timing",
  moves_only: "Mouse movement with no clicks or typing for two hours",
  active_while_hidden: "Input while the page was hidden",
  never_idle: "No pause at all for three hours",
  no_activity: "Some blocks with no activity in this page (often normal)",
};

/** A short line for each flag the person can see on their own day. Unknown codes are skipped. */
export function flagLines(codes: readonly string[]): string[] {
  return codes.filter((c): c is FlagCode => c in FLAG_SHORT).map((c) => FLAG_SHORT[c]);
}

/** Seconds left to answer a check, never below zero. */
export function secondsLeft(dueAtMs: number, nowMs: number, windowMs: number): number {
  return Math.max(0, Math.ceil((dueAtMs + windowMs - nowMs) / 1000));
}

/** One block on the review strip: its colour (style guide status colors only) and its plain name. */
export function blockLook(state: string): { className: string; label: string } {
  switch (state) {
    case "verified":
      return { className: "bg-[#CBEED3] border-emerald-600/30", label: "Counted" };
    case "unverified":
      return { className: "bg-amber-100 border-amber-400", label: "Not counted (missed check or bad signature)" };
    case "paused":
      return { className: "bg-slate-100 border-slate-300", label: "Paused" };
    default:
      return { className: "bg-white border-slate-300 border-dashed", label: "Waiting for a check" };
  }
}

/** How many still-here checks were answered, missed, or are still open, as of `nowMs`. */
export function checkTally(checks: readonly { dueAtMs: number; answeredAtMs: number | null }[], nowMs: number, windowMs: number) {
  let answered = 0;
  let missed = 0;
  let open = 0;
  for (const c of checks) {
    if (c.answeredAtMs !== null) answered++;
    else if (nowMs > c.dueAtMs + windowMs) missed++;
    else open++;
  }
  return { answered, missed, open };
}

/** The day's decision as the manager sees it. */
export function reviewStatusLabel(status: string): { text: string; className: string } {
  const pill = "inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold";
  if (status === "approved") return { text: "Approved", className: `${pill} bg-[#CBEED3] text-[#0E2322]` };
  if (status === "flagged") return { text: "Flagged", className: `${pill} bg-amber-100 text-amber-900` };
  return { text: "Waiting for your decision", className: `${pill} bg-slate-100 text-slate-700` };
}
