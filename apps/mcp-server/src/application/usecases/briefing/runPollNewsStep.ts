/**
 * Morning Briefing — Step 1: best-effort pollNews prefetch.
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 * Failure never aborts the briefing — logged and swallowed (behavior preserved verbatim).
 *
 * Layer: application/usecases/briefing — may import from application/ and infrastructure/.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";

/**
 * Runs the best-effort news pre-fetch. Errors are caught and logged —
 * a pollNews failure must never abort the rest of the briefing.
 *
 * @param db          - Active SQLite Database.
 * @param pollNewsFn  - Injectable override (tests); defaults to the real pollNews use case.
 */
export async function runPollNewsStep(
  db: Database,
  pollNewsFn?: () => Promise<unknown>,
): Promise<void> {
  const pollFn =
    pollNewsFn ??
    (async () => {
      const { pollNews } = await import("../pollNews.js");
      return pollNews({ db });
    });

  try {
    await pollFn();
  } catch (err) {
    logger.warn("[assembleBriefing] pollNews failed — continuing without fresh data", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
