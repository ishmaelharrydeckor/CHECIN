import { createFileRoute } from "@tanstack/react-router";
import { ReportsHub } from "@/components/reports/ReportsHub";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "Reports — ChecIN" },
      { name: "description", content: "Timesheets, the attendance register and the leave ledger, with downloads." },
    ],
  }),
  component: ReportsHubPage,
});

function ReportsHubPage() {
  const { isOrgAdmin, isManager } = useAuth();

  // Anyone else is sent away by the app shell; show nothing meanwhile.
  if (!isOrgAdmin && !isManager) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Preview a report, or generate it as a file for a ready-made period. What you see is always limited to{" "}
          {isOrgAdmin ? "your organization" : "your team"}.
        </p>
      </div>
      <ReportsHub isOrgAdmin={isOrgAdmin} />
    </div>
  );
}
