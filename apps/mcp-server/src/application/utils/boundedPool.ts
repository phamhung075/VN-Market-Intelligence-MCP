/**
 * boundedPool.ts — Bounded Concurrency Pool Utility
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: application (pure async utility, no I/O)
 *
 * Migrated from bctcRefineJob.ts per §0.7.4 (Option-Y ruling):
 * runBoundedPool() lives here so it can be reused by the fleet cron flow
 * without coupling to the scheduler layer.
 *
 * p-limit style semaphore: never spawns more than `concurrency` tasks
 * simultaneously. All tasks run to completion — failures are captured in
 * results, never thrown. Memory-bounded for the 8 GB host constraint.
 *
 * @module application/utils/boundedPool
 */

/**
 * Run tasks with bounded concurrency (p-limit style semaphore).
 *
 * @param items       Array of items to process
 * @param concurrency Maximum simultaneous tasks (from REFINE_FANOUT_CONCURRENCY)
 * @param fn          Async task function; must never throw (capture errors internally)
 * @returns           Array of results in the same order as items
 */
export async function runBoundedPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) break;
      results[index] = await fn(items[index]!);
    }
  }

  const poolSize = Math.min(concurrency, items.length);
  if (poolSize === 0) return results;

  const workers: Promise<void>[] = [];
  for (let i = 0; i < poolSize; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}
