import { useCallback, useEffect, useState } from "react";
import { firebaseAuth } from "@/integrations/firebase/config";
import type { AttendanceRegister, LeaveLedger } from "@/lib/report-types";
import type { DateRange } from "./ReportFrame";

type Kind = "register" | "leave";
type ReportOf<K extends Kind> = K extends "register" ? AttendanceRegister : LeaveLedger;

/**
 * Fetches one report from the server for a date range. Identity travels only as the signed-in
 * user's token; the range is the only thing the page chooses. Nothing is calculated here.
 */
export function useReport<K extends Kind>(kind: K, range: DateRange) {
  const [data, setData] = useState<ReportOf<K> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        const qs = new URLSearchParams({ from: range.from, to: range.to });
        const res = await fetch(`/api/reports/${kind}?${qs.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const body = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setError(
            typeof body?.error === "string" && res.status < 500
              ? body.error
              : "We couldn't load this report. Please try again.",
          );
          setData(null);
        } else {
          setData(body.report as ReportOf<K>);
        }
      } catch {
        if (active) {
          setError("We couldn't load this report. Check your connection and try again.");
          setData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [kind, range.from, range.to, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, loading, error, retry };
}
