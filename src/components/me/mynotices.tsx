import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone } from "lucide-react";
import { authedGet } from "./api";

interface Notice {
  id: string;
  title: string;
  body: string;
  scope: string;
  createdAt: string;
  isImportant: boolean;
}

/** Visibility (org-wide + own team) is enforced by /api/announcements; we just render it. */
export function MyNotices({ uid }: { uid: string }) {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authedGet<{ announcements: Notice[] }>("/api/announcements/")
      .then((d) => active && setNotices((d.announcements ?? []).slice(0, 5)))
      .catch((e) => active && setError(e.message || "Could not load notices."));
    return () => {
      active = false;
    };
  }, [uid]);

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Megaphone className="size-4" /> My Notices
        </CardTitle>
        <CardDescription className="text-xs">Company and team announcements.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : notices === null ? (
          <Skeleton className="h-14 w-full" />
        ) : notices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No notices right now.</p>
        ) : (
          notices.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl border p-3 ${n.isImportant ? "border-l-4 border-l-amber-500 border-slate-200" : "border-slate-200"}`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge className="bg-slate-100 text-slate-800 border-none">{n.scope}</Badge>
                {n.isImportant && <Badge className="bg-rose-100 text-rose-800 border-none">Priority</Badge>}
                <span className="text-[11px] text-muted-foreground">
                  {new Date(n.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="text-sm font-semibold text-[#0E2322]">{n.title}</div>
              <p className="text-xs text-slate-700 whitespace-pre-line break-words line-clamp-4">{n.body}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}