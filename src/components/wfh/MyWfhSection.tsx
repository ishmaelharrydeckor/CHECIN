import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { authedFetch } from "@/components/shifts/shiftApi";
import { MyWfhCard } from "@/components/wfh/MyWfhCard";
import type { MyWfh } from "@/lib/wfh-types";

/** Connects the work-from-home card to the server. The card itself only draws and asks. */
export function MyWfhSection() {
  const [data, setData] = useState<MyWfh | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await authedFetch<MyWfh>("/api/wfh");
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The card shows a thrown message under its form, so turn a failed answer into one.
  async function declare(days: string[]) {
    const result = await authedFetch<{ written: number }>("/api/wfh", {
      method: "POST",
      body: JSON.stringify({ days }),
    });
    if (!result.ok) throw new Error(result.error);
    await load();
  }

  async function cancel(dayKey: string) {
    const result = await authedFetch<{ ok: true }>("/api/wfh", {
      method: "DELETE",
      body: JSON.stringify({ dayKey }),
    });
    if (!result.ok) throw new Error(result.error);
    await load();
  }

  return (
    <div className="space-y-2">
      <MyWfhCard
        data={data}
        loading={loading && data === null}
        error={error}
        onDeclare={declare}
        onCancel={cancel}
        onRetry={() => void load()}
        today={data?.today}
      />
      <p className="text-xs text-muted-foreground">
        Working from home today? Open your{" "}
        <Link to="/wfh-diary" className="font-medium text-[#0E2322] underline underline-offset-2">
          work diary
        </Link>{" "}
        to start your session.
      </p>
    </div>
  );
}
