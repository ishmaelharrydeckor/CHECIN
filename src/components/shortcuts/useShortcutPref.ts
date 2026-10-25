import { useCallback, useEffect, useState } from "react";
import { SHORTCUT_PREF_KEY, singleKeysEnabled } from "@/lib/shortcuts";

const CHANGED = "checin:shortcut-pref";

function read(): boolean {
  try {
    return singleKeysEnabled(window.localStorage.getItem(SHORTCUT_PREF_KEY));
  } catch {
    return true; // storage blocked (private window): shortcuts stay on
  }
}

/**
 * Whether single-letter shortcuts are on. A per-device convenience: kept in this browser, so a failure to read or write
 * it is ignored. Ctrl or Cmd with K and B are not affected by it.
 */
export function useShortcutPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(read());
    const update = () => setOn(read());
    window.addEventListener(CHANGED, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CHANGED, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(SHORTCUT_PREF_KEY, next ? "on" : "off");
    } catch {
      // Not remembered, but it still applies until the page is reloaded.
    }
    setOn(next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return [on, set];
}
