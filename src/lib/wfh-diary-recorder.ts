/**
 * What the work-session page counts in one 10-minute block (task 2.3b, phase 3), as pure functions.
 *
 * Only **counts** of real input inside the ChecIN page: how many key presses, clicks, scrolls and
 * mouse movements, which minutes had any, how long the page was visible, and how irregular the gaps
 * between events were. Never which key, what was typed, or anything on the screen. Events a script
 * makes (`isTrusted` false in the browser) are ignored. No clock reads: times are passed in.
 */
import { DIARY_INTERVAL_MINUTES, DIARY_INTERVAL_MS, MAX_COUNT_PER_INTERVAL, intervalWindow } from "./wfh-diary.ts";

export type InputKind = "key" | "click" | "scroll" | "move";

export interface InputEvent {
  type: InputKind;
  atMs: number;
  /** The browser's `isTrusted`: false for events a script made up. */
  trusted: boolean;
}

/** Mouse movement fires many times a second; it is counted at most once per this many milliseconds. */
export const MOVE_THROTTLE_MS = 250;
/** Fewer gaps than this are too few to say anything about regularity. */
const MIN_GAPS = 10;
/** A block that finished longer ago than this is not reported: the page was asleep or closed then. */
export const SEND_GRACE_MS = 2 * 60_000;

export interface BlockState {
  startMs: number;
  counts: { keys: number; clicks: number; scrolls: number; moves: number };
  minutes: number[];
  lastMoveAt: number | null;
  lastEventAt: number | null;
  gapN: number;
  gapSum: number;
  gapSumSq: number;
  visibleMs: number;
  visibleSince: number | null;
}

export function newBlock(startMs: number, visible: boolean): BlockState {
  return {
    startMs,
    counts: { keys: 0, clicks: 0, scrolls: 0, moves: 0 },
    minutes: [],
    lastMoveAt: null,
    lastEventAt: null,
    gapN: 0,
    gapSum: 0,
    gapSumSq: 0,
    visibleMs: 0,
    visibleSince: visible ? startMs : null,
  };
}

const COUNT_FIELD: Record<InputKind, keyof BlockState["counts"]> = {
  key: "keys",
  click: "clicks",
  scroll: "scrolls",
  move: "moves",
};

/** Adds one event to the block, if it is real input inside the block. */
export function addEvent(state: BlockState, ev: InputEvent): BlockState {
  if (!ev.trusted) return state;
  if (ev.atMs < state.startMs || ev.atMs >= state.startMs + DIARY_INTERVAL_MS) return state;
  if (ev.type === "move" && state.lastMoveAt !== null && ev.atMs - state.lastMoveAt < MOVE_THROTTLE_MS) return state;
  const field = COUNT_FIELD[ev.type];
  if (state.counts[field] >= MAX_COUNT_PER_INTERVAL) return state;
  const next: BlockState = { ...state, counts: { ...state.counts, [field]: state.counts[field] + 1 } };
  if (ev.type === "move") next.lastMoveAt = ev.atMs;
  const minute = Math.floor((ev.atMs - state.startMs) / 60_000);
  if (!state.minutes.includes(minute)) next.minutes = [...state.minutes, minute];
  // Regularity is judged on deliberate input (keys, clicks, scrolls), not on mouse movement.
  if (ev.type !== "move") {
    if (state.lastEventAt !== null) {
      const gap = ev.atMs - state.lastEventAt;
      next.gapN = state.gapN + 1;
      next.gapSum = state.gapSum + gap;
      next.gapSumSq = state.gapSumSq + gap * gap;
    }
    next.lastEventAt = ev.atMs;
  }
  return next;
}

/** The page was shown or hidden at `atMs`. */
export function setVisible(state: BlockState, visible: boolean, atMs: number): BlockState {
  const at = Math.min(Math.max(atMs, state.startMs), state.startMs + DIARY_INTERVAL_MS);
  if (visible) return state.visibleSince === null ? { ...state, visibleSince: at } : state;
  if (state.visibleSince === null) return state;
  return { ...state, visibleMs: state.visibleMs + (at - state.visibleSince), visibleSince: null };
}

/** The figures sent for the block once it has ended. */
export function finishBlock(state: BlockState, endMs: number) {
  const closed = setVisible(state, false, endMs);
  let gapCv: number | null = null;
  if (closed.gapN >= MIN_GAPS && closed.gapSum > 0) {
    const mean = closed.gapSum / closed.gapN;
    const variance = Math.max(0, closed.gapSumSq / closed.gapN - mean * mean);
    gapCv = Math.round((Math.sqrt(variance) / mean) * 1000) / 1000;
  }
  return {
    counts: closed.counts,
    activeMinutes: Math.min(closed.minutes.length, DIARY_INTERVAL_MINUTES),
    visibleSeconds: Math.min(Math.round(closed.visibleMs / 1000), DIARY_INTERVAL_MINUTES * 60),
    gapCv,
  };
}

/**
 * Which blocks to report now: those that ended within the last two minutes (and before the session
 * ended), not yet sent. A block the page slept through is never reported afterwards, so time the
 * page did not see is never invented.
 */
export function blocksToSend(input: { startedAtMs: number; nowMs: number; endMs: number | null; done: Set<number> }): number[] {
  const { startedAtMs, nowMs, endMs, done } = input;
  const limit = Math.min(nowMs, endMs ?? nowMs);
  const out: number[] = [];
  const last = Math.floor((limit - startedAtMs) / DIARY_INTERVAL_MS) - 1;
  for (let i = Math.max(0, last - 1); i <= last; i++) {
    const w = intervalWindow(startedAtMs, i);
    if (done.has(i) || w.endMs > limit) continue;
    if (nowMs - w.endMs > SEND_GRACE_MS) continue;
    out.push(i);
  }
  return out;
}
