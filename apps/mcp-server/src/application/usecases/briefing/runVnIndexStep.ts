/**
 * Morning Briefing — Step 2: best-effort VN-Index snapshot fetch.
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 * Failure never aborts the briefing — returns undefined on any error (behavior preserved verbatim).
 *
 * Layer: application/usecases/briefing — may import from infrastructure/.
 */
import { logger } from "../../../infrastructure/logger.js";
import type { VnIndexSnapshot } from "./types.js";

/**
 * Runs the best-effort VN-Index fetch.
 *
 * @param fetchVnIndexFn - Injectable override (tests); defaults to the real hose.js fetcher.
 * @returns VnIndexSnapshot, or undefined when the fetch fails or returns nothing.
 */
export async function runVnIndexStep(
  fetchVnIndexFn?: () => Promise<VnIndexSnapshot | null>,
): Promise<VnIndexSnapshot | undefined> {
  const vnIndexFn =
    fetchVnIndexFn ??
    (async () => {
      try {
        const { fetchVnIndex } = await import("../../../infrastructure/fetchers/hose.js");
        const result = await fetchVnIndex();
        if (result) {
          const snap: VnIndexSnapshot = {
            price: result.price,
            changePct: result.changePct,
          };
          if (result.previousPrice != null && result.previousPrice !== 0) {
            snap.change = Math.round(result.price - result.previousPrice);
          }
          return snap;
        }
        return null;
      } catch (err) {
        logger.warn("[assembleBriefing] fetchVnIndex failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    });

  try {
    const result = await vnIndexFn();
    return result !== null && result !== undefined ? result : undefined;
  } catch (err) {
    logger.warn("[assembleBriefing] fetchVnIndex failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
