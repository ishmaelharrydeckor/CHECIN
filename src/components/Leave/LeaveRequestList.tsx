import { useState } from "react";
import {
  LEAVE_TYPE_LABELS,
  countDays,
  formatRange,
  type LeaveRequest,
  type LeaveStatus,
} from "@/lib/leave";

interface Props {
  requests: LeaveRequest[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  /** Show approve/deny buttons on pending requests (manager / org admin). */
  canReview?: boolean;
  /** Show who the request belongs to (manager / org admin views). */
  showEmployee?: boolean;
  onReview?: (id: string, decision: Exclude<LeaveStatus, "pending">) => Promise<void>;
}

const STATUS_STYLES: Record<LeaveStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  denied: "bg-red-100 text-red-800",
};

function StatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export function LeaveRequestList({
  requests,
  loading,
  error,
  emptyMessage,
  canReview = false,
  showEmployee = false,
  onReview,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleReview(id: string, decision: Exclude<LeaveStatus, "pending">) {
    if (!onReview) return;
    setActionError(null);
    setBusyId(id);
    try {
      await onReview(id, decision);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <p role="status" className="py-8 text-center text-gray-500">
        Loading requests…
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (requests.length === 0) {
    return <p className="py-8 text-center text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      <ul className="space-y-3">
        {requests.map((r) => {
          const days = countDays(r.startDate, r.endDate);
          const busy = busyId === r.id;
          return (
            <li key={r.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{LEAVE_TYPE_LABELS[r.type]}</p>
                  <p className="text-sm text-gray-600">
                    {formatRange(r.startDate, r.endDate)} · {days} {days === 1 ? "day" : "days"}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>

              {showEmployee && (
                // Display names live in users/{uid}, which managers can't read under the
                // current rules, so we show a short ID. See PR note on employeeName.
                <p className="mt-2 text-xs text-gray-500">
                  Employee ID: <span className="font-mono">{r.employeeId.slice(0, 8)}…</span>
                </p>
              )}

              {r.note && <p className="mt-2 break-words text-sm text-gray-700">{r.note}</p>}

              {canReview && r.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleReview(r.id, "approved")}
                    className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 sm:flex-none"
                  >
                    {busy ? "Saving…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleReview(r.id, "denied")}
                    className="flex-1 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60 sm:flex-none"
                  >
                    Deny
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}