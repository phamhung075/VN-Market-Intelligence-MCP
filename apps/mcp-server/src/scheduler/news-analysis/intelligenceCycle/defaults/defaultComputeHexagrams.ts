/**
 * Intelligence Cycle — Step A4 default production impl: computeHexagrams
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted verbatim from
 * intelligenceCycleJob.ts. Injected via
 * `deps.computeHexagramsFn ?? defaultComputeHexagrams` in the orchestrator's
 * `_runCycle`.
 *
 * CRITICAL INVARIANT: `defaultComputeHexagrams` reads/writes the
 * module-level `_lastHexagramComputedAt` map below, and `resetHexagramCooldown`
 * mutates that SAME map. These two functions plus the map MUST stay in this
 * one module — splitting them apart silently breaks the cooldown closure.
 * `resetHexagramCooldown` is re-exported from intelligenceCycleJob.ts for
 * backward-compatible import paths (existing tests import it from there,
 * unchanged — zero call-site churn).
 */

import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Task 1501 — Per-stock 15-minute hexagram cooldown
// Prevents re-computing a reading for the same stock more than once per 15 min.
// ─────────────────────────────────────────────────────────────────────────────

const _lastHexagramComputedAt: Record<string, number> = {};
const HEXAGRAM_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

/** Reset the per-stock cooldown map (for test isolation). */
export function resetHexagramCooldown(): void {
  for (const key of Object.keys(_lastHexagramComputedAt)) {
    delete _lastHexagramComputedAt[key];
  }
}

/**
 * Task 303 — Step A4 production implementation.
 *
 * For each watchlist code:
 *   1. Load the previous reading (for Markov transition recording)
 *   2. Compute 6 hao scores from local SQLite (no HTTP)
 *   3. Compute a preliminary reading to get the current hexagram number
 *   4. Fetch Markov transition data for the current hexagram
 *   5. Compute the final reading with Markov context
 *   6. Store the reading with source='cycle'
 *   7. Record the hexagram transition (if a previous reading exists)
 *
 * Per-stock errors are caught and logged at WARN level; the loop continues
 * for remaining codes. The returned count reflects only successful stores.
 *
 * Mirrors the pattern used in the `get_kinhdich_reading` MCP tool.
 */
export async function defaultComputeHexagrams(codes: string[]): Promise<number> {
  const { computeHaoScores } = await import(
    "../../../../interface/mcp/tools/kinhdich/kinhDichTools.js"
  );
  const { computeReading } = await import(
    "../../../../domain/services/kinhDich/kinhDichReading.js"
  );
  const { getTopTransitions } = await import(
    "../../../../infrastructure/db/hexagramStore.js"
  );
  const { QUE_META } = await import(
    "../../../../domain/services/kinhDich/hexagramLibrary.js"
  );
  const {
    getLatestReading,
    storeReading,
    recordTransition,
  } = await import("../../../../infrastructure/db/hexagramStore.js");

  let computed = 0;

  for (const code of codes) {
    // Task 1501: per-stock 15-min cooldown — skip if computed recently
    const lastAt = _lastHexagramComputedAt[code] ?? 0;
    if (lastAt > 0 && Date.now() - lastAt < HEXAGRAM_COOLDOWN_MS) {
      logger.debug("[intelligence-cycle] step A4 — cooldown active, skipping stock", { code });
      continue;
    }

    try {
      // 1. Previous reading (for Markov)
      const previousReading = getLatestReading(code);

      // 2. Compute 6 hao scores from local SQLite
      const scores = computeHaoScores(code);

      // 3. Preliminary reading to get current hexagram number
      const prelimReading = computeReading(code, scores, null);
      const currentHexagram = prelimReading.queChiNh.number;

      // 4. Markov transition data
      let markovData = null;
      try {
        const tops = getTopTransitions(currentHexagram, code, 1);
        if (tops.length > 0 && tops[0]!.probability > 0) {
          const meta = QUE_META.find((q) => q.id === tops[0]!.toHexagram);
          markovData = {
            nextMostLikely: tops[0]!.toHexagram,
            nextName: meta?.name ?? `Que ${tops[0]!.toHexagram}`,
            probability: tops[0]!.probability,
          };
        }
      } catch { /* best-effort — no Markov data on first run */ }

      // 5. Final reading with Markov context
      const reading = computeReading(code, scores, markovData);

      // 6. Store with source='cycle'
      storeReading({
        stockCode: code,
        hexagramNumber: reading.queChiNh.number,
        hoQueNumber: reading.hoQue.number,
        bienQueNumber: reading.bienQue.number,
        haoStates: JSON.stringify(reading.haos.map((h) => h.state)),
        rawScores: JSON.stringify(scores),
        nguHanhDynamic: reading.nguHanh.dynamic,
        tradingSignal: reading.queChiNh.tradingSignal,
        confidence: reading.queChiNh.confidence,
        actionNote: reading.actionNote,
        source: 'cycle',
      });

      // 7. Record transition if previous reading exists
      if (previousReading) {
        recordTransition(
          previousReading.hexagramNumber,
          reading.queChiNh.number,
          code,
        );
      }

      _lastHexagramComputedAt[code] = Date.now();
      computed++;
    } catch (err) {
      logger.warn("[intelligence-cycle] step A4 — failed for stock", {
        code,
        error: err instanceof Error ? err.message : String(err),
      });
      // Per-stock errors are non-fatal; the outer batch-level try/catch
      // handles timeouts and increments the cycle's `errors` counter.
    }
  }

  return computed;
}
