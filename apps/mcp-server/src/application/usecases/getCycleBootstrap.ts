/**
 * getCycleBootstrap — Task 1563 (Sprint 226)
 *
 * Compound use case replacing the 3-call opening sequence for all Cowork agents.
 * Calls get_agent_signals + get_market_context(24h) + get_system_status in parallel.
 * Partial failure: Promise.allSettled; failed slots set error key, return null.
 *
 * Performance target: ≤3s p95 (all SQLite reads, no network).
 */

import type { Database } from "bun:sqlite";
import { getSignals } from "../../infrastructure/db/agentSignalStore.js";
import {
  buildMarketContextText,
  buildSystemStatusText,
} from "../../domain/services/marketContextBuilder.js";

export const VALID_AGENT_NAMES = [
  "news-scout",
  "financial-analyst",
  "market-watcher",
  "alert-commander",
  "digest-predict",
  "qa-responder",
  "unified-agent",
  "report-analyzer",
  "bctc-analyst",
] as const;

export type ValidAgentName = (typeof VALID_AGENT_NAMES)[number];

export interface BootstrapError {
  agent_signals?: string;
  market_context?: string;
  system_status?: string;
}

export interface SubCallTimings {
  agent_signals_ms: number | string; // number for fulfilled, "5000+" for timeout
  market_context_ms: number | string;
  system_status_ms: number | string;
}

export interface BootstrapResult {
  agent_signals: unknown[];
  market_context: string | null;
  system_status: string | null;
  error?: BootstrapError;
  elapsed_ms: number; // Total wall-clock time in milliseconds
  sub_call_timings: SubCallTimings; // Per-call timing breakdown
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
    ),
  ]);
}

export async function getCycleBootstrap(
  db: Database,
  agentName: ValidAgentName,
): Promise<BootstrapResult> {

  const HOURS_BACK = 24;
  const startTotal = Date.now();

  // Measure each sub-call independently
  const startSignals = Date.now();
  const signalsResult = await Promise.race([
    Promise.resolve(getSignals(db, agentName)),
    new Promise<{ status: "rejected"; reason: Error }>(
      (_, reject) =>
        setTimeout(
          () => reject(new Error("Agent signals timeout")),
          5000,
        ),
    ),
  ]).then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason }),
  );
  const agent_signals_ms = Math.max(1, Date.now() - startSignals);

  const startContext = Date.now();
  const contextResult = await Promise.race([
    Promise.resolve(buildMarketContextText(db, HOURS_BACK)),
    new Promise<string>(
      (_, reject) =>
        setTimeout(
          () => reject(new Error("Market context timeout")),
          5000,
        ),
    ),
  ]).then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason }),
  );
  const market_context_ms = Math.max(1, Date.now() - startContext);

  const startStatus = Date.now();
  const statusResult = await Promise.race([
    Promise.resolve(buildSystemStatusText(db)),
    new Promise<string>(
      (_, reject) =>
        setTimeout(
          () => reject(new Error("System status timeout")),
          5000,
        ),
    ),
  ]).then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason }),
  );
  const system_status_ms = Math.max(1, Date.now() - startStatus);

  const result: BootstrapResult = {
    agent_signals: [],
    market_context: null,
    system_status: null,
    elapsed_ms: Math.max(1, Date.now() - startTotal),
    sub_call_timings: {
      agent_signals_ms: signalsResult.status === "fulfilled" ? agent_signals_ms : "5000+",
      market_context_ms: contextResult.status === "fulfilled" ? market_context_ms : "5000+",
      system_status_ms: statusResult.status === "fulfilled" ? system_status_ms : "5000+",
    },
  };

  const errors: BootstrapError = {};

  if (signalsResult.status === "fulfilled") {
    result.agent_signals = signalsResult.value as unknown[];
  } else {
    errors.agent_signals = String(signalsResult.reason);
  }

  if (contextResult.status === "fulfilled") {
    result.market_context = contextResult.value;
  } else {
    errors.market_context = String(contextResult.reason);
  }

  if (statusResult.status === "fulfilled") {
    result.system_status = statusResult.value;
  } else {
    errors.system_status = String(statusResult.reason);
  }

  if (Object.keys(errors).length > 0) {
    result.error = errors;
  }

  return result;
}
