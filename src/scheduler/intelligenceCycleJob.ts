/**
 * Intelligence Cycle Job — unified 15-min polling cycle
 *
 * Runs every 15 minutes. During market hours (Mon-Fri 09:00-15:30 GMT+7),
 * runs the full 6-step cycle (A→F). Off-hours: news poll only (step A).
 *
 * Steps:
 *   A  — pollNews (5 sources + commodity auto-extraction)
 *   B  — checkSscReports (SSC portal scan)
 *   C  — fetchHosePrices (prices for watchlist + sector context peers)
 *   D  — runImpactChain (cascade analysis)
 *   E  — sendAlerts (push HIGH/CRITICAL via Telegram)
 *   F  — chainSynthesis (server-side — zero Claude API tokens)
 *
 * Step F groups agent_signals by stock within the current 15-min cycle window.
 * When 2+ agents have posted findings for the same stock, the chain synthesizer
 * produces a SynthesizedChain. High-conviction chains (>= 0.7) are posted back
 * as verified_chain signals for the Alert Commander to pick up.
 */

import { logger } from "../infrastructure/logger.js";
import { getDb } from "../infrastructure/db/schema.js";
import {
  getChainFindings,
  postSignal,
  computeCycleId,
  type ChainFinding,
} from "../infrastructure/db/agentSignalStore.js";
import { synthesizeChain } from "../domain/services/chainSynthesizer.js";

// ── Types ─────────────────────────────────────────────────────────────────────

const STEP_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per step

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wraps a promise with a timeout. If the promise does not settle within
 * `timeoutMs`, it rejects with a timeout error.
 */
function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number = STEP_TIMEOUT_MS,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[timeout] ${label} exceeded ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

// ── Concurrency guard ─────────────────────────────────────────────────────────

let _running = false;
let _startedAt = 0;
const STALE_MS = 14 * 60 * 1000; // 14-min stale auto-release

// ── Step F: Chain Synthesis ────────────────────────────────────────────────────

/**
 * Step F: Server-side chain synthesis.
 *
 * Groups all agent_signals in the current 15-min cycle window by stock_code.
 * For any stock with 2+ independent agent findings, runs synthesizeChain().
 * High-conviction chains (>= 0.7) are posted as verified_chain signals for
 * the Alert Commander.
 *
 * This runs with zero Claude API tokens — purely rule-based domain logic.
 */
export async function runChainSynthesis(): Promise<void> {
  const db = getDb();
  const cycleId = computeCycleId();

  const findings = getChainFindings(db, cycleId);
  if (findings.length === 0) return;

  // Group by stock_code (skip null)
  const byStock = new Map<string, ChainFinding[]>();
  for (const f of findings) {
    if (!f.stockCode) continue;
    const arr = byStock.get(f.stockCode) ?? [];
    arr.push(f);
    byStock.set(f.stockCode, arr);
  }

  let synthesized = 0;

  for (const [stock, links] of byStock) {
    if (links.length < 2) continue;

    const chain = synthesizeChain(
      links.map(f => ({
        id: f.id,
        agent: f.fromAgent,
        signalType: f.signalType,
        stockCode: f.stockCode,
        findingData: f.findingData,
        depth: f.chainDepth,
        createdAt: f.createdAt,
      })),
    );

    if (!chain) continue;

    if (chain.conviction >= 0.7) {
      postSignal(db, {
        fromAgent: "chain-synthesizer",
        toAgent: "alert-commander",
        signalType: "verified_chain",
        stockCode: stock,
        payload: {
          title: chain.narrative.slice(0, 100),
          detail: chain.narrative,
        },
        findingData: chain as unknown as Record<string, unknown>,
        cycleId,
        chainDepth: 3,
        ttlMinutes: 60,
      });
      synthesized++;

      logger.info("[chainSynthesis] verified_chain posted", {
        stock,
        conviction: chain.conviction,
        action: chain.action,
        chainLength: chain.chainLength,
        agents: chain.agents,
      });
    }
  }

  if (synthesized > 0) {
    logger.info("[chainSynthesis] cycle complete", {
      cycleId,
      totalFindings: findings.length,
      stocksWithChains: byStock.size,
      synthesized,
    });
  }
}

// ── Main cycle entry ───────────────────────────────────────────────────────────

/**
 * Runs the full intelligence cycle. Called by the 15-min cron job.
 *
 * Steps A-E are stubs in this minimal implementation — they will be filled
 * in as the corresponding infrastructure adapters are built.
 * Step F (chain synthesis) is fully implemented.
 */
export async function runIntelligenceCycle(): Promise<void> {
  // Stale guard auto-release
  if (_running) {
    const age = Date.now() - _startedAt;
    if (age < STALE_MS) {
      logger.warn("[intelligenceCycle] skipped — previous cycle still running", { ageMs: age });
      return;
    }
    logger.warn("[intelligenceCycle] stale lock detected — releasing", { ageMs: age });
    _running = false;
  }

  _running = true;
  _startedAt = Date.now();

  try {
    const cycleId = computeCycleId();
    logger.info("[intelligenceCycle] starting", { cycleId });

    // Step F: Chain synthesis (server-side, zero Claude API tokens)
    try {
      await withTimeout(runChainSynthesis(), "step F chainSynthesis");
    } catch (err) {
      // Non-fatal — chain synthesis failure should not block other steps
      logger.warn("[intelligenceCycle] step F failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const elapsed = Date.now() - _startedAt;
    logger.info("[intelligenceCycle] cycle complete", { cycleId, elapsedMs: elapsed });
  } finally {
    _running = false;
  }
}
