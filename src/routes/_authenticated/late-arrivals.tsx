import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { LateReviewPanel } from "@/components/late/LateReviewPanel";

export const Route = createFileRoute("/_authenticated/late-arrivals")({
  head: () => ({ meta: [{ title: "Late arrivals — ChecIN" }] }),
  component: LateArrivalsPage,
});

function LateArrivalsPage() {
  const { isOrgAdmin, isManager } = useAuth();

  // Anyone else is sent away by the app shell; show nothing meanwhile.
  if (!isOrgAdmin && !isManager) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Late arrivals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Review late check-ins and excuse the ones that were not the person's fault.
        </p>
      </div>
      <LateReviewPanel />
    </div>
  );
}
