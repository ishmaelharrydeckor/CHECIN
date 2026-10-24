import { useEffect, useRef, useState } from "react";
import { clampSeconds, type SendStatus } from "@/lib/verify-email-screens";

/**
 * Seconds left before the email can be sent again.
 *
 * Starts counting down from `seconds` each time `status` becomes "sent", and
 * stops at 0. The only timer is this one-second tick, and it runs only while
 * the countdown is above 0.
 */
export function useCooldown(status: SendStatus, seconds: number): number {
  const [left, setLeft] = useState(0);
  const previous = useRef<SendStatus | null>(null);

  useEffect(() => {
    if (status === "sent" && previous.current !== "sent") setLeft(clampSeconds(seconds));
    previous.current = status;
  }, [status, seconds]);

  useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [left]);

  return left;
}
