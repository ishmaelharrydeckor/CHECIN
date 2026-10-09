import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { MyTimesheet } from "@/components/me/MyTimesheet";
import { MyLeave } from "@/components/me/MyLeave";
import { MyNotices } from "@/components/me/MyNotices";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "My Page — ChecIN" }] }),
  component: MePage,
});

function MePage() {
  const { user, orgId, loading } = useAuth();

  if (loading || !user) {
    return <p className="text-sm text-muted-foreground p-6">Loading your page...</p>;
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[#0E2322] truncate">
            Hi, {user.displayName || "there"}
          </h1>
          <p className="text-xs text-muted-foreground">Your timesheet, leave and notices in one place.</p>
        </div>
        <Button asChild className="bg-[#0E2322] hover:bg-[#163331] text-[#C0FD9B] shrink-0">
          <Link to="/scan">Scan to check in</Link>
        </Button>
      </div>

      <MyTimesheet uid={user.id} />
      <MyLeave uid={user.id} orgId={orgId} />
      <MyNotices uid={user.id} />
    </div>
  );
}