import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Clock, XCircle, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaveRequestForm } from "@/components/leave/LeaveRequestForm";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import { useLeaveIdentity } from "@/components/leave/useLeaveIdentity";
import { useLeaveRequests } from "@/components/leave/useLeaveRequests";
import { countDays, type LeaveRequest } from "@/lib/leave";

export const Route = createFileRoute("/_authenticated/leave")({
  head: () => ({
    meta: [
      { title: "Leave — ChecIN" },
      { name: "description", content: "Request, review and track leave." },
    ],
  }),
  component: LeavePage,
});

type Tone = "white" | "butter" | "mint";

const TILE_TONE: Record<Tone, { tile: string; icon: string; value: string }> = {
  white: {
    tile: "bg-white border-slate-200/80 text-slate-500",
    icon: "bg-slate-50 text-slate-700",
    value: "text-[#0E2322]",
  },
  butter: {
    tile: "bg-[#FCF2CB] border-[#F5E6B0] text-[#854D0E]",
    icon: "bg-white/60 text-[#854D0E]",
    value: "text-[#854D0E]",
  },
  mint: {
    tile: "bg-[#CBEED3] border-[#B2E2BD] text-[#0E2322]",
    icon: "bg-white/60 text-[#0E2322]",
    value: "text-[#0E2322]",
  },
};

function MetricTile({
  label,
  value,
  note,
  icon: Icon,
  tone = "white",
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  const t = TILE_TONE[tone];
  return (
    <div className={`flex flex-col justify-between rounded-3xl border p-6 shadow-xs ${t.tile}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
        <span className={`rounded-xl p-2 ${t.icon}`}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-4 text-3xl font-extrabold ${t.value}`}>{value}</p>
      <p className="mt-1 text-xs">{note}</p>
    </div>
  );
}

function sumDays(list: LeaveRequest[]): number {
  return list.reduce((total, r) => total + countDays(r.startDate, r.endDate), 0);
}

function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Leave</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function LeavePage() {
  const identity = useLeaveIdentity();

  if (identity.status === "loading") {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader subtitle="Loading your leave page." />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (identity.status === "signed-out") {
    return (
      <div className="space-y-6">
        <PageHeader subtitle="Sign in to see your leave." />
      </div>
    );
  }

  if (identity.status === "invalid") {
    return (
      <div className="space-y-6">
        <PageHeader subtitle="Request, review and track leave." />
        <p role="alert" className="py-12 text-center text-sm text-destructive">
          Your account isn&apos;t set up for an organization yet. Ask your administrator for help.
        </p>
      </div>
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

  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const denied = requests.filter((r) => r.status === "denied");
  const show = (n: number) => (loading || error ? "–" : String(n));

  if (role === "employee") {
    return (
      <div className="space-y-6">
        <PageHeader subtitle="Ask for time off and see what your manager decided." />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricTile
            label="Pending"
            value={show(pending.length)}
            note="Waiting for your manager"
            icon={Clock}
            tone="butter"
          />
          <MetricTile
            label="Approved"
            value={show(approved.length)}
            note="Requests approved"
            icon={CheckCircle2}
            tone="mint"
          />
          <MetricTile
            label="Days approved"
            value={show(sumDays(approved))}
            note="Across all approved requests"
            icon={CalendarDays}
          />
        </div>

        {identity.managerId ? (
          <LeaveRequestForm onSubmit={submit} />
        ) : (
          <p className="rounded-xl border border-[#F5E6B0] bg-[#FCF2CB] p-3 text-xs text-[#854D0E]">
            You aren&apos;t assigned to a manager yet, so you can&apos;t request leave. Ask your
            administrator.
          </p>
        )}

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">My requests</CardTitle>
            <CardDescription className="text-xs">Pending requests are listed first.</CardDescription>
          </CardHeader>
          <CardContent>
            <LeaveRequestList
              requests={requests}
              loading={loading}
              error={error}
              emptyMessage="You haven't requested any leave yet"
              emptyHint="Use the form above to send your first request."
              limited
              onRetry={() => window.location.reload()}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAdmin = role === "org_admin";

  return (
    <div className="space-y-6">
      <PageHeader
        subtitle={
          isAdmin
            ? "Every leave request across your organization."
            : "Approve or deny leave requests from your team."
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricTile
          label={isAdmin ? "Pending" : "Awaiting review"}
          value={show(pending.length)}
          note="Need a decision"
          icon={Clock}
          tone="butter"
        />
        {isAdmin ? (
          <>
            <MetricTile
              label="Approved"
              value={show(approved.length)}
              note="Requests approved"
              icon={CheckCircle2}
              tone="mint"
            />
            <MetricTile
              label="Denied"
              value={show(denied.length)}
              note="Requests denied"
              icon={XCircle}
            />
          </>
        ) : (
          <MetricTile
            label="Days requested"
            value={show(sumDays(pending))}
            note="Across pending requests"
            icon={CalendarDays}
          />
        )}
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {isAdmin ? "All requests" : "Pending requests"}
          </CardTitle>
          <CardDescription className="text-xs">
            {isAdmin ? "Pending requests are listed first." : "Requests from your team."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeaveRequestList
            requests={requests}
            loading={loading}
            error={error}
            emptyMessage={isAdmin ? "No leave requests yet" : "No pending requests"}
            emptyHint={
              isAdmin
                ? "Requests from your organization will show up here."
                : "When someone on your team asks for leave, it will show up here."
            }
            canReview
            showEmployee
            limited={isAdmin}
            onReview={review}
            onRetry={() => window.location.reload()}
          />
        </CardContent>
      </Card>
    </div>
  );
}