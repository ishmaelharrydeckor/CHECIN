import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { firestoreDb } from "@/integrations/firebase/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays } from "lucide-react";

interface LeaveRow {
  id: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  note?: string;
  createdAt?: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-[#E8FCE4] text-[#122300]",
  denied: "bg-rose-100 text-rose-900",
  rejected: "bg-rose-100 text-rose-900",
};

/**
 * Reads the caller's own leave_requests straight from Firestore. The rules
 * only allow this when orgId (claim) and employeeId (uid) both match, so the
 * query constrains both. orgId comes from the verified token claims via
 * useAuth, never from user input. Sorted client-side to avoid depending on
 * an index or on every doc having createdAt.
 */
export function MyLeave({ uid, orgId }: { uid: string; orgId?: string }) {
  const [rows, setRows] = useState<LeaveRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    getDocs(
      query(
        collection(firestoreDb, "leave_requests"),
        where("orgId", "==", orgId),
        where("employeeId", "==", uid),
      ),
    )
      .then((snap) => {
        if (!active) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaveRow, "id">) }));
        list.sort((a, b) =>
          String(b.createdAt || b.startDate || "").localeCompare(String(a.createdAt || a.startDate || "")),
        );
        setRows(list.slice(0, 10));
      })
      .catch(() => active && setError("Could not load your leave requests."));
    return () => {
      active = false;
    };
  }, [uid, orgId]);

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="size-4" /> My Leave
          </CardTitle>
          <CardDescription className="text-xs">Your most recent requests and their status.</CardDescription>
        </div>
        <Button asChild size="sm" className="bg-[#0E2322] hover:bg-[#163331] text-[#C0FD9B] text-xs shrink-0">
          <a href="/leave">Request leave</a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : rows === null ? (
          <Skeleton className="h-14 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No leave requests yet.</p>
        ) : (
          rows.map((r) => {
            const status = (r.status || "pending").toLowerCase();
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#0E2322] capitalize">{r.type || "Leave"}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.startDate} → {r.endDate}
                  </div>
                  {r.note && <div className="text-xs text-slate-600 mt-1 break-words">{r.note}</div>}
                </div>
                <Badge className={`border-none capitalize shrink-0 ${STATUS_STYLE[status] || "bg-slate-100 text-slate-700"}`}>
                  {status}
                </Badge>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}