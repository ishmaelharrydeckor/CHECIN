import { useCallback, useRef, useState } from "react";
import { firebaseAuth } from "@/integrations/firebase/config";
import type { TimesheetReport } from "@/lib/timesheet-build";

export interface TimesheetRange {
  from: string; // "YYYY-MM-DD"
  to: string;
}

/**
 * Loads the timesheet from the server when asked ("Show"), never on its own: a big range is a choice, not a surprise.
 * Identity travels only as the signed-in person's token; the dates are the only thing the page chooses. Nothing is
 * calculated here. A newer request replaces an older one that is still on its way.
 */
export function useTimesheet() {
  const [data, setData] = useState<TimesheetReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const latest = useRef(0);
  const lastRange = useRef<TimesheetRange | null>(null);

  const load = useCallback(async (range: TimesheetRange) => {
    const mine = ++latest.current;
    lastRange.current = range;
    setAsked(true);
    setLoading(true);
    setError(null);
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      const res = await fetch(`/api/reports/timesheet?${qs.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => ({}));
      if (mine !== latest.current) return;
      if (!res.ok) {
        setError(
          typeof body?.error === "string" && res.status < 500
            ? body.error
            : "We couldn't load the timesheet. Please try again.",
        );
        setData(null);
      } else {
        setData(body.report as TimesheetReport);
      }
    } catch {
      if (mine === latest.current) {
        setError("We couldn't load the timesheet. Check your connection and try again.");
        setData(null);
      }
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    if (lastRange.current) void load(lastRange.current);
  }, [load]);

  return { data, loading, error, asked, load, retry };
}
