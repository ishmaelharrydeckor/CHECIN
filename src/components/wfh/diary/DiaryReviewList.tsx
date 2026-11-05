import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMinutes } from "@/lib/wfh-diary-ui";
import { decisionState, managerStatusLabel, sortForReview, type TeamDay } from "@/lib/wfh-diary-review";

/**
 * One row per person for the chosen day. Open a row for the detail; approve or flag from the row when the
 * figures are final. A card on a phone, a line on a wide screen.
 */
export function DiaryReviewList({
  days,
  busyId,
  selectedId = null,
  onOpen,
  onDecide,
}: {
  days: TeamDay[];
  busyId: string | null;
  /** The person the keyboard is on (j and k); drawn with an outline. */
  selectedId?: string | null;
  onOpen: (day: TeamDay) => void;
  onDecide: (day: TeamDay, decision: "approve" | "flag") => void;
}) {
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {sortForReview(days).map((d) => {
        const status = managerStatusLabel(d.status);
        const can = decisionState(d);
        const busy = busyId === d.employeeId;
        return (
          <li
            key={d.employeeId}
            id={`diary-row-${d.employeeId}`}
            aria-current={selectedId === d.employeeId ? "true" : undefined}
            className={`p-3 sm:p-4 ${selectedId === d.employeeId ? "ring-2 ring-inset ring-[#0E2322]/40 bg-slate-50" : ""}`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => onOpen(d)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-label={`Open ${d.employeeName || "this person"}'s day`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0E2322]">{d.employeeName || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground">
                    Counted {formatMinutes(d.verifiedMinutes)}
                    {d.unverifiedMinutes + d.pausedMinutes > 0 && <> · not counted {formatMinutes(d.unverifiedMinutes + d.pausedMinutes)}</>}
                    {d.pendingMinutes > 0 && <> · waiting {formatMinutes(d.pendingMinutes)}</>}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={status.className}>{status.text}</span>
                    {d.reviewFlags > 0 && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">
                        {d.reviewFlags === 1 ? "1 thing to look at" : `${d.reviewFlags} things to look at`}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden="true" />
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={!can.approve || busy}
                  onClick={() => onDecide(d, "approve")}
                  className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                >
                  {busy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                  Approve
                </Button>
                <Button type="button" variant="outline" disabled={!can.flag || busy} onClick={() => onDecide(d, "flag")} className="h-10 border-slate-200 text-xs">
                  Flag
                </Button>
                <Button type="button" variant="ghost" onClick={() => onOpen(d)} className="hidden h-10 text-xs sm:inline-flex">
                  Details
                </Button>
              </div>
            </div>
            {can.note && d.status === "pending" && <p className="mt-2 text-xs text-muted-foreground">{can.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}
