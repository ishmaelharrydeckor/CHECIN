import { waitUntil } from "@vercel/functions";

/**
 * Lets work carry on after the response has been sent, without it being cut off.
 *
 * On Vercel a function can be frozen the moment it replies, so a plain "send and forget" promise
 * (like pushing an announcement to a team) may never finish. `waitUntil` tells the platform to keep
 * the function alive until the work is done. A failure is logged, never silently dropped.
 */
export function runInBackground(work: Promise<unknown>, label: string): void {
  const guarded = work.catch((err) => {
    console.error(`[background] ${label} failed:`, err);
  });
  try {
    waitUntil(guarded);
  } catch {
    // Not running on Vercel (local dev): the promise simply carries on by itself.
  }
}
