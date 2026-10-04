import { createFileRoute } from "@tanstack/react-router";
import { LeaveRequestForm } from "@/components/leave/LeaveRequestForm";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import { useLeaveIdentity } from "@/components/leave/useLeaveIdentity";
import { useLeaveRequests } from "@/components/leave/useLeaveRequests";

export const Route = createFileRoute("/_authenticated/leave")({
  component: LeavePage,
});

function LeavePage() {
  const identity = useLeaveIdentity();

  if (identity.status === "loading") {
    return (
      <p role="status" className="p-6 text-center text-gray-500">
        Loading…
      </p>
    );
  }

  if (identity.status === "signed-out") {
    return <p className="p-6 text-center text-gray-500">Please sign in to view leave requests.</p>;
  }

  if (identity.status === "invalid") {
    return (
      <p role="alert" className="p-6 text-center text-red-700">
        Your account isn't set up for this organization yet. Contact your administrator.
      </p>
    );
  }

  return <LeaveContent identity={identity} />;
}

function LeaveContent({
  identity,
}: {
  identity: Extract<ReturnType<typeof useLeaveIdentity>, { status: "ready" }>;
}) {
  const { requests, loading, error, submit, review } = useLeaveRequests(identity);
  const { role } = identity;

  if (role === "employee") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <h1 className="text-2xl font-semibold">Leave</h1>
        {identity.managerId ? (
          <LeaveRequestForm onSubmit={submit} />
        ) : (
          <p className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
            You aren't assigned to a manager yet, so you can't request leave.
          </p>
        )}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">My requests</h2>
          <LeaveRequestList
            requests={requests}
            loading={loading}
            error={error}
            emptyMessage="You haven't requested any leave yet."
          />
        </section>
      </div>
    );
  }

  const isAdmin = role === "org_admin";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Leave</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {isAdmin ? "All requests in your organization" : "Pending requests from your team"}
        </h2>
        <LeaveRequestList
          requests={requests}
          loading={loading}
          error={error}
          emptyMessage={isAdmin ? "No leave requests yet." : "No pending requests from your team."}
          canReview
          showEmployee
          onReview={review}
        />
      </section>
    </div>
  );
}