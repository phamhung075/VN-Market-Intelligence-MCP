/**
 * Intelligence Cycle — Step 0/A4 default production impl: getWatchlistCodes
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted verbatim from
 * intelligenceCycleJob.ts. Injected via
 * `deps.getWatchlistCodesFn ?? defaultGetWatchlistCodes` in the
 * orchestrator's `_runCycle`.
 */

export async function defaultGetWatchlistCodes(): Promise<string[]> {
  const { getDb } = await import("../../../../infrastructure/db/schema.js");
  const db = getDb();
  const rows = db.prepare("SELECT code FROM watchlist").all() as Array<{ code: string }>;
  return rows.map((r) => r.code);
}
