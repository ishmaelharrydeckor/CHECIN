import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authedGet } from "./api";

interface Notice {
  id: string;
  title: string;
  body: string;
  scope: string;
  createdAt: string;
  isImportant: boolean;
}

const SHOWN = 5;

/** Visibility (organization-wide and own team) is enforced by /api/announcements; this only renders it. */
export function MyNotices({ uid }: { uid: string }) {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setNotices(null);
    setError(null);
    authedGet<{ announcements: Notice[] }>("/api/announcements/")
      .then((d) => active && setNotices((d.announcements ?? []).slice(0, SHOWN)))
      .catch(() => active && setError("Couldn't load your notices."));
    return () => {
      active = false;
    };
  }, [uid, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Megaphone className="size-4" aria-hidden="true" /> My notices
        </CardTitle>
        <CardDescription className="text-xs">The latest company and team announcements.</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div role="alert" className="space-y-3 py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" className="border-slate-200 text-xs" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : notices === null ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : notices.length === 0 ? (
          <div className="space-y-3 py-12 text-center">
            <Megaphone className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm font-medium">No notices right now</p>
            <p className="text-xs text-muted-foreground">New announcements from your manager will show up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {notices.map((n) => (
              <li key={n.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                    {n.scope}
                  </span>
                  {n.isImportant && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">
                      Important
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">{new Date(n.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground whitespace-pre-line break-words line-clamp-4">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
