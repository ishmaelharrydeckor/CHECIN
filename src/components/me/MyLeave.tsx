import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { firestoreDb } from "@/integrations/firebase/config";
import type { LeaveRequest } from "@/lib/leave";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import { fromSnapshot, sortRequests } from "@/components/leave/useLeaveRequests";

const SHOWN = 5;

/**
 * The signed-in person's own latest leave requests. The query is limited to their own uid and
 * their organization (from the verified claims), which is what the Firestore rules require.
 * The rows, labels and status pills are the same ones the Leave page uses.
 */
export function MyLeave({ uid, orgId }: { uid: string; orgId?: string }) {
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    setLoading(true);
    setError(null);
    getDocs(
      query(
        collection(firestoreDb, "leave_requests"),
        where("orgId", "==", orgId),
        where("employeeId", "==", uid),
      ),
    )
      .then((snap) => {
        if (!active) return;
        const list = snap.docs.map(fromSnapshot).filter((r): r is LeaveRequest => r !== null);
        setRows(sortRequests(list).slice(0, SHOWN));
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Couldn't load your leave requests.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [uid, orgId, attempt]);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="size-4" aria-hidden="true" /> My leave
          </CardTitle>
          <CardDescription className="text-xs">Your latest requests and what your manager decided.</CardDescription>
        </div>
        <Button asChild className="shrink-0 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium">
          <Link to="/leave">Request leave</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <LeaveRequestList
          requests={rows}
          loading={loading}
          error={error}
          emptyMessage="You haven't requested any leave yet"
          emptyHint="Use Request leave to send your first request."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </CardContent>
    </Card>
  );
}
