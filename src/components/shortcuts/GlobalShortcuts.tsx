import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ShortcutsHelp } from "@/components/shortcuts/ShortcutsHelp";
import { SHORTCUT_EVENT } from "@/components/shortcuts/useShortcutAction";
import { useShortcutPref } from "@/components/shortcuts/useShortcutPref";
import { INITIAL_KEY_STATE, step, type KeyContext, type KeyInput, type KeyState } from "@/lib/shortcuts";

/** Boxes where letters are typed, or lists where letters pick an item: shortcuts must stay out of the way. */
function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color"].includes(type);
  }
  if ((el as HTMLElement).isContentEditable) return true;
  const role = el.getAttribute("role");
  return role === "textbox" || role === "combobox" || role === "listbox" || role === "searchbox" || role === "spinbutton";
}

/** A button, link or similar control that Enter would press. */
function isControl(el: Element | null): boolean {
  return !!el?.closest('button, a, summary, [role="button"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"]');
}

/** A dialog is open and has not asked for shortcuts (a confirm box never does). */
function blockedByDialog(): boolean {
  return !!document.querySelector('[role="alertdialog"][data-state="open"], [role="dialog"][data-state="open"]:not([data-allow-shortcuts])');
}

/**
 * Listens to the keyboard for the whole signed-in app (mounted once, in the app shell). The rules live in
 * src/lib/shortcuts.ts; this only reads the page and carries the answer out. "g then a letter" goes to a page, "?" opens
 * the list, and anything that means something on one page is sent to it as an event (useShortcutAction).
 */
export function GlobalShortcuts({
  canManage,
  allowedPaths,
  onToggleMenu,
}: {
  canManage: boolean;
  allowedPaths: readonly string[];
  onToggleMenu: () => void;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [singleKeysOn] = useShortcutPref();
  const [helpOpen, setHelpOpen] = useState(false);
  const state = useRef<KeyState>(INITIAL_KEY_STATE);

  // The listener is installed once; it reads what it needs from here.
  const latest = useRef({ canManage, allowedPaths, pathname, singleKeysOn, onToggleMenu, navigate });
  latest.current = { canManage, allowedPaths, pathname, singleKeysOn, onToggleMenu, navigate };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const now = latest.current;
      const target = document.activeElement ?? (e.target as Element | null);
      const input: KeyInput = {
        key: e.key,
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        alt: e.altKey,
        repeat: e.repeat,
        typing: isTyping(target) || isTyping(e.target as Element | null),
        onControl: isControl(target),
        blocked: blockedByDialog(),
      };
      const ctx: KeyContext = { canManage: now.canManage, allowedPaths: now.allowedPaths, pathname: now.pathname, singleKeysOn: now.singleKeysOn };
      const result = step(state.current, input, ctx, Date.now());
      state.current = result.state;
      const action = result.action;
      if (!action) return;

      if (action.type === "go") {
        e.preventDefault();
        now.navigate({ to: action.path as never });
      } else if (action.type === "help") {
        e.preventDefault();
        setHelpOpen(true);
      } else if (action.id === "toggle-menu") {
        e.preventDefault();
        now.onToggleMenu();
      } else if (action.id === "focus-search") {
        const box = document.querySelector<HTMLElement>("[data-shortcut-search]");
        if (box) {
          e.preventDefault(); // so the "/" is not typed into the box
          box.focus();
        }
      } else {
        // Page actions: the page decides what they mean. A key the page does not use must keep its normal job, so the
        // browser's default is only stopped for keys that are never typed anywhere.
        window.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { detail: { id: action.id } }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} canManage={canManage} />;
}
