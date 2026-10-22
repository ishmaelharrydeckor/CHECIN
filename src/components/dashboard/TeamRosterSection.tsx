import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/components/shifts/shiftApi";
import { TeamRoster } from "@/components/dashboard/TeamRoster";
import type { RosterData } from "@/lib/team-roster";

/**
 * Connects the team roster to the server. Loaded once when the page opens and again when the person presses
 * Refresh; nothing polls (the Today panel above is the part that refreshes by itself).
 */
export function TeamRosterSection() {
  const [data, setData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    setError(null);
    const result = await authedFetch<{ roster: RosterData }>(`/api/attendance/roster${fresh ? "?fresh=1" : ""}`);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setData(result.data.roster);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return <TeamRoster data={data} loading={loading} error={error} onRefresh={() => void load(true)} />;
}
