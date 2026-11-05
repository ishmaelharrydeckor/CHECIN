import { useEffect, useRef } from "react";
import type { ShortcutEventId } from "@/lib/shortcuts";

/** The name of the browser event the global listener sends when a shortcut means something to the page. */
export const SHORTCUT_EVENT = "checin:shortcut";

/**
 * Lets a page say what a shortcut does on it, for example "r" refreshes this page's numbers. The global listener
 * (GlobalShortcuts) has already checked that the person is not typing, no dialog is in the way and shortcuts are on,
 * so a page only handles the meaning. A page that does not handle a shortcut simply ignores it.
 */
export function useShortcutActions(handlers: Partial<Record<ShortcutEventId, () => void>>): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ id?: ShortcutEventId }>).detail?.id;
      if (id) latest.current[id]?.();
    };
    window.addEventListener(SHORTCUT_EVENT, on);
    return () => window.removeEventListener(SHORTCUT_EVENT, on);
  }, []);
}

export function useShortcutAction(id: ShortcutEventId, handler: () => void): void {
  useShortcutActions({ [id]: handler });
}
