/**
 * Keyboard shortcuts for the signed-in app. Pure: no browser, no React, no clock (time is passed in), so every rule
 * can be tested. The browser side that listens to the keyboard is src/components/shortcuts/GlobalShortcuts.tsx.
 *
 * The rules, in one place:
 *  - Never while typing in a box, and never while a dialog is open (except dialogs that ask for it).
 *  - Never a key combination the browser owns (Ctrl+N, T, W, R, L, S, P, F, F5).
 *  - "g then a letter" goes to a page, and only to a page that is in that person's own menu.
 *  - Nothing destructive on one key: approving or flagging always asks first (the page does the asking).
 *  - Single-letter shortcuts can be switched off (accessibility), but Ctrl/Cmd+K and Ctrl/Cmd+B stay.
 */

export type Scope = "everyone" | "manager" | "employee" | "review";

export type ShortcutEventId =
  | "refresh"
  | "focus-search"
  | "toggle-menu"
  | "filter-1"
  | "filter-2"
  | "filter-3"
  | "filter-4"
  | "filter-5"
  | "prev-day"
  | "next-day"
  | "invite"
  | "list-next"
  | "list-prev"
  | "list-open"
  | "decide-approve"
  | "decide-flag";

export type ShortcutAction =
  | { type: "go"; path: string }
  | { type: "help" }
  | { type: "event"; id: ShortcutEventId };

/** A line of the help card. */
export interface ShortcutDef {
  /** What is pressed, in order: ["g", "then", "r"]. */
  keys: string[];
  label: string;
  scope: Scope;
  /** 1: everyone, 2: managers and admins' daily work, 3: reviewing the work diary. */
  tier: 1 | 2 | 3;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { keys: ["Ctrl or Cmd", "K"], label: "Jump to a page", scope: "everyone", tier: 1 },
  { keys: ["?"], label: "Show this list", scope: "everyone", tier: 1 },
  { keys: ["/"], label: "Go to the search box on the page", scope: "everyone", tier: 1 },
  { keys: ["Ctrl or Cmd", "B"], label: "Collapse or open the left menu", scope: "everyone", tier: 1 },
  { keys: ["Esc"], label: "Close a box", scope: "everyone", tier: 1 },
  { keys: ["g", "then", "u"], label: "Go to my account", scope: "everyone", tier: 1 },
  { keys: ["g", "then", "a"], label: "Go to Announcements", scope: "everyone", tier: 1 },
  { keys: ["g", "then", "h"], label: "Go to Holidays", scope: "everyone", tier: 1 },
  { keys: ["g", "then", "l"], label: "Go to Leave", scope: "everyone", tier: 1 },
  { keys: ["g", "then", "d"], label: "Go to the Dashboard", scope: "manager", tier: 1 },
  { keys: ["g", "then", "r"], label: "Go to Reports", scope: "manager", tier: 1 },
  { keys: ["g", "then", "s"], label: "Go to Shifts", scope: "manager", tier: 1 },
  { keys: ["g", "then", "w"], label: "Go to the Work diary review", scope: "manager", tier: 1 },
  { keys: ["g", "then", ","], label: "Go to Settings", scope: "manager", tier: 1 },
  { keys: ["g", "then", "d"], label: "Go to My History", scope: "employee", tier: 1 },
  { keys: ["g", "then", "m"], label: "Go to My page", scope: "employee", tier: 1 },
  { keys: ["g", "then", "s"], label: "Go to My Shifts", scope: "employee", tier: 1 },
  { keys: ["g", "then", "w"], label: "Go to my Work diary", scope: "employee", tier: 1 },
  { keys: ["s"], label: "Open the scanner (on My page)", scope: "employee", tier: 1 },
  { keys: ["r"], label: "Refresh the numbers on this page", scope: "manager", tier: 2 },
  { keys: ["1", "to", "5"], label: "On the roster: Everyone, Here today, Late, Away, Not here yet", scope: "manager", tier: 2 },
  { keys: ["[", "and", "]"], label: "Previous and next day (work diary review)", scope: "manager", tier: 2 },
  { keys: ["i"], label: "Invite staff (on the dashboard)", scope: "manager", tier: 2 },
  { keys: ["j", "and", "k"], label: "Move down and up the list of people (work diary review)", scope: "review", tier: 3 },
  { keys: ["Enter"], label: "Open the person you are on", scope: "review", tier: 3 },
  { keys: ["a"], label: "Approve the day (asks you to confirm)", scope: "review", tier: 3 },
  { keys: ["f"], label: "Flag the day (asks you to confirm)", scope: "review", tier: 3 },
];

/** Combinations the browser owns. None of them is ever used here. */
export const BROWSER_OWNED = ["ctrl+n", "ctrl+t", "ctrl+w", "ctrl+r", "ctrl+l", "ctrl+s", "ctrl+p", "ctrl+f", "f5"] as const;

/** The shortcuts a person is shown: everyone's, plus their own kind's, plus the review ones for managers. */
export function shortcutsFor(canManage: boolean): ShortcutDef[] {
  return SHORTCUTS.filter((s) => s.scope === "everyone" || s.scope === (canManage ? "manager" : "employee") || (canManage && s.scope === "review"));
}

// ---------------------------------------------------------------- "g then a letter"
interface GoTarget {
  manager?: string;
  employee?: string;
}

/** Where "g then <letter>" goes. A path is used only when it is in the person's own menu (or is their account). */
export const GO_TARGETS: Readonly<Record<string, GoTarget>> = {
  d: { manager: "/dashboard", employee: "/history" },
  r: { manager: "/reports" },
  s: { manager: "/shifts", employee: "/my-shifts" },
  w: { manager: "/wfh-review", employee: "/wfh-diary" },
  l: { manager: "/leave", employee: "/leave" },
  a: { manager: "/announcements", employee: "/announcements" },
  h: { manager: "/holidays", employee: "/holidays" },
  m: { employee: "/me" },
  ",": { manager: "/settings" },
  u: { manager: "/account", employee: "/account" },
};

export function resolveGo(letter: string, canManage: boolean, allowedPaths: readonly string[]): string | null {
  const target = GO_TARGETS[letter.toLowerCase()];
  const path = target ? (canManage ? target.manager : target.employee) : undefined;
  if (!path) return null;
  if (path === "/account") return path; // the account page is reached from the menu footer, not a menu item
  return allowedPaths.includes(path) ? path : null;
}

// ---------------------------------------------------------------- the key press
/** What the browser side tells us about one key press. */
export interface KeyInput {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  repeat: boolean;
  /** The focus is in a text box, a list, a select or an editable area. */
  typing: boolean;
  /** The focus is on a button, link or similar control (Enter would press it). */
  onControl: boolean;
  /** A dialog that does not ask for shortcuts is open. */
  blocked: boolean;
}

export interface KeyContext {
  canManage: boolean;
  /** The pages in this person's own menu. */
  allowedPaths: readonly string[];
  /** The page they are on, to know when "s" may open the scanner. */
  pathname: string;
  /** False when the person switched single-letter shortcuts off. */
  singleKeysOn: boolean;
}

export interface KeyState {
  /** "g" was pressed and we are waiting for the letter. */
  pendingG: boolean;
  pendingAt: number;
}

export const INITIAL_KEY_STATE: KeyState = { pendingG: false, pendingAt: 0 };
/** How long after "g" the next letter still counts. */
export const SEQUENCE_WINDOW_MS = 1500;

const DIGIT_EVENTS: Record<string, ShortcutEventId> = { "1": "filter-1", "2": "filter-2", "3": "filter-3", "4": "filter-4", "5": "filter-5" };

/**
 * One key press in, the action to take and the new state out. Never throws, never reads the page.
 * Returns action null for everything that is not a shortcut, so the key does its normal job.
 */
export function step(state: KeyState, input: KeyInput, ctx: KeyContext, nowMs: number): { state: KeyState; action: ShortcutAction | null } {
  const idle = INITIAL_KEY_STATE;
  if (input.repeat) return { state, action: null };

  const mod = input.ctrl || input.meta;

  // Combinations: only Ctrl or Cmd with B (Ctrl or Cmd with K is handled by the Jump to box itself).
  if (mod || input.alt) {
    if (mod && !input.alt && input.key.toLowerCase() === "b" && !input.typing && !input.blocked) {
      return { state: idle, action: { type: "event", id: "toggle-menu" } };
    }
    return { state: idle, action: null };
  }

  if (input.typing || input.blocked) return { state: idle, action: null };
  if (!ctx.singleKeysOn) return { state: idle, action: null };

  const key = input.key;

  // Second key of "g then ...".
  if (state.pendingG) {
    const fresh = nowMs - state.pendingAt <= SEQUENCE_WINDOW_MS;
    if (fresh && key.length === 1) {
      const path = resolveGo(key, ctx.canManage, ctx.allowedPaths);
      return { state: idle, action: path ? { type: "go", path } : null };
    }
    // Too late, or not a letter: forget the "g" and treat this key normally (below).
  }

  if (key === "g") return { state: { pendingG: true, pendingAt: nowMs }, action: null };
  if (key === "?") return { state: idle, action: { type: "help" } };
  if (key === "/") return { state: idle, action: { type: "event", id: "focus-search" } };

  if (ctx.canManage) {
    if (key === "r") return { state: idle, action: { type: "event", id: "refresh" } };
    if (key === "i") return { state: idle, action: { type: "event", id: "invite" } };
    if (key === "[") return { state: idle, action: { type: "event", id: "prev-day" } };
    if (key === "]") return { state: idle, action: { type: "event", id: "next-day" } };
    if (key in DIGIT_EVENTS) return { state: idle, action: { type: "event", id: DIGIT_EVENTS[key] } };
    if (key === "j") return { state: idle, action: { type: "event", id: "list-next" } };
    if (key === "k") return { state: idle, action: { type: "event", id: "list-prev" } };
    if (key === "a") return { state: idle, action: { type: "event", id: "decide-approve" } };
    if (key === "f") return { state: idle, action: { type: "event", id: "decide-flag" } };
    // Enter opens the person you are on, but never while a button or link has the focus (it would press it too).
    if (key === "Enter" && !input.onControl) return { state: idle, action: { type: "event", id: "list-open" } };
  } else if (key === "s" && ctx.pathname === "/me") {
    return { state: idle, action: { type: "go", path: "/scan" } };
  }
  return { state: idle, action: null };
}

// ---------------------------------------------------------------- the preference
export const SHORTCUT_PREF_KEY = "checin.shortcuts.single";

/** Single-letter shortcuts are on unless the person switched them off. */
export function singleKeysEnabled(stored: string | null | undefined): boolean {
  return stored !== "off";
}
