/**
 * The loop behind the nightly pattern refill. Pure: the actual filling (`fillDuePatterns`) is passed in, so
 * every stopping rule can be tested without a database.
 *
 * Each batch fills the patterns that are furthest behind, up to `batchSize`. We keep going until nothing is
 * left, but never forever: the loop stops when a batch changes nothing (so one broken pattern cannot make it
 * spin), when the time budget is used up, or after a fixed number of batches. Anything left over is picked up
 * by the next night's run, or sooner when someone opens the Rota (which tops up their own team).
 */

export interface RefillBatch {
  /** Patterns that were due and looked at. */
  checked: number;
  /** Assignments written. */
  written: number;
  /** Patterns that could not be filled (they are logged and skipped, never fatal). */
  failed: number;
}

export type RefillStop = "done" | "no_progress" | "time" | "batches";

export interface RefillSummary extends RefillBatch {
  batches: number;
  /** True when some due patterns were left for the next run. */
  partial: boolean;
  stoppedBecause: RefillStop;
}

export const REFILL_BATCH_SIZE = 200;
export const REFILL_MAX_BATCHES = 25;
export const REFILL_BUDGET_MS = 20_000;

export async function runRefill(
  fill: (max: number) => Promise<RefillBatch>,
  opts: { batchSize?: number; maxBatches?: number; budgetMs?: number; now?: () => number } = {},
): Promise<RefillSummary> {
  const batchSize = Math.max(1, Math.floor(opts.batchSize ?? REFILL_BATCH_SIZE));
  const maxBatches = Math.max(1, Math.floor(opts.maxBatches ?? REFILL_MAX_BATCHES));
  const budgetMs = opts.budgetMs ?? REFILL_BUDGET_MS;
  const now = opts.now ?? Date.now;
  const started = now();

  const total: RefillBatch = { checked: 0, written: 0, failed: 0 };
  let batches = 0;

  for (;;) {
    if (batches >= maxBatches) return { ...total, batches, partial: true, stoppedBecause: "batches" };
    if (batches > 0 && now() - started >= budgetMs) return { ...total, batches, partial: true, stoppedBecause: "time" };

    const batch = await fill(batchSize);
    batches++;
    total.checked += batch.checked;
    total.written += batch.written;
    total.failed += batch.failed;

    // Fewer due patterns than a full batch means there is nothing left.
    if (batch.checked < batchSize) return { ...total, batches, partial: false, stoppedBecause: "done" };
    // A full batch that wrote nothing would come straight back next time: stop rather than spin.
    if (batch.written === 0) return { ...total, batches, partial: true, stoppedBecause: "no_progress" };
  }
}
