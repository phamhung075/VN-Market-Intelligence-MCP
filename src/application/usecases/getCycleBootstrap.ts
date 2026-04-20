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
] as const;

export type ValidAgentName = (typeof VALID_AGENT_NAMES)[number];

export interface BootstrapError {
  agent_signals?: string;
  market_context?: string;
  system_status?: string;
}

export interface BootstrapResult {
  agent_signals: unknown[];
  market_context: string | null;
  system_status: string | null;
  error?: BootstrapError;
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

  const [signalsResult, contextResult, statusResult] = await Promise.allSettled([
    withTimeout(Promise.resolve(getSignals(db, agentName)), 5000),
    withTimeout(Promise.resolve(buildMarketContextText(db, HOURS_BACK)), 5000),
    withTimeout(Promise.resolve(buildSystemStatusText(db)), 5000),
  ]);

  const result: BootstrapResult = {
    agent_signals: [],
    market_context: null,
    system_status: null,
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
