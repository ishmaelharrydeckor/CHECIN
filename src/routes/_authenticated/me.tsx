import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MyLeave } from "@/components/me/MyLeave";
import { MyNotices } from "@/components/me/MyNotices";
import { MyTimesheet } from "@/components/me/MyTimesheet";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({
    meta: [
      { title: "My page — ChecIN" },
      { name: "description", content: "Your timesheet, leave and notices in one place." },
    ],
  }),
  component: MePage,
});

function MePage() {
  const { user, orgId, loading } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">My page</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your timesheet, leave and notices in one place.</p>
        </div>
        <Button asChild className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium self-start sm:self-auto">
          <Link to="/scan">Scan to check in</Link>
        </Button>
      </div>

      {loading || !user ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-40 w-full rounded-3xl" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <>
          <MyTimesheet uid={user.id} />
          <MyLeave uid={user.id} orgId={orgId} />
          <MyNotices uid={user.id} />
        </>
      )}
    </div>
  );
}
