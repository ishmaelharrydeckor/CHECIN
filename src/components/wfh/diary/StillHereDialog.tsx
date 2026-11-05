import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LIVENESS_RESPONSE_MS } from "@/lib/wfh-diary";
import { secondsLeft } from "@/lib/wfh-diary-ui";
import type { DiaryCheck } from "./diaryApi";

/** The "still here?" check. One tap answers it; it closes itself when its 90 seconds run out. */
export function StillHereDialog(input: {
  check: DiaryCheck | null;
  offsetMs: number;
  onAnswer: (check: DiaryCheck) => Promise<string | null>;
  onExpired: () => void;
}) {
  const { check, offsetMs, onAnswer, onExpired } = input;
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!check) return;
    setError(null);
    // Start the countdown from now, not from when the page loaded.
    setNow(Date.now() + offsetMs);
    const t = window.setInterval(() => setNow(Date.now() + offsetMs), 1000);
    return () => window.clearInterval(t);
  }, [check, offsetMs]);

  const left = check ? secondsLeft(check.dueAtMs, now, LIVENESS_RESPONSE_MS) : 0;
  useEffect(() => {
    if (check && left === 0) onExpired();
  }, [check, left, onExpired]);

  async function answer() {
    if (!check) return;
    setBusy(true);
    const problem = await onAnswer(check);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <AlertDialog open={check !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still here?</AlertDialogTitle>
          <AlertDialogDescription>
            Tap the button to confirm you are at your device. {left > 0 ? `${left} seconds left.` : "Time is up."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogAction
            disabled={busy || left === 0}
            onClick={(e) => {
              e.preventDefault();
              void answer();
            }}
            className="h-10"
          >
            {busy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            I'm here
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
