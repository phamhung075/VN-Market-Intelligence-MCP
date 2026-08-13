/** Option/result types for postSignalWithCriticGate() — split out of criticGate.ts for size. */

import type { CriticInput, CriticResult } from "../../../domain/services/tnbCriticScorer.js";

/**
 * Options for postSignalWithCriticGate.
 * Primarily used for testing — allows injecting a custom scorer and timeout.
 */
export interface PostSignalWithGateOptions {
  /**
   * Number of retries already attempted. Pass 1 to force write-through regardless
   * of score (max 1 retry enforced by the gate).
   * Default: 0
   */
  retryCount?: number;
  /**
   * Injectable scorer function (for testing). Defaults to scoreWithTnbCritic.
   * Must return a Promise<CriticResult>.
   */
  _scoreFn?: (input: CriticInput) => Promise<CriticResult> | CriticResult;
  /**
   * Timeout in milliseconds before gate fails-soft. Defaults to CRITIC_TIMEOUT_MS (20s).
   */
  _timeoutMs?: number;
}

/** Return type for postSignalWithCriticGate. */
export interface PostSignalGateResult {
  /**
   * The newly inserted signal ID (positive integer).
   * Returns -1 when the gate rejected the signal on first attempt (retry pending).
   */
  signalId: number;
  /**
   * The CriticResult produced by the gate.
   * null when the gate was bypassed (timeout/error) — signal passes through unscored.
   */
  criticResult: CriticResult | null;
}
