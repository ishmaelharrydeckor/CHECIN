import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch } from "@/components/shifts/shiftApi";
import { EMPTY_NAV_COUNTS, parseNavCounts, shouldRefreshCounts, type NavCounts } from "@/lib/nav-helpers";

/**
 * The waiting-work counts for the menu badges. Fetched when the menu first shows and then at most once a
 * minute, when the person moves to another page or comes back to the tab. There is no timer. If it cannot
 * be read the badges simply stay as they were; the menu never depends on it.
 */
export function useNavCounts(enabled: boolean, pathname: string): NavCounts {
  const [counts, setCounts] = useState<NavCounts>(EMPTY_NAV_COUNTS);
  const lastFetched = useRef<number | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || inFlight.current || !shouldRefreshCounts(lastFetched.current, Date.now())) return;
    inFlight.current = true;
    lastFetched.current = Date.now();
    const result = await authedFetch<Record<string, unknown>>("/api/nav-counts");
    inFlight.current = false;
    if (result.ok) setCounts(parseNavCounts(result.data));
  }, [enabled]);

  // On first show and on every move to another page.
  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  // When the person comes back to this tab.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, refresh]);

  return enabled ? counts : EMPTY_NAV_COUNTS;
}
