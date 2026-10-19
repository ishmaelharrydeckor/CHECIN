import { useCallback, useEffect, useState } from "react";
import { authedFetch, type SwapListData } from "./shiftApi";
import { SwapList } from "./SwapList";

/**
 * Managers and admins: the swaps waiting for their approval first, then the rest they can see (a
 * manager's team, an admin's organization). An approval changes the rota, so `onChanged` lets the
 * page refresh it.
 */
export function SwapsTab({ viewerId, isOrgAdmin }: { viewerId: string; isOrgAdmin: boolean }) {
  const [data, setData] = useState<SwapListData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await authedFetch<SwapListData>("/api/shifts/swaps");
    if (!result.ok) return setError(result.error);
    setData(result.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const off = data !== null && !data.enabled;
  return (
    <div className="space-y-4">
      {off && (
        <p className="rounded-xl border border-[#F5E6B0] bg-[#FCF2CB] px-4 py-3 text-xs text-[#854D0E]">
          Shift swaps are switched off, so nobody can ask for or approve a swap.
          {isOrgAdmin ? " You can switch them on in the Settings tab." : " An organization admin can switch them on."}
        </p>
      )}
      <SwapList
        title="Shift swaps"
        description={
          isOrgAdmin
            ? "Swaps across your organization. Approve a swap once both people agree; when the two have different managers, only an admin can decide."
            : "Swaps involving your team. Approve a swap once both people agree; when the two have different managers, an admin decides."
        }
        viewerId={viewerId}
        data={data}
        error={error}
        onRetry={() => void load()}
        onChanged={() => void load()}
        emptyText="When someone in your team asks to swap a shift and their colleague accepts, it will wait here for approval."
      />
    </div>
  );
}
